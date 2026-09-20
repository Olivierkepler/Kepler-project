import type {
  DirectDeltaEvidencePolicy,
  FieldVarianceAssessment,
  RecommendedAction,
} from "./assessment.js";
import type { EvidenceAnalysis } from "./evidenceAnalysis.js";
import {
  gateAssessmentAgainstEvidencePolicy,
  type AssessmentPolicyGateResult,
} from "./assessmentPolicyGate.js";

/**
 * After Evidence analysis, refine the A3/A4 presence gate.
 * Presence remains deterministic; relevance can require additional documentation.
 */
export function gateAssessmentWithEvidenceAnalysis(
  assessment: FieldVarianceAssessment,
  policy: DirectDeltaEvidencePolicy,
  analysis: EvidenceAnalysis | null,
): AssessmentPolicyGateResult {
  const base = gateAssessmentAgainstEvidencePolicy(assessment, policy);
  if (!analysis || !policy.hasDirectDeltaEvidence) {
    return base;
  }

  const needsMore =
    analysis.needsAdditionalEvidence ||
    analysis.relevance === "unsupported_media" ||
    analysis.relevance === "not_relevant" ||
    analysis.relevance === "insufficient_information";

  const action: RecommendedAction = assessment.recommendedAction;

  // Bounded rule: possibly_relevant may prepare_summary unless needsAdditionalEvidence.
  if (
    analysis.relevance === "possibly_relevant" &&
    !analysis.needsAdditionalEvidence &&
    (action === "prepare_summary" || action === "escalate")
  ) {
    return { ok: true, action };
  }

  if (needsMore) {
    if (action === "request_evidence" || action === "escalate") {
      // Allowed: presence ≠ post-analysis decision. Cycle reopens waiting when
      // request_evidence is recommended even if Evidence already exists.
      return { ok: true, action };
    }
    if (action === "prepare_summary") {
      return {
        ok: false,
        reason: "prepare_summary_but_evidence_missing",
        action,
      };
    }
  }

  if (
    (analysis.relevance === "relevant" ||
      (analysis.relevance === "possibly_relevant" &&
        !analysis.needsAdditionalEvidence)) &&
    action === "request_evidence"
  ) {
    return {
      ok: false,
      reason: "request_evidence_but_evidence_exists",
      action,
    };
  }

  return base;
}
