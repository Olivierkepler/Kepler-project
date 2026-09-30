/**
 * Phase A1 — AgentRun domain + Firestore state tests.
 *
 * Pure domain/validation tests always run.
 * Firestore repository tests require ADC (same as firestoreSmokeTest).
 *
 * Run: npx tsx src/scripts/phaseAgentA1Test.ts
 */

import "../config/firebase.js";

import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  AgentRunError,
  buildFieldVarianceAgentRunId,
  buildFieldVarianceIdempotencyKey,
  canTransitionAgentRunStatus,
  isTerminalAgentRunStatus,
  type AgentRun,
  type CreateAgentRunInput,
} from "../domain/agentRun.js";
import {
  createAgentRunIfAbsent,
  getAgentRunById,
  updateAgentRunState,
} from "../repositories/agentRunsRepository.js";
import {
  applyAgentRunStateUpdate,
  buildQueuedAgentRun,
  normalizeAgentRun,
} from "../validation/agentRun.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${message}`);
}

function assertThrows(fn: () => void, message: string, code?: string): void {
  try {
    fn();
    failed += 1;
    console.error(`FAIL: ${message} (expected throw)`);
  } catch (error) {
    if (!(error instanceof AgentRunError)) {
      failed += 1;
      console.error(
        `FAIL: ${message} (expected AgentRunError, got ${String(error)})`,
      );
      return;
    }
    if (code !== undefined && error.code !== code) {
      failed += 1;
      console.error(
        `FAIL: ${message} (expected code ${code}, got ${error.code})`,
      );
      return;
    }
    passed += 1;
    console.log(`PASS: ${message}`);
  }
}

const NOW = "2026-08-23T04:00:00.000Z";

function validQueuedRaw(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "field-variance:delta-remote-1",
    schemaVersion: 1,
    ownerUid: "owner-a",
    projectId: "project-remote-1",
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: "delta-remote-1",
    idempotencyKey: "field-variance:delta-remote-1",
    status: "queued",
    currentStep: "queued",
    attemptCount: 0,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: "delta-remote-1",
      localDeltaId: "local-delta-1",
      remoteMeasurementId: "measurement-remote-1",
      localMeasurementId: "local-measurement-1",
      remotePlanItemId: "plan-remote-1",
    },
    pendingRequest: null,
    outcome: null,
    lastEvidenceId: null,
    errorCategory: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeCreateInput(
  remoteDeltaId: string,
  overrides: Partial<CreateAgentRunInput> = {},
): CreateAgentRunInput {
  return {
    ownerUid: "owner-a",
    projectId: "project-remote-1",
    triggerSourceId: remoteDeltaId,
    contextRefs: {
      remoteDeltaId,
      localDeltaId: "local-delta-1",
      remoteMeasurementId: "measurement-remote-1",
      localMeasurementId: "local-measurement-1",
      remotePlanItemId: "plan-remote-1",
    },
    maxAttempts: 5,
    ...overrides,
  };
}

