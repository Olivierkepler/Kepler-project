/**
 * Phase A2 — Field Variance Delta trigger + Cloud Tasks enqueue tests.
 * Pure unit tests (no live GCP / agent service).
 *
 * Run: npx tsx src/scripts/phaseAgentA2Test.ts
 */

import {
  buildAgentRunStartUrl,
  loadAgentCloudTasksEnv,
  type AgentCloudTasksEnv,
} from "../config/agentEnv.js";
import {
  AGENT_RUN_SCHEMA_VERSION,
  DEFAULT_AGENT_RUN_MAX_ATTEMPTS,
  buildFieldVarianceAgentRunId,
  type AgentRun,
  type CreateAgentRunInput,
} from "../domain/agentRun.js";
import type { Delta } from "../domain/delta.js";
import {
  buildFieldVarianceStartTaskId,
  isCloudTasksSafeTaskId,
} from "../domain/fieldVarianceTaskId.js";
import type { Measurement } from "../domain/measurement.js";
import type { CloudTasksEnqueuer } from "../services/cloudTasks.js";
import {
  buildFieldVarianceCreateInput,
  triggerFieldVarianceForNewDelta,
} from "../services/fieldVarianceTrigger.js";

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

function assertThrows(fn: () => void, message: string, includes: string): void {
  try {
    fn();
    failed += 1;
    console.error(`FAIL: ${message} (expected throw)`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!text.includes(includes)) {
      failed += 1;
      console.error(`FAIL: ${message} (got: ${text})`);
      return;
    }
    passed += 1;
    console.log(`PASS: ${message}`);
  }
}

const NOW = "2026-08-23T05:00:00.000Z";

function makeDelta(overrides: Partial<Delta> = {}): Delta {
  return {
    id: "proj_owner_delta-local-1",
    localDeltaId: "delta-local-1",
    projectId: "proj_owner_project-1",
    planItemId: "proj_owner_plan-1",
    measurementId: "proj_owner_meas-1",
    type: "length",
    plannedValue: 120,
    actualValue: 12.08,
    difference: -107.92,
    percentDifference: -89.9,
    unit: "ft",
    unitCost: 4.5,
    costImpact: -485.64,
    productionRatePerDay: 40,
    scheduleImpactDays: -2.7,
    laborHoursPerUnit: 0.15,
    laborImpactHours: -16.19,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: "proj_owner_meas-1",
    localMeasurementId: "meas-local-1",
    projectId: "proj_owner_project-1",
    planItemId: "proj_owner_plan-1",
    type: "length",
    label: "Main conduit run",
    value: 12.08,
    unit: "ft",
    createdAt: NOW,
    ...overrides,
  };
}

function makeQueuedAgentRun(input: CreateAgentRunInput): AgentRun {
  const id = buildFieldVarianceAgentRunId(input.triggerSourceId);
  return {
    id,
    schemaVersion: AGENT_RUN_SCHEMA_VERSION,
    ownerUid: input.ownerUid,
    projectId: input.projectId,
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: input.triggerSourceId,
    idempotencyKey: id,
    status: "queued",
    currentStep: "queued",
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_AGENT_RUN_MAX_ATTEMPTS,
    contextRefs: input.contextRefs,
    pendingRequest: null,
    outcome: null,
    lastEvidenceId: null,
    errorCategory: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
  };
}

const testEnv: AgentCloudTasksEnv = {
  projectId: "buildsigma-test",
  location: "us-central1",
  queue: "field-variance-agent",
  agentServiceUrl: "https://agent.example.com",
  invokerServiceAccountEmail:
    "invoker@buildsigma-test.iam.gserviceaccount.com",
};

