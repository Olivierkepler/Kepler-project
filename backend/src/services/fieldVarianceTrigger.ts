import type { Delta } from "../domain/delta.js";
import type { Measurement } from "../domain/measurement.js";
import {
  DEFAULT_AGENT_RUN_MAX_ATTEMPTS,
  type AgentRun,
  type CreateAgentRunInput,
} from "../domain/agentRun.js";
import { createAgentRunIfAbsent } from "../repositories/agentRunsRepository.js";
import {
  loadAgentCloudTasksEnv,
  type AgentCloudTasksEnv,
} from "../config/agentEnv.js";
import {
  enqueueFieldVarianceStartTask,
  type CloudTasksEnqueuer,
  type EnqueueFieldVarianceStartResult,
} from "./cloudTasks.js";
import {
  categorizeEnqueueError,
  logAgentEvent,
} from "./agentLogging.js";

export type FieldVarianceTriggerDeps = {
  createAgentRunIfAbsentFn?: typeof createAgentRunIfAbsent;
  enqueueFn?: (args: {
    agentRunId: string;
    enqueuer?: CloudTasksEnqueuer;
    env?: AgentCloudTasksEnv;
  }) => Promise<EnqueueFieldVarianceStartResult>;
  loadEnvFn?: () => AgentCloudTasksEnv;
  enqueuer?: CloudTasksEnqueuer;
};

export type FieldVarianceTriggerResult = {
  agentRun: AgentRun | null;
  agentRunCreated: boolean;
  taskOutcome: "created" | "already_exists" | "skipped" | "failed" | null;
  errorCategory: string | null;
};

/**
 * Builds CreateAgentRunInput from trusted auth + persisted Delta/Measurement.
 * Never takes ownerUid/projectId from the client body.
 */
export function buildFieldVarianceCreateInput(args: {
  ownerUid: string;
  projectId: string;
  delta: Delta;
  measurement: Measurement;
}): CreateAgentRunInput {
  const { ownerUid, projectId, delta, measurement } = args;

  if (delta.projectId !== projectId) {
    throw new Error("Delta projectId mismatch for Field Variance trigger");
  }

  if (measurement.projectId !== projectId) {
    throw new Error(
      "Measurement projectId mismatch for Field Variance trigger",
    );
  }

  if (delta.measurementId !== measurement.id) {
    throw new Error(
      "Delta measurementId does not match Measurement for Field Variance trigger",
    );
  }

  if (!measurement.localMeasurementId.trim()) {
    throw new Error(
      "Measurement.localMeasurementId is required for Field Variance contextRefs",
    );
  }

  if (!delta.localDeltaId.trim()) {
    throw new Error(
      "Delta.localDeltaId is required for Field Variance contextRefs",
    );
  }

  if (!delta.planItemId.trim()) {
    throw new Error(
      "Delta.planItemId is required for Field Variance contextRefs",
    );
  }

  return {
    ownerUid,
    projectId,
    triggerSourceId: delta.id,
    maxAttempts: DEFAULT_AGENT_RUN_MAX_ATTEMPTS,
    contextRefs: {
      remoteDeltaId: delta.id,
      localDeltaId: delta.localDeltaId,
      remoteMeasurementId: measurement.id,
      localMeasurementId: measurement.localMeasurementId,
      remotePlanItemId: delta.planItemId,
    },
  };
}

/**
 * After a NEW Delta is persisted: create-or-reuse AgentRun; enqueue start task
 * only when the AgentRun was newly created.
 *
 * Enqueue failures do not throw — Delta remains authoritative; AgentRun stays queued.
 */
export async function triggerFieldVarianceForNewDelta(
  args: {
    ownerUid: string;
    projectId: string;
    delta: Delta;
    measurement: Measurement;
  },
  deps: FieldVarianceTriggerDeps = {},
): Promise<FieldVarianceTriggerResult> {
  const createFn = deps.createAgentRunIfAbsentFn ?? createAgentRunIfAbsent;
  const enqueueFn = deps.enqueueFn ?? enqueueFieldVarianceStartTask;
  const loadEnvFn = deps.loadEnvFn ?? loadAgentCloudTasksEnv;

  logAgentEvent({
    event: "agent_triggered",
    remoteDeltaId: args.delta.id,
    projectId: args.projectId,
  });

  let createResult: Awaited<ReturnType<typeof createAgentRunIfAbsent>>;

  try {
    const input = buildFieldVarianceCreateInput(args);
    createResult = await createFn(input);
  } catch (error) {
    const errorCategory = categorizeEnqueueError(error);
    logAgentEvent({
      event: "agent_run_create_failed",
      remoteDeltaId: args.delta.id,
      projectId: args.projectId,
      errorCategory,
    });

    return {
      agentRun: null,
      agentRunCreated: false,
      taskOutcome: null,
      errorCategory,
    };
  }

  const { created, agentRun } = createResult;

  if (!created) {
    logAgentEvent({
      event: "agent_run_existing",
      agentRunId: agentRun.id,
      remoteDeltaId: args.delta.id,
      projectId: args.projectId,
    });

    return {
      agentRun,
      agentRunCreated: false,
      taskOutcome: "skipped",
      errorCategory: null,
    };
  }

  logAgentEvent({
    event: "agent_run_created",
    agentRunId: agentRun.id,
    remoteDeltaId: args.delta.id,
    projectId: args.projectId,
  });

  try {
    const env = loadEnvFn();
    const enqueueResult = await enqueueFn({
      agentRunId: agentRun.id,
      env,
      enqueuer: deps.enqueuer,
    });

    if (enqueueResult.outcome === "already_exists") {
      logAgentEvent({
        event: "agent_task_already_exists",
        agentRunId: agentRun.id,
        remoteDeltaId: args.delta.id,
        projectId: args.projectId,
      });

      return {
        agentRun,
        agentRunCreated: true,
        taskOutcome: "already_exists",
        errorCategory: null,
      };
    }

    logAgentEvent({
      event: "agent_task_enqueued",
      agentRunId: agentRun.id,
      remoteDeltaId: args.delta.id,
      projectId: args.projectId,
    });

    return {
      agentRun,
      agentRunCreated: true,
      taskOutcome: "created",
      errorCategory: null,
    };
  } catch (error) {
    const errorCategory = categorizeEnqueueError(error);
    logAgentEvent({
      event: "agent_task_enqueue_failed",
      agentRunId: agentRun.id,
      remoteDeltaId: args.delta.id,
      projectId: args.projectId,
      errorCategory,
    });

    return {
      agentRun,
      agentRunCreated: true,
      taskOutcome: "failed",
      errorCategory,
    };
  }
}
