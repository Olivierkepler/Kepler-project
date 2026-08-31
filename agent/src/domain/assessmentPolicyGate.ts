import type {
  DirectDeltaEvidencePolicy,
  FieldVarianceAssessment,
  RecommendedAction,
} from "./assessment.js";

export type AssessmentPolicyGateResult =
  | { ok: true; action: RecommendedAction }
  | {
      ok: false;
      reason:
        | "request_evidence_but_evidence_exists"
        | "prepare_summary_but_evidence_missing"
        | "unsupported_action_for_policy";
      action: RecommendedAction;
    };

/**
 * Deterministic guard: policy wins over Gemini for documentation completeness.
 * - missing direct Delta Evidence → request_evidence | escalate
 * - direct Delta Evidence present → prepare_summary | escalate
 */
export function gateAssessmentAgainstEvidencePolicy(
  assessment: FieldVarianceAssessment,
  policy: DirectDeltaEvidencePolicy,
): AssessmentPolicyGateResult {
  const action = assessment.recommendedAction;

  if (!policy.hasDirectDeltaEvidence) {
    if (action === "request_evidence" || action === "escalate") {
      return { ok: true, action };
    }
    if (action === "prepare_summary") {
      return {
        ok: false,
        reason: "prepare_summary_but_evidence_missing",
        action,
      };
    }
    return {
      ok: false,
      reason: "unsupported_action_for_policy",
      action,
    };
  }

  if (action === "prepare_summary" || action === "escalate") {
    return { ok: true, action };
  }

  if (action === "request_evidence") {
    return {
      ok: false,
      reason: "request_evidence_but_evidence_exists",
      action,
    };
  }

  return {
    ok: false,
    reason: "unsupported_action_for_policy",
    action,
  };
}
