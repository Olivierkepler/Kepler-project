import type { EvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import type { FieldVarianceAgentRunner } from "../agent/fieldVarianceAgent.js";
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
  getAgentRunById,
  requestDeltaEvidence,
  resumeFromDeltaEvidence,
  updateAgentRunState,
} from "../repositories/agentRunsRepository.js";
import { getEvidenceById } from "../repositories/evidenceRepository.js";
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

export type ResumeAgentRunResult =
  | {
      kind: "resumed";
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
      reason:
        | "already_resumed"
        | "terminal"
        | "not_waiting"
        | "evidence_mismatch"
        | "evidence_not_found"
        | "policy_unsatisfied"
        | "already_running";
    }
  | {
      kind: "failed";
      agentRun: AgentRun | null;
      errorCategory: string;
      message: string;
    };

export type ResumeAgentRunDeps = {
  getAgentRunByIdFn?: typeof getAgentRunById;
  getEvidenceByIdFn?: typeof getEvidenceById;
  resumeFromDeltaEvidenceFn?: typeof resumeFromDeltaEvidence;
  updateAgentRunStateFn?: typeof updateAgentRunState;
  requestDeltaEvidenceFn?: typeof requestDeltaEvidence;
  requestReplacementDeltaEvidenceFn?: FieldVarianceAssessmentCycleDeps["requestReplacementDeltaEvidenceFn"];
  requestAdditionalDeltaEvidenceFn?: FieldVarianceAssessmentCycleDeps["requestAdditionalDeltaEvidenceFn"];
  resolveRequestedProjectMemberIdFn?: FieldVarianceAssessmentCycleDeps["resolveRequestedProjectMemberIdFn"];
  loaders?: DomainLoaders;
  runAgent?: FieldVarianceAgentRunner;
  runEvidenceAnalysis?: EvidenceAnalysisRunner;
  loadPhotoBytesFn?: typeof loadEvidencePhotoBytes;
  enableEvidenceAnalysis?: boolean;
  /** Phase A7. Default true. A5/A6 regression tests set false. */
  enableSummaryPersistence?: boolean;
  createAgentSummaryAndCompleteRunFn?: typeof createAgentSummaryAndCompleteRun;
  getAgentSummaryForRunFn?: typeof getAgentSummaryForRun;
  model?: string;
};

/**
 * Trusted AgentRun resume after NEW Delta Evidence (Phase A5).
 * Only agentRunId + evidenceId are trusted from the task payload.
 */
