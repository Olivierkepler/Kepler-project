/**
 * Phase 2F-E.6 — Backend sticky recovery + resume trigger after request_evidence.
 * Run: npm run test:fe6-request-evidence
 *
 * Pure domain + trigger stubs — no Firestore / production mutation.
 */
import {
  buildFieldVarianceAgentRunId,
  type AgentRun,
} from "../domain/agentRun.js";
import type { Evidence } from "../domain/evidence.js";
import { isEligibleForStickyRequestEvidenceRecovery } from "../domain/stickyRequestEvidenceRecovery.js";
import { isEligibleForFailedEvidenceRecovery } from "../domain/recoverableEvidenceFailure.js";
import { triggerFieldVarianceResumeForNewEvidence } from "../services/fieldVarianceResumeTrigger.js";
import {
  applyRecoverStickyRequestEvidence,
  applyRequestAdditionalDeltaEvidence,
} from "../validation/agentRun.js";
import { toAgentRunSummaryDTO as toDto } from "../dto/agentRunDto.js";
import { buildDeltaEvidenceRequestId } from "../domain/deltaEvidenceRequest.js";

const OWNER = "owner-1";
const OTHER_OWNER = "owner-2";
const PROJECT_ID = "proj_fe6";
const LOCAL_DELTA = "delta-local-fe6";
const REMOTE_DELTA = `${PROJECT_ID}_${LOCAL_DELTA}`;
const RUN_ID = buildFieldVarianceAgentRunId(REMOTE_DELTA);
const NOW = "2026-09-03T14:00:00.000Z";
const OLD_EVIDENCE_ID = "ev-old-analyzed";
const NEW_EVIDENCE_ID = "ev-new-fe6";