async function main(): Promise<void> {
  console.log("\n=== Phase A2 tests ===\n");

  const agentRunId = buildFieldVarianceAgentRunId("proj_owner_delta-local-1");
  const taskIdA = buildFieldVarianceStartTaskId(agentRunId);
  const taskIdB = buildFieldVarianceStartTaskId(agentRunId);
  assert(taskIdA === taskIdB, "5. task ID helper deterministic");
  assert(isCloudTasksSafeTaskId(taskIdA), "6. task ID is Cloud Tasks–safe");
  assert(!taskIdA.includes(":"), "6b. task ID contains no colons");
  assert(
    buildFieldVarianceStartTaskId(
      buildFieldVarianceAgentRunId("proj_owner_delta-local-2"),
    ) !== taskIdA,
    "7. different AgentRuns produce different task IDs",
  );

  assertThrows(
    () =>
      loadAgentCloudTasksEnv({
        NODE_ENV: "test",
        GOOGLE_CLOUD_PROJECT: "p",
        CLOUD_TASKS_LOCATION: "us-central1",
        AGENT_SERVICE_URL: "https://agent.example.com",
        CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com",
      }),
    "10. missing queue env fails clearly",
    "CLOUD_TASKS_QUEUE",
  );

  assertThrows(
    () =>
      loadAgentCloudTasksEnv({
        NODE_ENV: "test",
        GOOGLE_CLOUD_PROJECT: "p",
        CLOUD_TASKS_LOCATION: "us-central1",
        CLOUD_TASKS_QUEUE: "q",
        CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com",
      }),
    "11. missing agent URL fails clearly",
    "AGENT_SERVICE_URL",
  );

  const delta = makeDelta();
  const measurement = makeMeasurement();
  const createInput = buildFieldVarianceCreateInput({
    ownerUid: "trusted-owner",
    projectId: delta.projectId,
    delta,
    measurement,
  });

  assert(
    createInput.ownerUid === "trusted-owner" &&
      createInput.projectId === delta.projectId,
    "15. owner/project come from trusted auth/backend state",
  );
  assert(
    createInput.contextRefs.remoteDeltaId === delta.id &&
      createInput.contextRefs.localDeltaId === delta.localDeltaId &&
      createInput.contextRefs.remoteMeasurementId === measurement.id &&
      createInput.contextRefs.localMeasurementId ===
        measurement.localMeasurementId &&
      createInput.contextRefs.remotePlanItemId === delta.planItemId,
    "16. contextRefs preserve local + remote IDs",
  );

  let stored: AgentRun | null = null;
  let enqueueCalls = 0;
  let capturedBody: unknown = null;
  let capturedOidc: string | null = null;

  async function runTrigger(opts?: {
    alreadyExists?: boolean;
    enqueueFail?: boolean;
  }) {
    enqueueCalls = 0;
    capturedBody = null;
    capturedOidc = null;

    const enqueuer: CloudTasksEnqueuer = {
      async enqueueHttpTask(input) {
        enqueueCalls += 1;
        capturedBody = input.body;
        capturedOidc = input.oidcServiceAccountEmail;
        if (opts?.enqueueFail) {
          throw Object.assign(new Error("unavailable"), { code: 14 });
        }
        if (opts?.alreadyExists) {
          return { outcome: "already_exists" };
        }
        return { outcome: "created" };
      },
    };

    return triggerFieldVarianceForNewDelta(
      {
        ownerUid: "trusted-owner",
        projectId: delta.projectId,
        delta,
        measurement,
      },
      {
        createAgentRunIfAbsentFn: async (input) => {
          if (stored && stored.triggerSourceId === input.triggerSourceId) {
            return { created: false, agentRun: stored };
          }
          stored = makeQueuedAgentRun(input);
          return { created: true, agentRun: stored };
        },
        loadEnvFn: () => testEnv,
        enqueuer,
      },
    );
  }

  stored = null;
  const first = await runTrigger();
  assert(first.agentRunCreated === true, "1. NEW Delta creates AgentRun");
  assert(first.taskOutcome === "created", "2. NEW Delta queues one task");
  assert(enqueueCalls === 1, "2b. exactly one enqueue call");
  assert(
    capturedBody !== null &&
      typeof capturedBody === "object" &&
      Object.keys(capturedBody as object).length === 1 &&
      (capturedBody as { agentRunId: string }).agentRunId ===
        first.agentRun?.id,
    "8. task payload contains agentRunId only",
  );
  assert(
    capturedOidc === testEnv.invokerServiceAccountEmail,
    "9. OIDC uses configured invoker service account",
  );

  const second = await runTrigger();
  assert(
    second.agentRunCreated === false,
    "3. duplicate bootstrap does not create second AgentRun",
  );
  assert(
    second.taskOutcome === "skipped",
    "4. existing AgentRun does not enqueue again",
  );
  assert(enqueueCalls === 0, "4b. no enqueue on existing AgentRun");
  assert(
    second.agentRunCreated === false && second.taskOutcome === "skipped",
    "17. existing Delta bootstrap causes no new trigger enqueue",
  );

  stored = null;
  const already = await runTrigger({ alreadyExists: true });
  assert(
    already.taskOutcome === "already_exists",
    "12. ALREADY_EXISTS treated as idempotent success",
  );
  assert(already.agentRunCreated === true, "12b. AgentRun still created");

  stored = null;
  const failedEnqueue = await runTrigger({ enqueueFail: true });
  assert(failedEnqueue.taskOutcome === "failed", "13a. enqueue failure recorded");
  assert(
    failedEnqueue.agentRun !== null &&
      failedEnqueue.agentRun.status === "queued",
    "13. enqueue failure does not delete/reset AgentRun",
  );
  assert(
    failedEnqueue.agentRun?.triggerSourceId === delta.id &&
      failedEnqueue.agentRun?.contextRefs.localDeltaId === delta.localDeltaId,
    "14. enqueue failure does not mutate Delta / contextRefs",
  );

  assert(
    typeof triggerFieldVarianceForNewDelta === "function",
    "18. trigger is dedicated helper (not disposition update path)",
  );

  const startUrl = buildAgentRunStartUrl(testEnv.agentServiceUrl, agentRunId);
  assert(
    startUrl.includes("/internal/agent-runs/") &&
      startUrl.endsWith("/start") &&
      startUrl.includes(encodeURIComponent(agentRunId)),
    "task target is internal agent-run start URL",
  );

  console.log(`\nA2 results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
    return;
  }
  console.log("phaseAgentA2Test: PASS");
}

main().catch((error: unknown) => {
  console.error("phaseAgentA2Test failed:");
  console.error(error);
  process.exitCode = 1;
});