function runPureTests(): void {
  console.log("\n=== Pure domain / validation ===\n");

  const queued = normalizeAgentRun(validQueuedRaw());
  assert(
    queued.status === "queued" && queued.currentStep === "queued",
    "1. valid queued AgentRun normalizes",
  );

  assertThrows(
    () => normalizeAgentRun(validQueuedRaw({ schemaVersion: 2 })),
    "2. invalid schemaVersion rejected",
    "invalid_schema_version",
  );

  assertThrows(
    () => normalizeAgentRun(validQueuedRaw({ status: "paused" })),
    "3. invalid status rejected",
    "invalid_status",
  );

  assertThrows(
    () => normalizeAgentRun(validQueuedRaw({ currentStep: "think_hard" })),
    "4. invalid step rejected",
    "invalid_step",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({ status: "queued", currentStep: "load_context" }),
      ),
    "5. invalid step/status combination rejected",
    "inconsistent_step_status",
  );

  assertThrows(
    () => normalizeAgentRun(validQueuedRaw({ attemptCount: -1 })),
    "6. attemptCount < 0 rejected",
    "invalid_attempt_count",
  );

  assertThrows(
    () => normalizeAgentRun(validQueuedRaw({ maxAttempts: 0 })),
    "7. maxAttempts <= 0 rejected",
    "invalid_max_attempts",
  );

  assertThrows(
    () =>
      normalizeAgentRun(validQueuedRaw({ attemptCount: 6, maxAttempts: 5 })),
    "8. attemptCount > maxAttempts rejected",
    "attempt_count_exceeds_max",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({
          contextRefs: {
            remoteDeltaId: "delta-remote-1",
            localDeltaId: "",
            remoteMeasurementId: "m",
            localMeasurementId: "lm",
            remotePlanItemId: "p",
          },
        }),
      ),
    "9. malformed contextRefs rejected",
    "invalid_context_refs",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({
          pendingRequest: {
            kind: "delta_evidence",
            message: "need photo",
            requestedAt: "not-a-date",
            requestId: "req-1",
        requestedProjectMemberId: null,
          },
        }),
      ),
    "10. malformed pendingRequest rejected",
    "invalid_pending_request",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({
          outcome: {
            kind: "summary_ready",
            summaryId: null,
            userVisibleRationale: "",
          },
        }),
      ),
    "11. malformed outcome rejected",
    "invalid_outcome",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({
          status: "completed",
          currentStep: "completed",
          completedAt: null,
        }),
      ),
    "12. terminal status requires completedAt",
    "invalid_completed_at",
  );

  assertThrows(
    () =>
      normalizeAgentRun(
        validQueuedRaw({
          status: "running",
          currentStep: "load_context",
          completedAt: NOW,
        }),
      ),
    "13. active status requires completedAt === null",
    "invalid_completed_at",
  );

  const keyA = buildFieldVarianceIdempotencyKey("delta-remote-1");
  const keyB = buildFieldVarianceIdempotencyKey("delta-remote-1");
  assert(
    keyA === keyB && keyA === "field-variance:delta-remote-1",
    "14. idempotency helper deterministic",
  );

  assert(
    buildFieldVarianceAgentRunId("delta-a") !==
      buildFieldVarianceAgentRunId("delta-b"),
    "15. different Delta IDs produce different AgentRun IDs",
  );

  assert(
    canTransitionAgentRunStatus("queued", "running"),
    "19. queued → running allowed",
  );
  assert(
    canTransitionAgentRunStatus("running", "waiting_for_evidence"),
    "20. running → waiting_for_evidence allowed",
  );
  assert(
    canTransitionAgentRunStatus("waiting_for_evidence", "running"),
    "21. waiting_for_evidence → running allowed",
  );
  assert(
    canTransitionAgentRunStatus("running", "completed"),
    "22. running → completed allowed",
  );
  assert(
    canTransitionAgentRunStatus("running", "failed"),
    "23. running → failed allowed",
  );
  assert(
    canTransitionAgentRunStatus("running", "escalated"),
    "24. running → escalated allowed",
  );
  assert(
    canTransitionAgentRunStatus("running", "queued"),
    "24b. running → queued allowed for transient provider requeue",
  );
  assert(
    !canTransitionAgentRunStatus("completed", "running"),
    "25. completed → running rejected",
  );
  assert(
    !canTransitionAgentRunStatus("failed", "running"),
    "26. failed → running rejected",
  );
  assert(
    canTransitionAgentRunStatus("failed", "waiting_for_evidence"),
    "26b. failed → waiting_for_evidence allowed for evidence recovery",
  );
  assert(
    isTerminalAgentRunStatus("failed"),
    "26c. failed remains terminal for start/resume guards",
  );
  assert(
    !canTransitionAgentRunStatus("escalated", "running"),
    "27. escalated → running rejected",
  );

  const base = buildQueuedAgentRun(makeCreateInput("delta-remote-pure"), NOW);
  const running = applyAgentRunStateUpdate(
    base,
    { status: "running", currentStep: "load_context" },
    NOW,
  );
  assert(running.status === "running", "transition helper queued → running");

  const completed: AgentRun = {
    ...running,
    status: "completed",
    currentStep: "completed",
    completedAt: NOW,
    outcome: {
      kind: "summary_ready",
      summaryId: null,
      userVisibleRationale: "done",
    },
  };

  assertThrows(
    () =>
      applyAgentRunStateUpdate(
        completed,
        { status: "running", currentStep: "load_context" },
        NOW,
      ),
    "25b. apply rejects completed → running",
    "illegal_status_transition",
  );

  const after = applyAgentRunStateUpdate(
    base,
    { status: "running", currentStep: "assess_variance" },
    NOW,
  );
  assert(
    after.ownerUid === base.ownerUid,
    "28. ownerUid not mutated through state update",
  );
  assert(
    after.projectId === base.projectId,
    "29. projectId not mutated through state update",
  );
  assert(
    JSON.stringify(after.contextRefs) === JSON.stringify(base.contextRefs),
    "30. contextRefs not mutated through ordinary state update",
  );
}

