import type { FieldVarianceAssessment } from "../domain/assessment.js";
import type { AgentRun } from "../domain/agentRun.js";
import {
  AGENT_SUMMARY_SCHEMA_VERSION,
  buildAgentSummaryIdentityFromRun,
  type AgentSummary,
} from "../domain/agentSummary.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import { listDirectDeltaEvidence } from "../domain/evidenceSelection.js";
import type { Delta } from "../domain/delta.js";
import type { Evidence } from "../domain/evidence.js";
import { buildBoundedSummaryTexts } from "../domain/summaryText.js";
import { normalizeAgentSummary } from "../validation/agentSummary.js";

/**
 * Builds a validated AgentSummary from trusted records + A3/A6 outputs.
 * Numeric impact fields come only from persisted Delta.
 * No extra Gemini call.
 */
export function buildAgentSummaryFromTrustedSources(args: {
  agentRun: AgentRun;
  delta: Delta;
  evidence: Evidence[];
  assessment: FieldVarianceAssessment;
  analysis: EvidenceAnalysis;
  nowIso?: string;
}): AgentSummary {
  const { agentRun, delta, assessment, analysis } = args;
  const identity = buildAgentSummaryIdentityFromRun(agentRun);
  const nowIso = args.nowIso ?? new Date().toISOString();

  if (delta.id !== agentRun.contextRefs.remoteDeltaId) {
    throw new Error("delta_id_mismatch");
  }
  if (delta.projectId !== agentRun.projectId) {
    throw new Error("delta_project_mismatch");
  }

  const direct = listDirectDeltaEvidence(agentRun, args.evidence);
  const evidenceIds = [...new Set(direct.map((item) => item.id))].sort((a, b) =>
    a.localeCompare(b),
  );

  const texts = buildBoundedSummaryTexts({
    assessmentSummary: assessment.summary,
    assessmentEvidenceText: assessment.evidenceAssessment,
    assessmentRationale: assessment.userVisibleRationale,
    analysisDescription: analysis.description,
    analysisRationale: analysis.userVisibleRationale,
    suggestedFollowUp: analysis.suggestedFollowUp,
  });

  const candidate: AgentSummary = {
    id: identity.id,
    schemaVersion: AGENT_SUMMARY_SCHEMA_VERSION,
    ownerUid: identity.ownerUid,
    projectId: identity.projectId,
    agentRunId: identity.agentRunId,
    workflowType: "field_variance",
    remoteDeltaId: identity.remoteDeltaId,
    localDeltaId: identity.localDeltaId,
    remoteMeasurementId: identity.remoteMeasurementId,
    localMeasurementId: identity.localMeasurementId,
    remotePlanItemId: identity.remotePlanItemId,
    createdAt: nowIso,
    varianceSummary: texts.varianceSummary,
    documentationSummary: texts.documentationSummary,
    evidenceAssessment: {
      evidenceId: analysis.evidenceId,
      evidenceType: analysis.evidenceType,
      relevance: analysis.relevance,
      userVisibleRationale: texts.evidenceReviewRationale.slice(0, 2000),
    },
    documentedImpact: {
      plannedValue: delta.plannedValue,
      actualValue: delta.actualValue,
      difference: delta.difference,
      percentDifference: delta.percentDifference,
      costImpact: delta.costImpact,
      laborImpactHours: delta.laborImpactHours,
      scheduleImpactDays: delta.scheduleImpactDays,
    },
    recommendedHumanNextStep: texts.recommendedHumanNextStep,
    sourceRefs: { evidenceIds },
  };

  return normalizeAgentSummary(candidate);
}
