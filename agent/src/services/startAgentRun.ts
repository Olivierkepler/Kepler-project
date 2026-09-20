import type { EvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import type { FieldVarianceAgentRunner } from "../agent/fieldVarianceAgent.js";
import { runFieldVarianceAgentWithAdk } from "../agent/fieldVarianceAgent.js";
import type { FieldVarianceAssessment } from "../domain/assessment.js";
import {
  AgentRunError,
  isTerminalAgentRunStatus,
  type AgentRun,
  type AgentRunPendingRequest,
} from "../domain/agentRun.js";
import type { AgentSummary } from "../domain/agentSummary.js";
import {
  categorizeExecutionError,
  isTransientProviderFailure,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import {
  createAgentSummaryAndCompleteRun,
  getAgentSummaryForRun,
} from "../repositories/agentSummariesRepository.js";
import {
  claimQueuedAgentRunStart,
  getAgentRunById,
  requestDeltaEvidence,
  updateAgentRunState,
} from "../repositories/agentRunsRepository.js";
import { createFirestoreDomainLoaders } from "../tools/createLoaders.js";
import {
  computeDirectDeltaEvidencePolicy,
  type DomainLoaders,
} from "../tools/toolContext.js";
import type { loadEvidencePhotoBytes } from "../storage/evidencePhotoStorage.js";
import type { ClaimQueuedAgentRunStartResult } from "../validation/agentRun.js";
import { escalateFieldVarianceAgentRun } from "./escalateAgentRun.js";
import {
  executeFieldVarianceAssessmentCycle,
  type FieldVarianceAssessmentCycleDeps,
} from "./fieldVarianceAssessmentCycle.js";
import { prepareFieldVarianceAgentSummary } from "./prepareAgentSummary.js";

export type StartAgentRunResult =
  | {
      kind: "started";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
    }
  | {
      kind: "completed";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      summary: AgentSummary;
    }
  | {
      kind: "escalated";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
    }
  | {
      kind: "waiting_for_evidence";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      pendingRequest: AgentRunPendingRequest;
      requestOutcome: "created" | "existing";
    }
  | {
      kind: "policy_mismatch";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      mismatchReason: string;
    }
  | {
      kind: "transient_retry";
      agentRun: AgentRun;
      errorCategory: string;
      message: string;
    }
  | {
      kind: "noop";
      agentRun: AgentRun;
      reason: "already_running" | "terminal" | "waiting_for_evidence";
    }
  | {
      kind: "failed";
      agentRun: AgentRun | null;
      errorCategory: string;
      message: string;
    };

export type StartAgentRunDeps = {
  getAgentRunByIdFn?: typeof getAgentRunById;
  updateAgentRunStateFn?: typeof updateAgentRunState;
  claimQueuedAgentRunStartFn?: typeof claimQueuedAgentRunStart;
  requestDeltaEvidenceFn?: typeof requestDeltaEvidence;
  requestReplacementDeltaEvidenceFn?: FieldVarianceAssessmentCycleDeps["requestReplacementDeltaEvidenceFn"];
  requestAdditionalDeltaEvidenceFn?: FieldVarianceAssessmentCycleDeps["requestAdditionalDeltaEvidenceFn"];
  resolveRequestedProjectMemberIdFn?: FieldVarianceAssessmentCycleDeps["resolveRequestedProjectMemberIdFn"];
  loaders?: DomainLoaders;
  runAgent?: FieldVarianceAgentRunner;
  runEvidenceAnalysis?: EvidenceAnalysisRunner;
  loadPhotoBytesFn?: typeof loadEvidencePhotoBytes;
  enableEvidenceAnalysis?: boolean;
  /** Phase A7. Default true. Tests for A3–A6 set false. */
  enableSummaryPersistence?: boolean;
  createAgentSummaryAndCompleteRunFn?: typeof createAgentSummaryAndCompleteRun;
  getAgentSummaryForRunFn?: typeof getAgentSummaryForRun;
  model?: string;
};

function noopForUnclaimed(
  agentRun: AgentRun,
): Extract<StartAgentRunResult, { kind: "noop" }> {
  if (isTerminalAgentRunStatus(agentRun.status)) {
    return { kind: "noop", agentRun, reason: "terminal" };
  }
  if (agentRun.status === "waiting_for_evidence") {
    return { kind: "noop", agentRun, reason: "waiting_for_evidence" };
  }
  return { kind: "noop", agentRun, reason: "already_running" };
}

/**
 * Trusted AgentRun entry for Cloud Tasks start.
 * Only agentRunId is trusted from the task; all scope comes from Firestore.
 */
export async function startAgentRunExecution(
  agentRunId: string,
  deps: StartAgentRunDeps = {},
): Promise<StartAgentRunResult> {
  const getById = deps.getAgentRunByIdFn ?? getAgentRunById;
  const updateState = deps.updateAgentRunStateFn ?? updateAgentRunState;
  const claimStart =
    deps.claimQueuedAgentRunStartFn ?? claimQueuedAgentRunStart;
  const requestEvidence = deps.requestDeltaEvidenceFn ?? requestDeltaEvidence;
  const loaders = deps.loaders ?? createFirestoreDomainLoaders();
  const runAgent = deps.runAgent ?? runFieldVarianceAgentWithAdk;
  const model =
    deps.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.5-flash";

  logAgentExecution({
    event: "agent_execution_received",
    agentRunId,
  });

  const existing = await getById(agentRunId);
  if (!existing) {
    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId,
      errorCategory: "agent_run_not_found",
    });
    return {
      kind: "failed",
      agentRun: null,
      errorCategory: "agent_run_not_found",
      message: "AgentRun not found",
    };
  }

  if (isTerminalAgentRunStatus(existing.status)) {
    logAgentExecution({
      event: "agent_execution_noop",
      agentRunId: existing.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "terminal",
    });
    return { kind: "noop", agentRun: existing, reason: "terminal" };
  }

  if (existing.status === "waiting_for_evidence") {
    logAgentExecution({
      event: "agent_execution_noop",
      agentRunId: existing.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "waiting_for_evidence",
    });
    return {
      kind: "noop",
      agentRun: existing,
      reason: "waiting_for_evidence",
    };
  }

  if (existing.status === "running") {
    logAgentExecution({
      event: "agent_execution_noop",
      agentRunId: existing.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "already_running",
    });
    return { kind: "noop", agentRun: existing, reason: "already_running" };
  }

  let claim: ClaimQueuedAgentRunStartResult;
  try {
    claim = await claimStart(existing.id);
  } catch (error) {
    const category =
      error instanceof AgentRunError
        ? error.code
        : categorizeExecutionError(error);
    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId: existing.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      errorCategory: category,
    });
    return {
      kind: "failed",
      agentRun: existing,
      errorCategory: category,
      message: error instanceof Error ? error.message : "claim_failed",
    };
  }

  if (claim.outcome === "not_queued") {
    const noop = noopForUnclaimed(claim.agentRun);
    logAgentExecution({
      event: "agent_execution_noop",
      agentRunId: claim.agentRun.id,
      projectId: claim.agentRun.projectId,
      workflowType: claim.agentRun.workflowType,
      step: claim.agentRun.currentStep,
      attemptCount: claim.agentRun.attemptCount,
      noopReason: noop.reason,
    });
    return noop;
  }

  if (claim.outcome === "attempt_exhausted") {
    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId: claim.agentRun.id,
      projectId: claim.agentRun.projectId,
      workflowType: claim.agentRun.workflowType,
      step: claim.agentRun.currentStep,
      attemptCount: claim.agentRun.attemptCount,
      errorCategory: "attempt_count_exceeds_max",
    });
    return {
      kind: "failed",
      agentRun: claim.agentRun,
      errorCategory: "attempt_count_exceeds_max",
      message: "AgentRun maxAttempts exhausted",
    };
  }

  const agentRun = claim.agentRun;

  logAgentExecution({
    event: "agent_execution_started",
    agentRunId: agentRun.id,
    projectId: agentRun.projectId,
    workflowType: agentRun.workflowType,
    step: agentRun.currentStep,
    attemptCount: agentRun.attemptCount,
  });

  const cycle = await executeFieldVarianceAssessmentCycle(agentRun, {
    updateAgentRunStateFn: updateState,
    requestDeltaEvidenceFn: requestEvidence,
    requestReplacementDeltaEvidenceFn: deps.requestReplacementDeltaEvidenceFn,
    requestAdditionalDeltaEvidenceFn: deps.requestAdditionalDeltaEvidenceFn,
    resolveRequestedProjectMemberIdFn: deps.resolveRequestedProjectMemberIdFn,
    loaders,
    runAgent,
    runEvidenceAnalysis: deps.runEvidenceAnalysis,
    loadPhotoBytesFn: deps.loadPhotoBytesFn,
    enableEvidenceAnalysis: deps.enableEvidenceAnalysis,
    model,
  });

  if (cycle.kind === "transient_retry") {
    const requeued = await updateState(cycle.agentRun.id, {
      status: "queued",
      currentStep: "queued",
      errorCategory: cycle.errorCategory,
    });
    logAgentExecution({
      event: "agent_execution_transient_requeue",
      agentRunId: requeued.id,
      projectId: requeued.projectId,
      workflowType: requeued.workflowType,
      step: requeued.currentStep,
      attemptCount: requeued.attemptCount,
      errorCategory: cycle.errorCategory,
    });
    return {
      kind: "transient_retry",
      agentRun: requeued,
      errorCategory: cycle.errorCategory,
      message: cycle.message,
    };
  }

  if (cycle.kind === "failed") {
    return {
      kind: "failed",
      agentRun: cycle.agentRun,
      errorCategory: cycle.errorCategory,
      message: cycle.message,
    };
  }

  if (cycle.kind === "policy_mismatch") {
    return {
      kind: "policy_mismatch",
      agentRun: cycle.agentRun,
      assessment: cycle.assessment,
      deterministicPolicy: cycle.deterministicPolicy,
      mismatchReason: cycle.mismatchReason,
    };
  }

  if (cycle.kind === "waiting_for_evidence") {
    return {
      kind: "waiting_for_evidence",
      agentRun: cycle.agentRun,
      assessment: cycle.assessment,
      deterministicPolicy: cycle.deterministicPolicy,
      pendingRequest: cycle.pendingRequest,
      requestOutcome: cycle.requestOutcome,
    };
  }

  let agentRunAfter = cycle.agentRun;

  if (cycle.assessment.recommendedAction === "escalate") {
    try {
      agentRunAfter = await escalateFieldVarianceAgentRun({
        agentRun: agentRunAfter,
        assessment: cycle.assessment,
        deps: { updateAgentRunStateFn: updateState },
      });
      return {
        kind: "escalated",
        agentRun: agentRunAfter,
        assessment: cycle.assessment,
        deterministicPolicy: cycle.deterministicPolicy,
      };
    } catch (error) {
      return await finalizePostCycleProviderFailure({
        agentRun: agentRunAfter,
        error,
        updateState,
      });
    }
  }

  const enableSummary = deps.enableSummaryPersistence !== false;

  if (
    enableSummary &&
    cycle.assessment.recommendedAction === "prepare_summary"
  ) {
    agentRunAfter = await updateState(agentRunAfter.id, {
      status: "running",
      currentStep: "prepare_summary",
    });

    const prepared = await prepareFieldVarianceAgentSummary({
      agentRun: agentRunAfter,
      assessment: cycle.assessment,
      deterministicPolicy: cycle.deterministicPolicy,
      evidenceAnalysis: cycle.evidenceAnalysis,
      deps: {
        loaders,
        getAgentRunByIdFn: getById,
        getAgentSummaryForRunFn: deps.getAgentSummaryForRunFn,
        createAgentSummaryAndCompleteRunFn:
          deps.createAgentSummaryAndCompleteRunFn,
      },
    });

    if (prepared.kind === "completed") {
      return {
        kind: "completed",
        agentRun: prepared.agentRun,
        assessment: cycle.assessment,
        deterministicPolicy: cycle.deterministicPolicy,
        summary: prepared.summary,
      };
    }

    if (prepared.kind === "failed") {
      return await finalizePostCycleProviderFailure({
        agentRun: prepared.agentRun ?? agentRunAfter,
        error: new Error(prepared.message),
        updateState,
        errorCategory: prepared.errorCategory,
      });
    }

    // Blocked (e.g. missing analysis) — remain at prepare_summary for later.
    agentRunAfter = prepared.agentRun;
  }

  return {
    kind: "started",
    agentRun: agentRunAfter,
    assessment: cycle.assessment,
    deterministicPolicy: cycle.deterministicPolicy,
  };
}

