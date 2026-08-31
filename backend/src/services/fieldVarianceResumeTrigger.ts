import { buildFieldVarianceAgentRunId } from "../domain/agentRun.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
import type { Evidence } from "../domain/evidence.js";
import { getAgentRunById } from "../repositories/agentRunsRepository.js";
import {
  loadAgentCloudTasksEnv,
  type AgentCloudTasksEnv,
} from "../config/agentEnv.js";
import {
  enqueueFieldVarianceResumeTask,
  type CloudTasksEnqueuer,
  type EnqueueFieldVarianceResumeResult,
} from "./cloudTasks.js";
import {
  categorizeEnqueueError,
  logAgentEvent,
} from "./agentLogging.js";

export type FieldVarianceResumeTriggerDeps = {
  getAgentRunByIdFn?: typeof getAgentRunById;
  enqueueFn?: (args: {
    agentRunId: string;
    evidenceId: string;
    enqueuer?: CloudTasksEnqueuer;
    env?: AgentCloudTasksEnv;
  }) => Promise<EnqueueFieldVarianceResumeResult>;
  loadEnvFn?: () => AgentCloudTasksEnv;
  enqueuer?: CloudTasksEnqueuer;
};

export type FieldVarianceResumeTriggerResult =
  | { outcome: "enqueued"; agentRunId: string; taskId: string }
  | { outcome: "already_exists"; agentRunId: string; taskId: string }
  | {
      outcome: "skipped";
      reason:
        | "not_delta_evidence"
        | "agent_run_not_found"
        | "owner_mismatch"
        | "project_mismatch"
        | "local_delta_mismatch"
        | "not_waiting"
        | "pending_request_mismatch"
        | "multiple_matches_anomaly";
      agentRunId?: string;
    }
  | {
      outcome: "enqueue_failed";
      agentRunId: string;
      errorCategory: string;
    };

/**
 * After NEW direct Delta Evidence is persisted: find the waiting Field Variance
 * AgentRun (deterministic id) and enqueue a resume task. Never mutates Evidence.
 * Enqueue failure leaves the AgentRun waiting and is non-fatal to Evidence create.
 */
export async function triggerFieldVarianceResumeForNewEvidence(
  evidence: Evidence,
  deps: FieldVarianceResumeTriggerDeps = {},
): Promise<FieldVarianceResumeTriggerResult> {
  if (
    evidence.localDeltaId === null ||
    evidence.localDeltaId.trim().length === 0 ||
    evidence.localMeasurementId !== null
  ) {
    return { outcome: "skipped", reason: "not_delta_evidence" };
  }

  const localDeltaId = evidence.localDeltaId.trim();
  const remoteDeltaId = createRemoteDeltaId(evidence.projectId, localDeltaId);
  const agentRunId = buildFieldVarianceAgentRunId(remoteDeltaId);

  const getById = deps.getAgentRunByIdFn ?? getAgentRunById;
  const agentRun = await getById(agentRunId);

  if (!agentRun) {
    return { outcome: "skipped", reason: "agent_run_not_found", agentRunId };
  }

  // Architecture expects one Field Variance run per remote Delta (deterministic id).
  // Doc-id lookup cannot return multiple; keep an explicit fail-closed branch for audits.
  if (agentRun.id !== agentRunId) {
    logAgentEvent({
      event: "agent_resume_enqueue_failed",
      agentRunId,
      evidenceId: evidence.id,
      projectId: evidence.projectId,
      errorCategory: "multiple_matches_anomaly",
    });
    return {
      outcome: "skipped",
      reason: "multiple_matches_anomaly",
      agentRunId,
    };
  }

  if (agentRun.ownerUid !== evidence.ownerUid) {
    return { outcome: "skipped", reason: "owner_mismatch", agentRunId };
  }

  if (agentRun.projectId !== evidence.projectId) {
    return { outcome: "skipped", reason: "project_mismatch", agentRunId };
  }

  if (agentRun.contextRefs.localDeltaId !== localDeltaId) {
    return {
      outcome: "skipped",
      reason: "local_delta_mismatch",
      agentRunId,
    };
  }

  if (
    agentRun.status !== "waiting_for_evidence" ||
    agentRun.currentStep !== "waiting_for_evidence"
  ) {
    return { outcome: "skipped", reason: "not_waiting", agentRunId };
  }

  if (
    agentRun.pendingRequest === null ||
    agentRun.pendingRequest.kind !== "delta_evidence"
  ) {
    return {
      outcome: "skipped",
      reason: "pending_request_mismatch",
      agentRunId,
    };
  }

  logAgentEvent({
    event: "agent_resume_candidate_found",
    agentRunId: agentRun.id,
    evidenceId: evidence.id,
    projectId: agentRun.projectId,
    workflowType: agentRun.workflowType,
    step: agentRun.currentStep,
    attemptCount: agentRun.attemptCount,
  });

  const enqueueFn = deps.enqueueFn ?? enqueueFieldVarianceResumeTask;
  const loadEnvFn = deps.loadEnvFn ?? loadAgentCloudTasksEnv;

  try {
    const env = loadEnvFn();
    const enqueueResult = await enqueueFn({
      agentRunId: agentRun.id,
      evidenceId: evidence.id,
      env,
      enqueuer: deps.enqueuer,
    });

    if (enqueueResult.outcome === "already_exists") {
      logAgentEvent({
        event: "agent_resume_task_existing",
        agentRunId: agentRun.id,
        evidenceId: evidence.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        attemptCount: agentRun.attemptCount,
      });
      return {
        outcome: "already_exists",
        agentRunId: agentRun.id,
        taskId: enqueueResult.taskId,
      };
    }

    logAgentEvent({
      event: "agent_resume_task_enqueued",
      agentRunId: agentRun.id,
      evidenceId: evidence.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      attemptCount: agentRun.attemptCount,
    });

    return {
      outcome: "enqueued",
      agentRunId: agentRun.id,
      taskId: enqueueResult.taskId,
    };
  } catch (error) {
    const errorCategory = categorizeEnqueueError(error);
    logAgentEvent({
      event: "agent_resume_enqueue_failed",
      agentRunId: agentRun.id,
      evidenceId: evidence.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      attemptCount: agentRun.attemptCount,
      errorCategory,
    });

    return {
      outcome: "enqueue_failed",
      agentRunId: agentRun.id,
      errorCategory,
    };
  }
}