export async function resumeAgentRunExecution(
  agentRunId: string,
  evidenceId: string,
  deps: ResumeAgentRunDeps = {},
): Promise<ResumeAgentRunResult> {
  const getById = deps.getAgentRunByIdFn ?? getAgentRunById;
  const getEvidence = deps.getEvidenceByIdFn ?? getEvidenceById;
  const resumeFn = deps.resumeFromDeltaEvidenceFn ?? resumeFromDeltaEvidence;
  const updateState = deps.updateAgentRunStateFn ?? updateAgentRunState;
  const requestEvidence = deps.requestDeltaEvidenceFn ?? requestDeltaEvidence;
  const loaders = deps.loaders ?? createFirestoreDomainLoaders();
  const model =
    deps.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.5-flash";

  logAgentExecution({
    event: "agent_resume_received",
    agentRunId,
    evidenceId,
  });

  const existing = await getById(agentRunId);
  if (!existing) {
    logAgentExecution({
      event: "agent_resume_failed",
      agentRunId,
      evidenceId,
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
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "terminal",
    });
    return { kind: "noop", agentRun: existing, reason: "terminal" };
  }

  if (existing.lastEvidenceId === evidenceId) {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "already_resumed",
    });
    return { kind: "noop", agentRun: existing, reason: "already_resumed" };
  }

  if (existing.status === "running") {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "already_running",
    });
    return { kind: "noop", agentRun: existing, reason: "already_running" };
  }

  if (
    existing.status !== "waiting_for_evidence" ||
    existing.currentStep !== "waiting_for_evidence" ||
    existing.pendingRequest === null ||
    existing.pendingRequest.kind !== "delta_evidence"
  ) {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      attemptCount: existing.attemptCount,
      noopReason: "not_waiting",
    });
    return { kind: "noop", agentRun: existing, reason: "not_waiting" };
  }

  const pendingBeforeClaim = existing.pendingRequest;

  const evidence = await getEvidence(evidenceId);
  if (!evidence) {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      noopReason: "evidence_not_found",
    });
    return { kind: "noop", agentRun: existing, reason: "evidence_not_found" };
  }

  if (
    evidence.projectId !== existing.projectId ||
    evidence.ownerUid !== existing.ownerUid ||
    evidence.localDeltaId === null ||
    evidence.localDeltaId !== existing.contextRefs.localDeltaId
  ) {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      noopReason: "evidence_mismatch",
    });
    return { kind: "noop", agentRun: existing, reason: "evidence_mismatch" };
  }

  logAgentExecution({
    event: "agent_resume_evidence_verified",
    agentRunId: existing.id,
    evidenceId: evidence.id,
    projectId: existing.projectId,
    workflowType: existing.workflowType,
    step: existing.currentStep,
  });

  const projectEvidence = await loaders.getEvidenceForProject(
    existing.projectId,
  );
  const prePolicy = computeDirectDeltaEvidencePolicy({
    agentRun: existing,
    evidence: projectEvidence,
  });
  if (!prePolicy.hasDirectDeltaEvidence) {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: existing.id,
      evidenceId: evidence.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      noopReason: "policy_unsatisfied",
    });
    return { kind: "noop", agentRun: existing, reason: "policy_unsatisfied" };
  }

  let agentRun: AgentRun;
  let claimOutcome: "resumed" | "already_resumed";
  try {
    const claim = await resumeFn(existing.id, { evidenceId: evidence.id });
    agentRun = claim.agentRun;
    claimOutcome = claim.outcome;
  } catch (error) {
    const errorCategory =
      error instanceof AgentRunError
        ? error.code
        : categorizeExecutionError(error);
    logAgentExecution({
      event: "agent_resume_failed",
      agentRunId: existing.id,
      evidenceId: evidence.id,
      projectId: existing.projectId,
      workflowType: existing.workflowType,
      step: existing.currentStep,
      errorCategory,
    });
    return {
      kind: "failed",
      agentRun: existing,
      errorCategory,
      message: error instanceof Error ? error.message : "resume_claim_failed",
    };
  }

  if (claimOutcome === "already_resumed") {
    logAgentExecution({
      event: "agent_resume_noop",
      agentRunId: agentRun.id,
      evidenceId: evidence.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      attemptCount: agentRun.attemptCount,
      noopReason: "already_resumed",
    });
    return { kind: "noop", agentRun, reason: "already_resumed" };
  }

  logAgentExecution({
    event: "agent_resume_started",
    agentRunId: agentRun.id,
    evidenceId: evidence.id,
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
    runAgent: deps.runAgent,
    runEvidenceAnalysis: deps.runEvidenceAnalysis,
    loadPhotoBytesFn: deps.loadPhotoBytesFn,
    enableEvidenceAnalysis: deps.enableEvidenceAnalysis,
    preferredEvidenceId: evidence.id,
    model,
  });

  if (cycle.kind === "transient_retry") {
    // Undo resume claim so the same CT resume delivery can re-claim safely.
    const restored = await updateState(cycle.agentRun.id, {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest: pendingBeforeClaim,
      lastEvidenceId: null,
      errorCategory: cycle.errorCategory,
    });
    logAgentExecution({
      event: "agent_execution_transient_requeue",
      agentRunId: restored.id,
      evidenceId: evidence.id,
      projectId: restored.projectId,
      workflowType: restored.workflowType,
      step: restored.currentStep,
      attemptCount: restored.attemptCount,
      errorCategory: cycle.errorCategory,
    });
    return {
      kind: "transient_retry",
      agentRun: restored,
      errorCategory: cycle.errorCategory,
      message: cycle.message,
    };
  }

  if (cycle.kind === "failed") {
    logAgentExecution({
      event: "agent_resume_failed",
      agentRunId: cycle.agentRun.id,
      evidenceId: evidence.id,
      projectId: cycle.agentRun.projectId,
      workflowType: cycle.agentRun.workflowType,
      step: cycle.agentRun.currentStep,
      attemptCount: cycle.agentRun.attemptCount,
      errorCategory: cycle.errorCategory,
    });
    return {
      kind: "failed",
      agentRun: cycle.agentRun,
      errorCategory: cycle.errorCategory,
      message: cycle.message,
    };
  }

  logAgentExecution({
    event: "agent_resume_completed_assessment",
    agentRunId: cycle.agentRun.id,
    evidenceId: evidence.id,
    projectId: cycle.agentRun.projectId,
    workflowType: cycle.agentRun.workflowType,
    step: cycle.agentRun.currentStep,
    attemptCount: cycle.agentRun.attemptCount,
    recommendedAction: cycle.assessment.recommendedAction,
  });

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
      if (
        agentRunAfter.attemptCount < agentRunAfter.maxAttempts &&
        isTransientProviderFailure(error)
      ) {
        const errorCategory = categorizeExecutionError(error);
        const restored = await updateState(agentRunAfter.id, {
          status: "waiting_for_evidence",
          currentStep: "waiting_for_evidence",
          pendingRequest: pendingBeforeClaim,
          lastEvidenceId: null,
          errorCategory,
        });
        logAgentExecution({
          event: "agent_execution_transient_requeue",
          agentRunId: restored.id,
          evidenceId: evidence.id,
          projectId: restored.projectId,
          workflowType: restored.workflowType,
          step: restored.currentStep,
          attemptCount: restored.attemptCount,
          errorCategory,
        });
        return {
          kind: "transient_retry",
          agentRun: restored,
          errorCategory,
          message:
            error instanceof Error ? error.message : "agent_escalation_failed",
        };
      }
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

  if (cycle.assessment.recommendedAction === "prepare_summary") {
    agentRunAfter = await updateState(agentRunAfter.id, {
      status: "running",
      currentStep: "prepare_summary",
    });
  }

  const enableSummary = deps.enableSummaryPersistence !== false;
  if (
    enableSummary &&
    cycle.assessment.recommendedAction === "prepare_summary"
  ) {
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

    agentRunAfter = prepared.agentRun;
  }

  return {
    kind: "resumed",
    agentRun: agentRunAfter,
    assessment: cycle.assessment,
    deterministicPolicy: cycle.deterministicPolicy,
  };
}