async function finalizePostCycleProviderFailure(args: {
  agentRun: AgentRun;
  error: unknown;
  updateState: typeof updateAgentRunState;
  errorCategory?: string;
}): Promise<
  Extract<StartAgentRunResult, { kind: "failed" | "transient_retry" }>
> {
  const errorCategory =
    args.errorCategory ?? categorizeExecutionError(args.error);
  const message =
    args.error instanceof Error
      ? args.error.message
      : "agent_execution_failed";

  if (
    args.agentRun.attemptCount < args.agentRun.maxAttempts &&
    isTransientProviderFailure(args.errorCategory ?? args.error)
  ) {
    const requeued = await args.updateState(args.agentRun.id, {
      status: "queued",
      currentStep: "queued",
      errorCategory,
    });
    logAgentExecution({
      event: "agent_execution_transient_requeue",
      agentRunId: requeued.id,
      projectId: requeued.projectId,
      workflowType: requeued.workflowType,
      step: requeued.currentStep,
      attemptCount: requeued.attemptCount,
      errorCategory,
    });
    return {
      kind: "transient_retry",
      agentRun: requeued,
      errorCategory,
      message,
    };
  }

  let failedRun = args.agentRun;
  if (failedRun.status !== "failed") {
    try {
      failedRun = await args.updateState(failedRun.id, {
        status: "failed",
        currentStep: "failed",
        errorCategory,
      });
    } catch {
      // Best-effort.
    }
  }

  return {
    kind: "failed",
    agentRun: failedRun,
    errorCategory,
    message,
  };
}
