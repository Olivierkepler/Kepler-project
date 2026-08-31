import type {
  DirectDeltaEvidencePolicy,
  FieldVarianceAssessment,
} from "../domain/assessment.js";
import { AgentRunError, type AgentRun } from "../domain/agentRun.js";
import {
  buildAgentSummaryId,
  type AgentSummary,
} from "../domain/agentSummary.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import { canPrepareAgentSummary } from "../domain/summaryGate.js";
import { buildBoundedSummaryTexts } from "../domain/summaryText.js";
import {
  categorizeExecutionError,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import {
  createAgentSummaryAndCompleteRun,
  getAgentSummaryForRun,
} from "../repositories/agentSummariesRepository.js";
import { getAgentRunById } from "../repositories/agentRunsRepository.js";
import type { DomainLoaders } from "../tools/toolContext.js";
import { buildAgentSummaryFromTrustedSources } from "./buildAgentSummary.js";

export type PrepareAgentSummaryResult =
  | {
      kind: "completed";
      agentRun: AgentRun;
      summary: AgentSummary;
      persistenceOutcome: "created" | "existing";
    }
  | {
      kind: "blocked";
      agentRun: AgentRun;
      reason: string;
    }
  | {
      kind: "failed";
      agentRun: AgentRun | null;
      errorCategory: string;
      message: string;
    };

export type PrepareAgentSummaryDeps = {
  getAgentRunByIdFn?: typeof getAgentRunById;
  getAgentSummaryForRunFn?: typeof getAgentSummaryForRun;
  createAgentSummaryAndCompleteRunFn?: typeof createAgentSummaryAndCompleteRun;
  loaders: DomainLoaders;
};

/**
 * Persists one bounded AgentSummary and completes the AgentRun when safe.
 * Reuses A3/A6 outputs — no additional Gemini call.
 */
export async function prepareFieldVarianceAgentSummary(args: {
  agentRun: AgentRun;
  assessment: FieldVarianceAssessment;
  deterministicPolicy: DirectDeltaEvidencePolicy;
  evidenceAnalysis: EvidenceAnalysis | null;
  deps: PrepareAgentSummaryDeps;
}): Promise<PrepareAgentSummaryResult> {
  const started = Date.now();
  const getById = args.deps.getAgentRunByIdFn ?? getAgentRunById;
  const getSummary =
    args.deps.getAgentSummaryForRunFn ?? getAgentSummaryForRun;
  const createAndComplete =
    args.deps.createAgentSummaryAndCompleteRunFn ??
    createAgentSummaryAndCompleteRun;

  const summaryId = buildAgentSummaryId(args.agentRun.id);

  logAgentExecution({
    event: "agent_summary_started",
    agentRunId: args.agentRun.id,
    summaryId,
    projectId: args.agentRun.projectId,
    workflowType: args.agentRun.workflowType,
    step: args.agentRun.currentStep,
    attemptCount: args.agentRun.attemptCount,
  });

  try {
    const existingRun = (await getById(args.agentRun.id)) ?? args.agentRun;

    if (
      existingRun.status === "completed" &&
      existingRun.outcome?.kind === "summary_ready" &&
      existingRun.outcome.summaryId
    ) {
      const existingSummary = await getSummary(existingRun.id);
      if (existingSummary) {
        logAgentExecution({
          event: "agent_summary_existing",
          agentRunId: existingRun.id,
          summaryId: existingSummary.id,
          projectId: existingRun.projectId,
          workflowType: existingRun.workflowType,
          step: existingRun.currentStep,
          attemptCount: existingRun.attemptCount,
          durationMs: Date.now() - started,
        });
        return {
          kind: "completed",
          agentRun: existingRun,
          summary: existingSummary,
          persistenceOutcome: "existing",
        };
      }
    }

    const gate = canPrepareAgentSummary({
      policy: args.deterministicPolicy,
      analysis: args.evidenceAnalysis,
      recommendedAction: args.assessment.recommendedAction,
    });

    if (!gate.ok) {
      logAgentExecution({
        event: "agent_summary_failed",
        agentRunId: existingRun.id,
        summaryId,
        projectId: existingRun.projectId,
        workflowType: existingRun.workflowType,
        step: existingRun.currentStep,
        errorCategory: gate.reason,
        durationMs: Date.now() - started,
      });
      return {
        kind: "blocked",
        agentRun: existingRun,
        reason: gate.reason,
      };
    }

    if (
      existingRun.status !== "running" ||
      existingRun.currentStep !== "prepare_summary"
    ) {
      logAgentExecution({
        event: "agent_summary_failed",
        agentRunId: existingRun.id,
        summaryId,
        projectId: existingRun.projectId,
        workflowType: existingRun.workflowType,
        step: existingRun.currentStep,
        errorCategory: "illegal_step_for_summary",
        durationMs: Date.now() - started,
      });
      return {
        kind: "blocked",
        agentRun: existingRun,
        reason: "illegal_step_for_summary",
      };
    }

    const analysis = args.evidenceAnalysis!;

    const [project, planItem, measurement, delta, evidence] =
      await Promise.all([
        args.deps.loaders.getProjectById(existingRun.projectId),
        args.deps.loaders.getPlanItemById(
          existingRun.contextRefs.remotePlanItemId,
        ),
        args.deps.loaders.getMeasurementById(
          existingRun.contextRefs.remoteMeasurementId,
        ),
        args.deps.loaders.getDeltaById(existingRun.contextRefs.remoteDeltaId),
        args.deps.loaders.getEvidenceForProject(existingRun.projectId),
      ]);

    if (!project || project.id !== existingRun.projectId) {
      throw new AgentRunError("project_missing", "Trusted project missing");
    }
    if (project.ownerUid !== existingRun.ownerUid) {
      throw new AgentRunError(
        "project_mismatch",
        "Project ownerUid does not match AgentRun",
      );
    }
    if (!planItem) {
      throw new AgentRunError("plan_item_missing", "Trusted plan item missing");
    }
    if (!measurement) {
      throw new AgentRunError(
        "measurement_missing",
        "Trusted measurement missing",
      );
    }
    if (!delta) {
      throw new AgentRunError("delta_missing", "Trusted delta missing");
    }

    const texts = buildBoundedSummaryTexts({
      assessmentSummary: args.assessment.summary,
      assessmentEvidenceText: args.assessment.evidenceAssessment,
      assessmentRationale: args.assessment.userVisibleRationale,
      analysisDescription: analysis.description,
      analysisRationale: analysis.userVisibleRationale,
      suggestedFollowUp: analysis.suggestedFollowUp,
    });

    const summary = buildAgentSummaryFromTrustedSources({
      agentRun: existingRun,
      delta,
      evidence,
      assessment: args.assessment,
      analysis,
    });

    logAgentExecution({
      event: "agent_summary_completion_started",
      agentRunId: existingRun.id,
      summaryId: summary.id,
      projectId: existingRun.projectId,
      workflowType: existingRun.workflowType,
      step: existingRun.currentStep,
      attemptCount: existingRun.attemptCount,
    });

    const persisted = await createAndComplete({
      agentRunId: existingRun.id,
      summary,
      userVisibleRationale: texts.userVisibleRationale,
    });

    logAgentExecution({
      event:
        persisted.outcome === "existing"
          ? "agent_summary_existing"
          : "agent_summary_created",
      agentRunId: persisted.agentRun.id,
      summaryId: persisted.summary.id,
      projectId: persisted.agentRun.projectId,
      workflowType: persisted.agentRun.workflowType,
      step: persisted.agentRun.currentStep,
      attemptCount: persisted.agentRun.attemptCount,
      durationMs: Date.now() - started,
    });

    logAgentExecution({
      event: "agent_summary_completed",
      agentRunId: persisted.agentRun.id,
      summaryId: persisted.summary.id,
      projectId: persisted.agentRun.projectId,
      workflowType: persisted.agentRun.workflowType,
      step: persisted.agentRun.currentStep,
      attemptCount: persisted.agentRun.attemptCount,
      durationMs: Date.now() - started,
    });

    return {
      kind: "completed",
      agentRun: persisted.agentRun,
      summary: persisted.summary,
      persistenceOutcome: persisted.outcome,
    };
  } catch (error) {
    const errorCategory =
      error instanceof AgentRunError
        ? error.code
        : categorizeExecutionError(error);
    logAgentExecution({
      event: "agent_summary_failed",
      agentRunId: args.agentRun.id,
      summaryId,
      projectId: args.agentRun.projectId,
      workflowType: args.agentRun.workflowType,
      step: args.agentRun.currentStep,
      attemptCount: args.agentRun.attemptCount,
      errorCategory,
      durationMs: Date.now() - started,
    });
    return {
      kind: "failed",
      agentRun: args.agentRun,
      errorCategory,
      message: error instanceof Error ? error.message : "summary_failed",
    };
  }
}
