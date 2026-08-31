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
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import {
  createAgentSummaryAndCompleteRun,
  getAgentSummaryForRun,
} from "../repositories/agentSummariesRepository.js";
import {
  getAgentRunById,
  incrementAgentRunAttempt,
  requestDeltaEvidence,
  updateAgentRunState,
} from "../repositories/agentRunsRepository.js";
import { createFirestoreDomainLoaders } from "../tools/createLoaders.js";
import {
  computeDirectDeltaEvidencePolicy,
  type DomainLoaders,
} from "../tools/toolContext.js";
import type { loadEvidencePhotoBytes } from "../storage/evidencePhotoStorage.js";
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
  incrementAgentRunAttemptFn?: typeof incrementAgentRunAttempt;
  requestDeltaEvidenceFn?: typeof requestDeltaEvidence;
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
  const incrementAttempt =
    deps.incrementAgentRunAttemptFn ?? incrementAgentRunAttempt;
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

  let agentRun: AgentRun;
  try {
    agentRun = await incrementAttempt(existing.id);
  } catch (error) {
    const category =
      error instanceof AgentRunError
        ? error.code
        : categorizeExecutionError(error);

    if (category === "attempt_count_exceeds_max") {
      // A1 allows queued → running → failed (not queued → failed directly).
      const running = await updateState(existing.id, {
        status: "running",
        currentStep: "load_context",
        errorCategory: "attempt_count_exceeds_max",
      });
      const failed = await updateState(running.id, {
        status: "failed",
        currentStep: "failed",
        errorCategory: "attempt_count_exceeds_max",
      });
      logAgentExecution({
        event: "agent_execution_failed",
        agentRunId: failed.id,
        projectId: failed.projectId,
        workflowType: failed.workflowType,
        step: failed.currentStep,
        attemptCount: failed.attemptCount,
        errorCategory: "attempt_count_exceeds_max",
      });
      return {
        kind: "failed",
        agentRun: failed,
        errorCategory: "attempt_count_exceeds_max",
        message: "AgentRun maxAttempts exhausted",
      };
    }
    throw error;
  }

  agentRun = await updateState(agentRun.id, {
    status: "running",
    currentStep: "load_context",
    errorCategory: null,
  });

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
    resolveRequestedProjectMemberIdFn: deps.resolveRequestedProjectMemberIdFn,
    loaders,
    runAgent,
    runEvidenceAnalysis: deps.runEvidenceAnalysis,
    loadPhotoBytesFn: deps.loadPhotoBytesFn,
    enableEvidenceAnalysis: deps.enableEvidenceAnalysis,
    model,
  });

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
      const errorCategory = categorizeExecutionError(error);
      return {
        kind: "failed",
        agentRun: agentRunAfter,
        errorCategory,
        message:
          error instanceof Error ? error.message : "agent_escalation_failed",
      };
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
      return {
        kind: "failed",
        agentRun: prepared.agentRun,
        errorCategory: prepared.errorCategory,
        message: prepared.message,
      };
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
