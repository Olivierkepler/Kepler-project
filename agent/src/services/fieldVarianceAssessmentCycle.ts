import type { EvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import type { FieldVarianceAgentRunner } from "../agent/fieldVarianceAgent.js";
import { runFieldVarianceAgentWithAdk } from "../agent/fieldVarianceAgent.js";
import type { FieldVarianceAssessment } from "../domain/assessment.js";
import { gateAssessmentWithEvidenceAnalysis } from "../domain/evidenceAnalysisGate.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import {
  AgentRunError,
  type AgentRun,
  type AgentRunPendingRequest,
} from "../domain/agentRun.js";
import { buildDeltaEvidenceRequestId } from "../domain/deltaEvidenceRequest.js";
import {
  REPLACEMENT_EVIDENCE_REQUEST_MESSAGE,
  classifyRecoverableEvidenceMediaFailure,
  isRecoverableEvidenceQualityError,
} from "../domain/recoverableEvidenceFailure.js";
import {
  categorizeExecutionError,
  isTransientProviderFailure,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import {
  requestAdditionalDeltaEvidence,
  requestDeltaEvidence,
  requestReplacementDeltaEvidence,
  updateAgentRunState,
} from "../repositories/agentRunsRepository.js";
import { resolveRequestedProjectMemberIdForPlanItem } from "./resolveEvidenceRequestRecipient.js";
import {
  analyzeEvidenceForAgentRun,
  type AnalyzeEvidenceDeps,
} from "./analyzeEvidence.js";
import {
  computeDirectDeltaEvidencePolicy,
  type DomainLoaders,
  type TrustedToolContext,
} from "../tools/toolContext.js";
import type { RequestDeltaEvidenceResult } from "../validation/agentRun.js";
import type { loadEvidencePhotoBytes } from "../storage/evidencePhotoStorage.js";

export type FieldVarianceAssessmentCycleResult =
  | {
      kind: "started";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      evidenceAnalysis: EvidenceAnalysis | null;
    }
  | {
      kind: "waiting_for_evidence";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      pendingRequest: AgentRunPendingRequest;
      requestOutcome: "created" | "existing";
      evidenceAnalysis: EvidenceAnalysis | null;
    }
  | {
      kind: "policy_mismatch";
      agentRun: AgentRun;
      assessment: FieldVarianceAssessment;
      deterministicPolicy: ReturnType<typeof computeDirectDeltaEvidencePolicy>;
      mismatchReason: string;
      evidenceAnalysis: EvidenceAnalysis | null;
    }
  | {
      kind: "failed";
      agentRun: AgentRun;
      errorCategory: string;
      message: string;
      evidenceAnalysis: EvidenceAnalysis | null;
    }
  | {
      kind: "transient_retry";
      agentRun: AgentRun;
      errorCategory: string;
      message: string;
      evidenceAnalysis: EvidenceAnalysis | null;
    };

export type FieldVarianceAssessmentCycleDeps = {
  updateAgentRunStateFn?: typeof updateAgentRunState;
  requestDeltaEvidenceFn?: typeof requestDeltaEvidence;
  requestReplacementDeltaEvidenceFn?: typeof requestReplacementDeltaEvidence;
  requestAdditionalDeltaEvidenceFn?: typeof requestAdditionalDeltaEvidence;
  resolveRequestedProjectMemberIdFn?: typeof resolveRequestedProjectMemberIdForPlanItem;
  loaders: DomainLoaders;
  runAgent?: FieldVarianceAgentRunner;
  runEvidenceAnalysis?: EvidenceAnalysisRunner;
  loadPhotoBytesFn?: typeof loadEvidencePhotoBytes;
  preferredEvidenceId?: string | null;
  model?: string;
  /** When false, skip A6 multimodal/text Evidence analysis (tests / A3-compat). Default true. */
  enableEvidenceAnalysis?: boolean;
};

/**
 * Shared A3/A4/A6 assessment cycle for an AgentRun already status=running.
 * Reused by start and A5 resume.
 * A6: after presence policy, analyze trusted Evidence before recommendation.
 * Does not persist report drafts (A7).
 */
export async function executeFieldVarianceAssessmentCycle(
  initialAgentRun: AgentRun,
  deps: FieldVarianceAssessmentCycleDeps,
): Promise<FieldVarianceAssessmentCycleResult> {
  const updateState = deps.updateAgentRunStateFn ?? updateAgentRunState;
  const requestEvidence = deps.requestDeltaEvidenceFn ?? requestDeltaEvidence;
  const requestReplacement =
    deps.requestReplacementDeltaEvidenceFn ?? requestReplacementDeltaEvidence;
  const requestAdditional =
    deps.requestAdditionalDeltaEvidenceFn ?? requestAdditionalDeltaEvidence;
  const resolveRecipient =
    deps.resolveRequestedProjectMemberIdFn ??
    resolveRequestedProjectMemberIdForPlanItem;
  const runAgent = deps.runAgent ?? runFieldVarianceAgentWithAdk;
  const model =
    deps.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-3.5-flash";
  const enableEvidenceAnalysis = deps.enableEvidenceAnalysis !== false;

  let agentRun = initialAgentRun;
  let evidenceAnalysis: EvidenceAnalysis | null = null;
  const toolContext: TrustedToolContext = {
    agentRun,
    loaders: deps.loaders,
  };

  async function reopenWaitingForReplacementEvidence(
    analysis: EvidenceAnalysis | null,
  ): Promise<FieldVarianceAssessmentCycleResult> {
    const requestId = buildDeltaEvidenceRequestId(agentRun.id);
    const requestedProjectMemberId = await resolveRecipient({
      projectId: agentRun.projectId,
      planItemId: agentRun.contextRefs.remotePlanItemId,
    });

    logAgentExecution({
      event: "agent_evidence_request_started",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      requestId,
      errorCategory: "unsupported_media",
    });

    const requestResult = await requestReplacement(agentRun.id, {
      message:
        analysis?.userVisibleRationale?.trim() ||
        REPLACEMENT_EVIDENCE_REQUEST_MESSAGE,
      requestedProjectMemberId,
    });

    agentRun = requestResult.agentRun;
    const pendingRequest = agentRun.pendingRequest;
    if (
      pendingRequest === null ||
      pendingRequest.kind !== "delta_evidence"
    ) {
      throw new AgentRunError(
        "evidence_request_missing_pending",
        "Replacement evidence request succeeded without pendingRequest",
      );
    }

    logAgentExecution({
      event:
        requestResult.outcome === "existing"
          ? "agent_evidence_request_existing"
          : "agent_evidence_request_created",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      requestId: pendingRequest.requestId,
      errorCategory: "unsupported_media",
    });

    logAgentExecution({
      event: "agent_waiting_for_evidence",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      requestId: pendingRequest.requestId,
      errorCategory: "unsupported_media",
    });

    // Synthetic assessment for cycle result typing — no model call for bad media.
    const assessment: FieldVarianceAssessment = {
      summary: "Submitted evidence could not be analyzed.",
      evidenceAssessment: "Evidence media is unusable for analysis.",
      recommendedAction: "request_evidence",
      userVisibleRationale: pendingRequest.message,
    };

    return {
      kind: "waiting_for_evidence",
      agentRun,
      assessment,
      deterministicPolicy: computeDirectDeltaEvidencePolicy({
        agentRun,
        evidence: await deps.loaders.getEvidenceForProject(agentRun.projectId),
      }),
      pendingRequest,
      requestOutcome: requestResult.outcome,
      evidenceAnalysis: analysis,
    };
  }

  try {
    const evidence = await deps.loaders.getEvidenceForProject(
      agentRun.projectId,
    );
    const deterministicPolicy = computeDirectDeltaEvidencePolicy({
      agentRun,
      evidence,
    });

    agentRun = await updateState(agentRun.id, {
      status: "running",
      currentStep: "check_evidence_policy",
    });

    if (enableEvidenceAnalysis && deterministicPolicy.hasDirectDeltaEvidence) {
      agentRun = await updateState(agentRun.id, {
        status: "running",
        currentStep: "analyze_evidence",
      });

      const analyzeDeps: AnalyzeEvidenceDeps = {
        loaders: deps.loaders,
        runEvidenceAnalysis: deps.runEvidenceAnalysis,
        loadPhotoBytesFn: deps.loadPhotoBytesFn,
        model,
        preferredEvidenceId:
          deps.preferredEvidenceId ?? agentRun.lastEvidenceId,
      };

      const analysisResult = await analyzeEvidenceForAgentRun(
        agentRun,
        deterministicPolicy,
        analyzeDeps,
      );

      if (analysisResult.kind === "analyzed") {
        evidenceAnalysis = analysisResult.analysis;
        if (evidenceAnalysis.relevance === "unsupported_media") {
          return await reopenWaitingForReplacementEvidence(evidenceAnalysis);
        }
      }
    }

    const assessment = await runAgent({
      agentRun,
      toolContext: { ...toolContext, agentRun },
      deterministicPolicy,
      model,
      evidenceAnalysis,
    });

    agentRun = await updateState(agentRun.id, {
      status: "running",
      currentStep: "assess_variance",
    });

    logAgentExecution({
      event: "agent_assessment_ready",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      attemptCount: agentRun.attemptCount,
      recommendedAction: assessment.recommendedAction,
    });

    const gate = gateAssessmentWithEvidenceAnalysis(
      assessment,
      deterministicPolicy,
      evidenceAnalysis,
    );

    if (!gate.ok) {
      logAgentExecution({
        event: "agent_evidence_request_policy_mismatch",
        agentRunId: agentRun.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        recommendedAction: assessment.recommendedAction,
        errorCategory: gate.reason,
      });
      return {
        kind: "policy_mismatch",
        agentRun,
        assessment,
        deterministicPolicy,
        mismatchReason: gate.reason,
        evidenceAnalysis,
      };
    }

    if (gate.action === "request_evidence") {
      // Presence policy gates whether analysis can start. After analysis, an
      // explicit request_evidence decision always reopens waiting_for_evidence —
      // even when qualifying Delta Evidence already exists (needs more docs).
      const requestId = buildDeltaEvidenceRequestId(agentRun.id);
      logAgentExecution({
        event: "agent_evidence_request_started",
        agentRunId: agentRun.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        requestId,
      });

      let requestResult: RequestDeltaEvidenceResult;
      try {
        const requestedProjectMemberId = await resolveRecipient({
          projectId: agentRun.projectId,
          planItemId: agentRun.contextRefs.remotePlanItemId,
        });

        if (deterministicPolicy.hasDirectDeltaEvidence) {
          requestResult = await requestAdditional(agentRun.id, {
            message: assessment.userVisibleRationale,
            requestedProjectMemberId,
          });
        } else {
          requestResult = await requestEvidence(agentRun.id, {
            message: assessment.userVisibleRationale,
            hasDirectDeltaEvidence: false,
            requestedProjectMemberId,
          });
        }
      } catch (error) {
        const errorCategory =
          error instanceof AgentRunError
            ? error.code
            : categorizeExecutionError(error);
        logAgentExecution({
          event: "agent_evidence_request_failed",
          agentRunId: agentRun.id,
          projectId: agentRun.projectId,
          workflowType: agentRun.workflowType,
          step: agentRun.currentStep,
          requestId,
          errorCategory,
        });
        throw error;
      }

      agentRun = requestResult.agentRun;
      const pendingRequest = agentRun.pendingRequest;
      if (
        pendingRequest === null ||
        pendingRequest.kind !== "delta_evidence"
      ) {
        throw new AgentRunError(
          "evidence_request_missing_pending",
          "Evidence request succeeded without pendingRequest",
        );
      }

      logAgentExecution({
        event:
          requestResult.outcome === "existing"
            ? "agent_evidence_request_existing"
            : "agent_evidence_request_created",
        agentRunId: agentRun.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        requestId: pendingRequest.requestId,
      });

      logAgentExecution({
        event: "agent_waiting_for_evidence",
        agentRunId: agentRun.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        requestId: pendingRequest.requestId,
      });

      return {
        kind: "waiting_for_evidence",
        agentRun,
        assessment,
        deterministicPolicy,
        pendingRequest,
        requestOutcome: requestResult.outcome,
        evidenceAnalysis,
      };
    }

    // prepare_summary — remain running at assess_variance for A3
    // compatibility. Start/resume advance prepare_summary / escalate.
    // A7 owns summary persistence; escalate is a terminal AgentRun write.
    return {
      kind: "started",
      agentRun,
      assessment,
      deterministicPolicy,
      evidenceAnalysis,
    };
  } catch (error) {
    if (
      isRecoverableEvidenceQualityError(error) ||
      classifyRecoverableEvidenceMediaFailure(error)
    ) {
      try {
        return await reopenWaitingForReplacementEvidence(evidenceAnalysis);
      } catch (recoveryError) {
        const errorCategory = categorizeExecutionError(recoveryError);
        try {
          agentRun = await updateState(agentRun.id, {
            status: "failed",
            currentStep: "failed",
            errorCategory,
          });
        } catch {
          // Best-effort failure transition.
        }
        return {
          kind: "failed",
          agentRun,
          errorCategory,
          message:
            recoveryError instanceof Error
              ? recoveryError.message
              : "agent_execution_failed",
          evidenceAnalysis,
        };
      }
    }

    const errorCategory = categorizeExecutionError(error);
    const attemptsRemain =
      agentRun.attemptCount < agentRun.maxAttempts &&
      isTransientProviderFailure(error);

    if (attemptsRemain) {
      logAgentExecution({
        event: "agent_execution_transient_requeue",
        agentRunId: agentRun.id,
        projectId: agentRun.projectId,
        workflowType: agentRun.workflowType,
        step: agentRun.currentStep,
        attemptCount: agentRun.attemptCount,
        errorCategory,
      });
      return {
        kind: "transient_retry",
        agentRun,
        errorCategory,
        message:
          error instanceof Error ? error.message : "agent_execution_failed",
        evidenceAnalysis,
      };
    }

    try {
      agentRun = await updateState(agentRun.id, {
        status: "failed",
        currentStep: "failed",
        errorCategory,
      });
    } catch {
      // Best-effort failure transition.
    }

    logAgentExecution({
      event: "agent_execution_failed",
      agentRunId: agentRun.id,
      projectId: agentRun.projectId,
      workflowType: agentRun.workflowType,
      step: agentRun.currentStep,
      attemptCount: agentRun.attemptCount,
      errorCategory,
    });

    return {
      kind: "failed",
      agentRun,
      errorCategory,
      message:
        error instanceof Error ? error.message : "agent_execution_failed",
      evidenceAnalysis,
    };
  }
}