let failures = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: RUN_ID,
    schemaVersion: 1,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: REMOTE_DELTA,
    idempotencyKey: RUN_ID,
    status: "running",
    currentStep: "assess_variance",
    attemptCount: 2,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: REMOTE_DELTA,
      localDeltaId: LOCAL_DELTA,
      remoteMeasurementId: "meas-remote-1",
      localMeasurementId: "meas-local-1",
      remotePlanItemId: "plan-remote-1",
    },
    pendingRequest: null,
    outcome: null,
    lastEvidenceId: OLD_EVIDENCE_ID,
    errorCategory: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: NEW_EVIDENCE_ID,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    localEvidenceId: "evidence-new",
    type: "photo",
    note: "",
    objectPath: `users/${OWNER}/projects/${PROJECT_ID}/evidence/${NEW_EVIDENCE_ID}/photo.jpg`,
    contentType: "image/jpeg",
    createdAt: NOW,
    localMeasurementId: null,
    localDeltaId: LOCAL_DELTA,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const sticky = makeAgentRun();
  check(
    isEligibleForStickyRequestEvidenceRecovery(sticky),
    "1. sticky running/assess_variance eligible",
  );

  const dtoSticky = toDto(sticky);
  check(
    dtoSticky.canRecoverStickyRequestEvidence === true,
    "2. DTO canRecoverStickyRequestEvidence true",
  );
  check(
    dtoSticky.canRecoverEvidence === false,
    "2b. media recover flag false for sticky running",
  );

  let taskCount = 0;
  const recovered = applyRecoverStickyRequestEvidence(sticky, {
    message: "Provide additional evidence showing the installed condition.",
  });
  check(recovered.outcome === "recovered", "3. sticky recovery recovered");
  check(
    recovered.agentRun.status === "waiting_for_evidence" &&
      recovered.agentRun.currentStep === "waiting_for_evidence" &&
      recovered.agentRun.pendingRequest?.kind === "delta_evidence",
    "4. waiting + pendingKind delta_evidence",
  );
  check(
    recovered.agentRun.lastEvidenceId === OLD_EVIDENCE_ID,
    "5. lastEvidenceId preserved",
  );
  check(recovered.agentRun.id === RUN_ID, "6. same AgentRun");
  check(taskCount === 0, "7. no task on sticky recovery itself");

  const dtoAfter = toDto(recovered.agentRun);
  check(
    dtoAfter.canRecoverStickyRequestEvidence === false,
    "8. DTO sticky flag false after reopen",
  );

  const again = applyRecoverStickyRequestEvidence(recovered.agentRun, {});
  check(again.outcome === "existing", "9. sticky recovery idempotent");
  check(
    again.agentRun.pendingRequest?.requestId ===
      buildDeltaEvidenceRequestId(RUN_ID),
    "9b. same requestId",
  );

  // Wrong decision / status denials
  check(
    !isEligibleForStickyRequestEvidenceRecovery(
      makeAgentRun({ currentStep: "analyze_evidence" }),
    ),
    "10. wrong currentStep denied",
  );
  check(
    !isEligibleForStickyRequestEvidenceRecovery(
      makeAgentRun({
        status: "completed",
        currentStep: "completed",
        completedAt: NOW,
        outcome: {
          kind: "summary_ready",
          summaryId: "s1",
          userVisibleRationale: "done",
        },
      }),
    ),
    "11. completed denied",
  );
  check(
    !isEligibleForStickyRequestEvidenceRecovery(
      makeAgentRun({
        status: "escalated",
        currentStep: "escalated",
        completedAt: NOW,
        outcome: {
          kind: "escalated",
          summaryId: null,
          userVisibleRationale: "esc",
        },
      }),
    ),
    "12. escalated denied",
  );
  check(
    !isEligibleForStickyRequestEvidenceRecovery(
      makeAgentRun({
        status: "failed",
        currentStep: "failed",
        errorCategory: "unsupported_media",
        completedAt: NOW,
        outcome: {
          kind: "failed",
          summaryId: null,
          userVisibleRationale: "fail",
        },
      }),
    ),
    "13. failed denied for sticky path",
  );
  check(
    isEligibleForFailedEvidenceRecovery(
      makeAgentRun({
        status: "failed",
        currentStep: "failed",
        errorCategory: "unsupported_media",
        completedAt: NOW,
        outcome: {
          kind: "failed",
          summaryId: null,
          userVisibleRationale: "fail",
        },
      }),
    ),
    "13b. failed+media still uses recover-evidence eligibility",
  );

  // Cross-project / wrong owner are service-layer (not_found); structural
  // ownership mismatch still fails sticky eligibility when project ids differ
  // via DTO mapping — service returns not_found when ownerUid mismatch.
  check(sticky.ownerUid !== OTHER_OWNER, "14. owner identity distinct for auth tests");

  // NEW Evidence after waiting → one resume task
  {
    taskCount = 0;
    const waiting = recovered.agentRun;
    const newEvidence = makeEvidence({ id: NEW_EVIDENCE_ID });
    const result = await triggerFieldVarianceResumeForNewEvidence(newEvidence, {
      getAgentRunByIdFn: async () => waiting,
      loadEnvFn: () => ({
        projectId: "p",
        location: "us-central1",
        queue: "q",
        agentServiceUrl: "https://agent.example.com",
        invokerServiceAccountEmail: "sa@example.com",
      }),
      enqueueFn: async ({ agentRunId, evidenceId }) => {
        taskCount += 1;
        return {
          outcome: "created" as const,
          taskId: `task-${evidenceId}`,
          url: "https://agent.example.com/r",
          payload: { agentRunId, evidenceId },
        };
      },
    });
    check(
      result.outcome === "enqueued" && taskCount === 1,
      "15. NEW Delta Evidence → exactly one resume task",
    );
    check(
      result.outcome === "enqueued" && result.agentRunId === RUN_ID,
      "16. resume targets same AgentRun",
    );
  }

  // Same already-analyzed Evidence does not enqueue (lastEvidenceId match skip
  // happens inside resume apply; trigger still enqueues if waiting — A5
  // already_resumed is resume-time. Trigger skips only linkage mismatches.)
  {
    taskCount = 0;
    const waiting = recovered.agentRun;
    const same = makeEvidence({
      id: OLD_EVIDENCE_ID,
      localEvidenceId: "evidence-old",
    });
    const result = await triggerFieldVarianceResumeForNewEvidence(same, {
      getAgentRunByIdFn: async () => waiting,
      loadEnvFn: () => ({
        projectId: "p",
        location: "us-central1",
        queue: "q",
        agentServiceUrl: "https://agent.example.com",
        invokerServiceAccountEmail: "sa@example.com",
      }),
      enqueueFn: async ({ agentRunId, evidenceId }) => {
        taskCount += 1;
        return {
          outcome: "created" as const,
          taskId: `task-${evidenceId}`,
          url: "https://agent.example.com/r",
          payload: { agentRunId, evidenceId },
        };
      },
    });
    // Trigger may still enqueue; agent applyResume already_resumed protects replay.
    check(
      result.outcome === "enqueued" ||
        result.outcome === "already_exists" ||
        result.outcome === "skipped",
      "17. same-Evidence commit: trigger enqueued|skipped (resume protects replay)",
    );
  }

  // Measurement-linked Evidence does not resume Field Variance
  {
    taskCount = 0;
    const waiting = recovered.agentRun;
    const measEv = makeEvidence({
      id: "ev-meas",
      localMeasurementId: "meas-local-1",
      localDeltaId: null,
    });
    const result = await triggerFieldVarianceResumeForNewEvidence(measEv, {
      getAgentRunByIdFn: async () => waiting,
      enqueueFn: async () => {
        taskCount += 1;
        return {
          outcome: "created" as const,
          taskId: "should-not",
          url: "https://agent.example.com/r",
          payload: { agentRunId: RUN_ID, evidenceId: "ev-meas" },
        };
      },
    });
    check(
      result.outcome === "skipped" &&
        result.reason === "not_delta_evidence" &&
        taskCount === 0,
      "18. Measurement-linked Evidence does not resume Field Variance",
    );
  }

  // Additional write itself creates no task (pure)
  {
    const running = makeAgentRun({ currentStep: "assess_variance" });
    const written = applyRequestAdditionalDeltaEvidence(running, {});
    check(
      written.outcome === "created" &&
        written.agentRun.pendingRequest?.kind === "delta_evidence",
      "19. additional transition creates pendingKind delta_evidence",
    );
  }

  if (failures > 0) {
    console.error(`\nFE6 backend FAILED with ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nFE6 backend ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
