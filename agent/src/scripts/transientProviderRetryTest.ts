/**
 * Transient provider retry + atomic queued→running claim tests.
 *
 * Run: npm run test:transient-retry
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  createStubFieldVarianceAgentRunner,
} from "../agent/fieldVarianceAgent.js";
import {
  createLocalTestOidcVerifier,
  mintLocalTestOidcToken,
} from "../auth/oidc.js";
import { createApp } from "../app.js";
import type { AgentServiceEnv } from "../config/env.js";
import {
  AgentRunError,
  buildFieldVarianceAgentRunId,
  canTransitionAgentRunStatus,
  type AgentRun,
  type AgentRunPendingRequest,
  type AgentRunStateUpdate,
} from "../domain/agentRun.js";
import type { FieldVarianceAssessment } from "../domain/assessment.js";
import { isEligibleForFailedEvidenceRecovery } from "../domain/recoverableEvidenceFailure.js";
import type { Delta } from "../domain/delta.js";
import type { Evidence } from "../domain/evidence.js";
import type { Measurement } from "../domain/measurement.js";
import type { PlanItem } from "../domain/planItem.js";
import type { Project } from "../domain/project.js";
import {
  categorizeExecutionError,
  isTransientProviderFailure,
} from "../logging/agentExecutionLogging.js";
import { executeFieldVarianceAssessmentCycle } from "../services/fieldVarianceAssessmentCycle.js";
import {
  resumeAgentRunExecution,
  type ResumeAgentRunDeps,
} from "../services/resumeAgentRun.js";
import {
  startAgentRunExecution,
  type StartAgentRunDeps,
} from "../services/startAgentRun.js";
import type { DomainLoaders } from "../tools/toolContext.js";
import {
  applyAgentRunStateUpdate,
  applyClaimQueuedAgentRunStart,
  applyRequestDeltaEvidence,
  applyResumeFromDeltaEvidence,
} from "../validation/agentRun.js";

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${message}`);
}

const NOW = "2026-09-19T23:45:00.000Z";
const OWNER = "owner-uid-1";
const PROJECT_ID = "proj_owner_project-1";
const REMOTE_DELTA = "proj_owner_delta-1";
const LOCAL_DELTA = "delta-local-1";
const REMOTE_MEAS = "proj_owner_meas-1";
const LOCAL_MEAS = "meas-local-1";
const REMOTE_PLAN = "proj_owner_plan-1";
const SECRET = "local-test-secret";
const AUDIENCE = "https://agent.example.com";
const INVOKER = "invoker@buildsigma-test.iam.gserviceaccount.com";

function makeAssessment(
  overrides: Partial<FieldVarianceAssessment> = {},
): FieldVarianceAssessment {
  return {
    summary: "Field under-run versus plan.",
    evidenceAssessment: "No direct Delta Evidence found.",
    recommendedAction: "request_evidence",
    userVisibleRationale: "Capture Delta documentation before summary.",
    ...overrides,
  };
}

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const id = buildFieldVarianceAgentRunId(REMOTE_DELTA);
  return {
    id,
    schemaVersion: 1,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: REMOTE_DELTA,
    idempotencyKey: id,
    status: "queued",
    currentStep: "queued",
    attemptCount: 0,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: REMOTE_DELTA,
      localDeltaId: LOCAL_DELTA,
      remoteMeasurementId: REMOTE_MEAS,
      localMeasurementId: LOCAL_MEAS,
      remotePlanItemId: REMOTE_PLAN,
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

function makeProject(): Project {
  return {
    id: PROJECT_ID,
    ownerUid: OWNER,
    name: "Test",
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as Project;
}

function makePlanItem(): PlanItem {
  return {
    id: REMOTE_PLAN,
    projectId: PROJECT_ID,
    localPlanItemId: "plan-local",
    label: "Conference room wall",
    type: "length",
    unit: "ft",
    plannedValue: 40,
  } as PlanItem;
}

function makeMeasurement(): Measurement {
  return {
    id: REMOTE_MEAS,
    projectId: PROJECT_ID,
    planItemId: REMOTE_PLAN,
    localMeasurementId: LOCAL_MEAS,
    value: 31.5,
    unit: "ft",
    type: "length",
    createdAt: NOW,
  } as Measurement;
}

function makeDelta(): Delta {
  return {
    id: REMOTE_DELTA,
    projectId: PROJECT_ID,
    planItemId: REMOTE_PLAN,
    measurementId: REMOTE_MEAS,
    localDeltaId: LOCAL_DELTA,
    plannedValue: 40,
    actualValue: 31.5,
    difference: -8.5,
    percentDifference: -21.25,
    status: "open",
    unit: "ft",
    type: "length",
    createdAt: NOW,
  } as Delta;
}

type MemStore = {
  runs: Map<string, AgentRun>;
  project: Project;
  planItem: PlanItem;
  measurement: Measurement;
  delta: Delta;
  evidence: Evidence[];
  cycleExecutions: number;
};

function createStore(seed: Partial<MemStore> = {}): MemStore {
  const run = makeAgentRun();
  return {
    runs: new Map([[run.id, run]]),
    project: makeProject(),
    planItem: makePlanItem(),
    measurement: makeMeasurement(),
    delta: makeDelta(),
    evidence: [],
    cycleExecutions: 0,
    ...seed,
  };
}

function createStartDeps(
  store: MemStore,
  assessment: FieldVarianceAssessment = makeAssessment(),
  extras: Partial<StartAgentRunDeps> = {},
): StartAgentRunDeps {
  const loaders: DomainLoaders = {
    getProjectById: async (id) =>
      id === store.project.id ? store.project : undefined,
    getPlanItemById: async (id) =>
      id === store.planItem.id ? store.planItem : undefined,
    getMeasurementById: async (id) =>
      id === store.measurement.id ? store.measurement : undefined,
    getDeltaById: async (id) =>
      id === store.delta.id ? { ...store.delta } : undefined,
    getEvidenceForProject: async (projectId) =>
      store.evidence.filter((item) => item.projectId === projectId),
  };

  return {
    loaders,
    getAgentRunByIdFn: async (id) => store.runs.get(id),
    updateAgentRunStateFn: async (id, update: AgentRunStateUpdate) => {
      const current = store.runs.get(id);
      if (!current) {
        throw new AgentRunError("not_found", "AgentRun not found");
      }
      const next = applyAgentRunStateUpdate(current, update);
      store.runs.set(id, next);
      return next;
    },
    claimQueuedAgentRunStartFn: async (id) => {
      const current = store.runs.get(id);
      if (!current) {
        throw new AgentRunError("not_found", "AgentRun not found");
      }
      const claimed = applyClaimQueuedAgentRunStart(current);
      if (claimed.outcome !== "not_queued") {
        store.runs.set(id, claimed.agentRun);
      }
      return claimed;
    },
    requestDeltaEvidenceFn: async (id, input) => {
      const current = store.runs.get(id);
      if (!current) {
        throw new AgentRunError("not_found", "AgentRun not found");
      }
      const result = applyRequestDeltaEvidence(current, input);
      store.runs.set(id, result.agentRun);
      return result;
    },
    runAgent: async (args) => {
      store.cycleExecutions += 1;
      return createStubFieldVarianceAgentRunner(assessment)(args);
    },
    model: "gemini-3.5-flash",
    enableEvidenceAnalysis: false,
    enableSummaryPersistence: false,
    resolveRequestedProjectMemberIdFn: async () => null,
    ...extras,
  };
}

const testEnv: AgentServiceEnv = {
  port: 0,
  googleCloudProject: "buildsigma-test",
  googleCloudLocation: "global",
  geminiModel: "gemini-3.5-flash",
  agentServiceUrl: AUDIENCE,
  invokerServiceAccountEmail: INVOKER,
  oidcMode: "local_test",
  localOidcSecret: SECRET,
};

async function withServer(
  startExecution: typeof startAgentRunExecution,
  fn: (baseUrl: string) => Promise<void>,
  resumeExecution?: typeof resumeAgentRunExecution,
): Promise<void> {
  const verifyOidc = createLocalTestOidcVerifier({
    expectedAudience: AUDIENCE,
    expectedServiceAccountEmail: INVOKER,
    secret: SECRET,
  });
  const app = createApp({
    env: testEnv,
    verifyOidc,
    startExecution,
    resumeExecution,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function bearer(): string {
  return `Bearer ${mintLocalTestOidcToken({
    email: INVOKER,
    audience: AUDIENCE,
    secret: SECRET,
  })}`;
}

async function main(): Promise<void> {
  check(
    canTransitionAgentRunStatus("running", "queued"),
    "running → queued transition allowed",
  );

  // Classifier
  check(
    isTransientProviderFailure(
      new Error("Resource exhausted. Please try again later."),
    ),
    "1. RESOURCE_EXHAUSTED message → transient",
  );
  check(
    isTransientProviderFailure({ code: "RESOURCE_EXHAUSTED", message: "x" }),
    "1b. RESOURCE_EXHAUSTED code → transient",
  );
  check(
    isTransientProviderFailure({ status: 429, message: "rate limited" }),
    "2. HTTP 429 → transient",
  );
  check(
    isTransientProviderFailure(new Error("quota exceeded for project")),
    "3. quota exceeded → transient",
  );
  check(
    isTransientProviderFailure({
      status: 503,
      message: "Service Unavailable",
    }),
    "4. provider 503 → transient",
  );
  check(
    isTransientProviderFailure(new Error("Service Unavailable")),
    "4b. Service Unavailable message → transient",
  );
  check(
    !isTransientProviderFailure({
      name: "ZodError",
      message: "ZodError evidenceId:invalid_type",
      issues: [],
    }),
    "5. validation/schema → non-retryable",
  );
  check(
    !isTransientProviderFailure({
      code: "PERMISSION_DENIED",
      message: "denied",
    }),
    "6. authorization → non-retryable",
  );
  check(
    !isTransientProviderFailure("policy_mismatch"),
    "7. policy_mismatch → non-retryable",
  );
  check(
    !isTransientProviderFailure("unsupported_media"),
    "8. unsupported_media → not transient provider",
  );
  check(
    !isTransientProviderFailure(new Error("something failed")),
    "24a. bare failed → not transient",
  );
  check(
    !isTransientProviderFailure(new Error("unavailable")),
    "24b. bare unavailable → not transient",
  );
  check(
    !isTransientProviderFailure(new Error("Deadline exceeded: timeout")),
    "24c. timeout → not transient",
  );
  check(
    !isTransientProviderFailure("unknown"),
    "24. unknown → fail closed",
  );
  check(
    !isTransientProviderFailure(null),
    "24d. null → fail closed",
  );

  // Start transient requeue
  {
    const store = createStore();
    const deps = createStartDeps(store, makeAssessment(), {
      runAgent: async () => {
        store.cycleExecutions += 1;
        throw Object.assign(new Error("Resource exhausted. Try again later."), {
          code: "RESOURCE_EXHAUSTED",
        });
      },
    });
    const result = await startAgentRunExecution(
      [...store.runs.keys()][0]!,
      deps,
    );
    check(
      result.kind === "transient_retry" &&
        result.agentRun.status === "queued" &&
        result.agentRun.currentStep === "queued" &&
        result.agentRun.completedAt === null &&
        result.agentRun.attemptCount === 1,
      "9. transient with attempts remaining → queued (not failed)",
    );
    check(
      result.kind === "transient_retry" &&
        isTransientProviderFailure(result.errorCategory),
      "9b. sanitized errorCategory preserved",
    );
    check(
      store.runs.get([...store.runs.keys()][0]!)?.id ===
        buildFieldVarianceAgentRunId(REMOTE_DELTA),
      "18. same AgentRun ID preserved",
    );
    check(
      store.runs.get([...store.runs.keys()][0]!)?.contextRefs.remoteDeltaId ===
        REMOTE_DELTA,
      "19. same Delta ID preserved",
    );
    check(store.runs.size === 1, "20. no duplicate AgentRun created");
  }

  // HTTP 503 for transient
  {
    const store = createStore();
    const startExecution: typeof startAgentRunExecution = async (id) =>
      startAgentRunExecution(
        id,
        createStartDeps(store, makeAssessment(), {
          runAgent: async () => {
            throw Object.assign(new Error("Too Many Requests"), {
              status: 429,
            });
          },
        }),
      );
    await withServer(startExecution, async (baseUrl) => {
      const runId = [...store.runs.keys()][0]!;
      const response = await fetch(
        `${baseUrl}/internal/agent-runs/${encodeURIComponent(runId)}/start`,
        {
          method: "POST",
          headers: {
            authorization: bearer(),
            "content-type": "application/json",
          },
          body: JSON.stringify({ agentRunId: runId }),
        },
      );
      const body = (await response.json()) as { status?: string };
      check(response.status === 503, "10. transient → HTTP 503");
      check(body.status === "transient_retry", "10b. body status transient_retry");
    });
  }

  // Next start increments attempt once
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    store.runs.set(
      runId,
      makeAgentRun({
        id: runId,
        status: "queued",
        currentStep: "queued",
        attemptCount: 1,
        errorCategory: "RESOURCE_EXHAUSTED",
      }),
    );
    let calls = 0;
    const deps = createStartDeps(store, makeAssessment(), {
      runAgent: async () => {
        calls += 1;
        throw Object.assign(new Error("quota exceeded"), {
          code: "RESOURCE_EXHAUSTED",
        });
      },
    });
    const first = await startAgentRunExecution(runId, deps);
    check(
      first.kind === "transient_retry" && first.agentRun.attemptCount === 2,
      "11. next /start redelivery increments attempt exactly once",
    );
    check(calls === 1, "11b. one cycle execution per claim");
  }

  // maxAttempts exhausted → terminal failed
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    store.runs.set(
      runId,
      makeAgentRun({
        id: runId,
        attemptCount: 4,
        maxAttempts: 5,
      }),
    );
    const deps = createStartDeps(store, makeAssessment(), {
      runAgent: async () => {
        throw Object.assign(new Error("Resource exhausted"), {
          code: "RESOURCE_EXHAUSTED",
        });
      },
    });
    const result = await startAgentRunExecution(runId, deps);
    check(
      result.kind === "failed" &&
        result.agentRun?.status === "failed" &&
        result.agentRun.attemptCount === 5,
      "12. maxAttempts exhausted → terminal failed",
    );
  }

  // Terminal failed → HTTP 200
  {
    const store = createStore();
    const startExecution: typeof startAgentRunExecution = async (id) =>
      startAgentRunExecution(
        id,
        createStartDeps(store, makeAssessment(), {
          runAgent: async () => {
            throw new Error("ZodError evidenceId:invalid_type expected=string");
          },
        }),
      );
    await withServer(startExecution, async (baseUrl) => {
      const runId = [...store.runs.keys()][0]!;
      const response = await fetch(
        `${baseUrl}/internal/agent-runs/${encodeURIComponent(runId)}/start`,
        {
          method: "POST",
          headers: {
            authorization: bearer(),
            "content-type": "application/json",
          },
          body: JSON.stringify({ agentRunId: runId }),
        },
      );
      check(response.status === 200, "13. terminal failed → HTTP 200");
      const body = (await response.json()) as { status?: string };
      check(body.status === "failed", "13b. body status failed");
    });
  }

  // Stale completed noop
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    store.runs.set(
      runId,
      makeAgentRun({
        id: runId,
        status: "completed",
        currentStep: "completed",
        attemptCount: 1,
        completedAt: NOW,
      }),
    );
    const result = await startAgentRunExecution(
      runId,
      createStartDeps(store),
    );
    check(
      result.kind === "noop" && result.reason === "terminal",
      "14. completed → stale retry no-op",
    );
  }

  // waiting_for_evidence start noop
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    store.runs.set(
      runId,
      makeAgentRun({
        id: runId,
        status: "waiting_for_evidence",
        currentStep: "waiting_for_evidence",
        attemptCount: 1,
        pendingRequest: {
          kind: "delta_evidence",
          message: "Need photo",
          requestedAt: NOW,
          requestId: "req-1",
          requestedProjectMemberId: null,
        },
      }),
    );
    const result = await startAgentRunExecution(
      runId,
      createStartDeps(store),
    );
    check(
      result.kind === "noop" && result.reason === "waiting_for_evidence",
      "15. waiting_for_evidence → stale start no-op",
    );
  }

  // running duplicate start noop
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    store.runs.set(
      runId,
      makeAgentRun({
        id: runId,
        status: "running",
        currentStep: "assess_variance",
        attemptCount: 1,
      }),
    );
    const result = await startAgentRunExecution(
      runId,
      createStartDeps(store),
    );
    check(
      result.kind === "noop" && result.reason === "already_running",
      "16. running → duplicate start no-op",
    );
  }

  // Concurrent double claim
  {
    const store = createStore();
    const runId = [...store.runs.keys()][0]!;
    let releaseClaimGate: (() => void) | undefined;
    const claimGate = new Promise<void>((resolve) => {
      releaseClaimGate = resolve;
    });
    let claims = 0;
    let cycles = 0;

    const slowClaim: StartAgentRunDeps["claimQueuedAgentRunStartFn"] = async (
      id,
    ) => {
      await claimGate;
      // Re-read after the gate — mirrors Firestore transaction get-after-contention.
      const current = store.runs.get(id);
      if (!current) {
        throw new AgentRunError("not_found", "AgentRun not found");
      }
      const claimed = applyClaimQueuedAgentRunStart(current);
      claims += 1;
      if (claimed.outcome !== "not_queued") {
        store.runs.set(id, claimed.agentRun);
      }
      return claimed;
    };

    const depsA = createStartDeps(store, makeAssessment(), {
      claimQueuedAgentRunStartFn: slowClaim,
      runAgent: async () => {
        cycles += 1;
        return makeAssessment();
      },
    });
    const depsB = createStartDeps(store, makeAssessment(), {
      claimQueuedAgentRunStartFn: slowClaim,
      runAgent: async () => {
        cycles += 1;
        return makeAssessment();
      },
    });

    const p1 = startAgentRunExecution(runId, depsA);
    const p2 = startAgentRunExecution(runId, depsB);
    // Allow both to reach claim gate, then release.
    await new Promise((r) => setTimeout(r, 20));
    releaseClaimGate?.();
    const [r1, r2] = await Promise.all([p1, p2]);

    const kinds = [r1.kind, r2.kind].sort();
    check(
      kinds.includes("started") || kinds.includes("waiting_for_evidence"),
      "17a. one claimant executes assessment",
    );
    check(kinds.includes("noop"), "17b. other request is safe noop");
    check(claims === 2, "17c. both attempted claim");
    check(cycles === 1, "17. concurrent double /start → one cycle execution");
    check(
      store.runs.get(runId)!.attemptCount === 1,
      "17d. one attempt increment",
    );
  }

  // Successful retry without evidence → waiting_for_evidence
  {
    const store = createStore();
    const result = await startAgentRunExecution(
      [...store.runs.keys()][0]!,
      createStartDeps(store, makeAssessment()),
    );
    check(
      result.kind === "waiting_for_evidence" &&
        result.agentRun.status === "waiting_for_evidence",
      "21. successful retry without evidence → waiting_for_evidence",
    );
  }

  // Resume transient restores waiting so same evidence can retry
  {
    const evidenceId = `${PROJECT_ID}_evidence-1`;
    const pending: AgentRunPendingRequest = {
      kind: "delta_evidence",
      message: "Need photo",
      requestedAt: NOW,
      requestId: "req-1",
      requestedProjectMemberId: null,
    };
    const run = makeAgentRun({
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      attemptCount: 1,
      pendingRequest: pending,
    });
    const evidence = {
      id: evidenceId,
      projectId: PROJECT_ID,
      ownerUid: OWNER,
      localDeltaId: LOCAL_DELTA,
      type: "photo",
      createdAt: NOW,
    } as Evidence;

    const store = {
      runs: new Map([[run.id, run]]),
      evidence: [evidence],
    };

    const deps: ResumeAgentRunDeps = {
      getAgentRunByIdFn: async (id) => store.runs.get(id),
      getEvidenceByIdFn: async (id) =>
        store.evidence.find((e) => e.id === id),
      resumeFromDeltaEvidenceFn: async (id, input) => {
        const current = store.runs.get(id)!;
        const result = applyResumeFromDeltaEvidence(current, input);
        store.runs.set(id, result.agentRun);
        return result;
      },
      updateAgentRunStateFn: async (id, update) => {
        const current = store.runs.get(id)!;
        const next = applyAgentRunStateUpdate(current, update);
        store.runs.set(id, next);
        return next;
      },
      loaders: {
        getProjectById: async () => makeProject(),
        getPlanItemById: async () => makePlanItem(),
        getMeasurementById: async () => makeMeasurement(),
        getDeltaById: async () => makeDelta(),
        getEvidenceForProject: async () => store.evidence,
      },
      runAgent: async () => {
        throw Object.assign(new Error("Resource exhausted"), {
          code: "RESOURCE_EXHAUSTED",
        });
      },
      enableEvidenceAnalysis: false,
      enableSummaryPersistence: false,
      resolveRequestedProjectMemberIdFn: async () => null,
    };

    const result = await resumeAgentRunExecution(run.id, evidenceId, deps);
    check(
      result.kind === "transient_retry" &&
        result.agentRun.status === "waiting_for_evidence" &&
        result.agentRun.lastEvidenceId === null &&
        result.agentRun.pendingRequest?.kind === "delta_evidence" &&
        result.agentRun.attemptCount === 2,
      "22. resume transient → restored waiting without duplicate evidence claim",
    );

    // Second resume with same evidence can claim again
    const second = await resumeAgentRunExecution(run.id, evidenceId, {
      ...deps,
      runAgent: async () => makeAssessment({ recommendedAction: "escalate" }),
    });
    check(
      second.kind === "escalated" ||
        second.kind === "resumed" ||
        second.kind === "waiting_for_evidence" ||
        second.kind === "completed",
      "22b. same resume task can re-execute after restore",
    );
  }

  // quota not canRecoverEvidence
  {
    const failedRun = makeAgentRun({
      status: "failed",
      currentStep: "failed",
      attemptCount: 1,
      errorCategory:
        "Resource exhausted. Please try again later. Please refer to [URL_REDACTED] for m",
      completedAt: NOW,
    });
    check(
      !isEligibleForFailedEvidenceRecovery(failedRun),
      "23. quota remains NOT canRecoverEvidence",
    );
  }

  // Cycle unit: transient_retry kind without writing failed
  {
    const run = makeAgentRun({
      status: "running",
      currentStep: "load_context",
      attemptCount: 1,
    });
    const store = new Map([[run.id, run]]);
    const cycle = await executeFieldVarianceAssessmentCycle(run, {
      loaders: {
        getProjectById: async () => makeProject(),
        getPlanItemById: async () => makePlanItem(),
        getMeasurementById: async () => makeMeasurement(),
        getDeltaById: async () => makeDelta(),
        getEvidenceForProject: async () => [],
      },
      updateAgentRunStateFn: async (id, update) => {
        const current = store.get(id)!;
        const next = applyAgentRunStateUpdate(current, update);
        store.set(id, next);
        return next;
      },
      runAgent: async () => {
        throw Object.assign(new Error("rate limit exceeded"), {
          status: 429,
        });
      },
      enableEvidenceAnalysis: false,
    });
    check(
      cycle.kind === "transient_retry" &&
        store.get(run.id)!.status === "running",
      "cycle returns transient_retry without persisting failed",
    );
  }

  // Pure claim concurrency
  {
    const queued = makeAgentRun({ attemptCount: 0 });
    const first = applyClaimQueuedAgentRunStart(queued);
    const second = applyClaimQueuedAgentRunStart(first.agentRun);
    check(first.outcome === "claimed", "claim first wins");
    check(
      second.outcome === "not_queued" && first.agentRun.attemptCount === 1,
      "claim second is not_queued with single increment",
    );
  }

  console.log(
    `\ntransientProviderRetryTest: ${passed} passed, ${failed} failed`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
