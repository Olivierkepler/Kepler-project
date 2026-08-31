import type {
  DirectDeltaEvidencePolicy,
  RecommendedAction,
} from "./assessment.js";
import type { EvidenceAnalysis } from "./evidenceAnalysis.js";

export type SummaryPreparationGateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_direct_delta_evidence"
        | "missing_evidence_analysis"
        | "relevance_blocks_summary"
        | "needs_additional_evidence"
        | "recommended_action_not_prepare_summary";
    };

/**
 * A7 may persist a summary only when presence + A6 relevance allow it.
 *
 * relevant → allow
 * possibly_relevant && !needsAdditionalEvidence → allow (conservative)
 * not_relevant | insufficient_information | unsupported_media → block
 */
export function canPrepareAgentSummary(args: {
  policy: DirectDeltaEvidencePolicy;
  analysis: EvidenceAnalysis | null;
  recommendedAction: RecommendedAction;
}): SummaryPreparationGateResult {
  if (args.recommendedAction !== "prepare_summary") {
    return { ok: false, reason: "recommended_action_not_prepare_summary" };
  }

  if (!args.policy.hasDirectDeltaEvidence) {
    return { ok: false, reason: "missing_direct_delta_evidence" };
  }

  if (!args.analysis) {
    return { ok: false, reason: "missing_evidence_analysis" };
  }

  if (args.analysis.needsAdditionalEvidence) {
    return { ok: false, reason: "needs_additional_evidence" };
  }

  if (args.analysis.relevance === "relevant") {
    return { ok: true };
  }

  if (args.analysis.relevance === "possibly_relevant") {
    return { ok: true };
  }

  return { ok: false, reason: "relevance_blocks_summary" };
}