async function runFirestoreTests(): Promise<void> {
  console.log("\n=== Firestore repository ===\n");

  const remoteDeltaId = `a1-test-delta-${Date.now()}`;
  const agentRunId = buildFieldVarianceAgentRunId(remoteDeltaId);
  const input = makeCreateInput(remoteDeltaId, {
    ownerUid: "a1-test-owner",
    projectId: "a1-test-project",
  });

  try {
    const first = await createAgentRunIfAbsent(input);
    assert(first.created === true, "16. create first AgentRun → created");
    assert(first.agentRun.id === agentRunId, "16b. created id matches helper");

    const progressed = await updateAgentRunState(agentRunId, {
      status: "running",
      currentStep: "load_context",
    });
    assert(progressed.status === "running", "16c. state progressed to running");

    const second = await createAgentRunIfAbsent(input);
    assert(
      second.created === false,
      "17. create same AgentRun again → existing",
    );

    assert(
      second.agentRun.status === "running" &&
        second.agentRun.currentStep === "load_context" &&
        second.agentRun.attemptCount === 0,
      "18. duplicate create does not reset state",
    );

    const loaded = await getAgentRunById(agentRunId);
    assert(
      loaded !== undefined && loaded.status === "running",
      "getAgentRunById returns progressed run",
    );

    const waiting = await updateAgentRunState(agentRunId, {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest: {
        kind: "delta_evidence",
        message: "Add one field photo linked to this delta.",
        requestedAt: new Date().toISOString(),
        requestId: `${agentRunId}:request:evidence:v1`,
        requestedProjectMemberId: null,
      },
    });
    assert(
      waiting.status === "waiting_for_evidence",
      "repo: running → waiting_for_evidence",
    );

    const resumed = await updateAgentRunState(agentRunId, {
      status: "running",
      currentStep: "analyze_evidence",
      lastEvidenceId: "evidence-1",
      pendingRequest: null,
    });
    assert(
      resumed.status === "running",
      "repo: waiting_for_evidence → running",
    );

    const completed = await updateAgentRunState(agentRunId, {
      status: "completed",
      currentStep: "completed",
      outcome: {
        kind: "summary_ready",
        summaryId: `agent-summary:${agentRunId}`,
        userVisibleRationale: "Evidence reviewed; summary draft ready.",
      },
    });
    assert(
      completed.status === "completed" &&
        typeof completed.completedAt === "string",
      "repo: running → completed sets completedAt",
    );

    let terminalRejected = false;
    try {
      await updateAgentRunState(agentRunId, {
        status: "running",
        currentStep: "load_context",
      });
    } catch (error) {
      terminalRejected =
        error instanceof AgentRunError &&
        error.code === "illegal_status_transition";
    }
    assert(terminalRejected, "repo: completed → running rejected");

    assert(
      completed.ownerUid === input.ownerUid &&
        completed.projectId === input.projectId &&
        completed.contextRefs.remoteDeltaId === remoteDeltaId,
      "repo: ownerUid/projectId/contextRefs immutable",
    );
  } finally {
    await db.collection(COLLECTIONS.agentRuns).doc(agentRunId).delete();
  }
}

async function main(): Promise<void> {
  runPureTests();

  try {
    await runFirestoreTests();
  } catch (error) {
    failed += 1;
    console.error("FAIL: Firestore repository tests errored");
    console.error(error);
  }

  console.log(`\nA1 results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("phaseAgentA1Test: PASS");
}

main().catch((error: unknown) => {
  console.error("phaseAgentA1Test failed:");
  console.error(error);
  process.exitCode = 1;
});
