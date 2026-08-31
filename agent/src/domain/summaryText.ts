const MAX_SUMMARY_TEXT = 2000;
const MAX_NEXT_STEP = 500;

const DEFAULT_VARIANCE_SUMMARY =
  "A field variance was documented between planned and measured values.";

const DEFAULT_DOCUMENTATION_SUMMARY =
  "Field Evidence was reviewed and supports documenting this difference for human review.";

const DEFAULT_HUMAN_NEXT_STEP =
  "Review the documented field difference and determine disposition.";

const DEFAULT_RATIONALE =
  "Agent documentation is ready for human review. This is not an approval or disposition.";

/** Evidence Review: relevance may corroborate conditions; numbers stay on Measurement/Delta. */
const DEFAULT_EVIDENCE_REVIEW_RATIONALE =
  "Evidence appears relevant to the documented field condition. Quantity and variance values come from the recorded measurement and Delta, not from the photo alone.";

const PROHIBITED_PATTERNS: RegExp[] = [
  /\baccept\b.*\bdelta\b/i,
  /\breject\b.*\bdelta\b/i,
  /\bresolve\b.*\bdelta\b/i,
  /\bapprov(e|ed|al)\b/i,
  /\bsafe to continue\b/i,
  /\bcode compliant\b/i,
  /\bcontract(ual)?\b/i,
  /\bcertif(y|ied|ication)\b/i,
  /\bwork is safe\b/i,
  /\bdisposition:\s*(accept|reject|resolve)/i,
  // Measurement grounding: photos must not be treated as independent quantity proof.
  /\b(photo|photograph|image)\b.{0,80}\b(confirm|confirms|confirmed|verify|verifies|verified|prove|proves|proven|establish|establishes)\b.{0,80}\b(measurement|length|quantity|ft\b|variance|difference)\b/i,
  /\b(confirm|confirms|confirmed|verify|verifies|verified|prove|proves|proven)\b.{0,80}\b(photo|photograph|image)\b.{0,80}\b(measurement|length|quantity|ft\b|variance|difference)\b/i,
  /\bindependently\b.{0,60}\b(confirm|verify|prove|establish|validate)/i,
  /\bwithout requiring additional (data|evidence|documentation)\b/i,
  /\bno additional (data|evidence|documentation)\b.{0,40}\b(required|needed)\b/i,
  /\brelevance\b.{0,60}\b(verif|confirm|prove).{0,40}\b(numeric|quantity|measurement|variance)\b/i,
];

/**
 * Strip markdown/code fences and collapse whitespace for user-facing text.
 */
export function normalizeSummaryProse(
  value: string | null | undefined,
  maxLen: number,
): string {
  if (!value) {
    return "";
  }
  let text = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_#>\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > maxLen) {
    text = text.slice(0, maxLen).trim();
  }
  return text;
}

export function containsProhibitedSummaryLanguage(value: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Bounds and sanitizes summary prose. Falls back when empty or unsafe.
 * Does not invent disposition/approval conclusions.
 */
export function sanitizeSummaryField(
  value: string | null | undefined,
  fallback: string,
  maxLen: number = MAX_SUMMARY_TEXT,
): string {
  const normalized = normalizeSummaryProse(value, maxLen);
  if (!normalized || containsProhibitedSummaryLanguage(normalized)) {
    return fallback;
  }
  return normalized;
}

export function buildBoundedSummaryTexts(args: {
  assessmentSummary: string;
  assessmentEvidenceText: string;
  assessmentRationale: string;
  analysisDescription?: string | null;
  analysisRationale?: string | null;
  suggestedFollowUp?: string | null;
}): {
  varianceSummary: string;
  documentationSummary: string;
  recommendedHumanNextStep: string;
  /** Operator-facing assessment rationale (AgentRun outcome / next step). */
  userVisibleRationale: string;
  /** Evidence Review copy — grounded analysis rationale, not assessment wrap-up. */
  evidenceReviewRationale: string;
} {
  const documentationSource =
    args.analysisDescription?.trim() ||
    args.assessmentEvidenceText ||
    args.analysisRationale ||
    "";

  const nextStepSource =
    args.suggestedFollowUp?.trim() || DEFAULT_HUMAN_NEXT_STEP;

  // Prefer A6 analysis rationale for Evidence Review. Do not fall back to A3
  // assessment wrap-up (that path overclaimed quantitative verification).
  const evidenceReviewSource = args.analysisRationale?.trim() || "";

  return {
    varianceSummary: sanitizeSummaryField(
      args.assessmentSummary,
      DEFAULT_VARIANCE_SUMMARY,
    ),
    documentationSummary: sanitizeSummaryField(
      documentationSource,
      DEFAULT_DOCUMENTATION_SUMMARY,
    ),
    recommendedHumanNextStep: sanitizeSummaryField(
      nextStepSource,
      DEFAULT_HUMAN_NEXT_STEP,
      MAX_NEXT_STEP,
    ),
    userVisibleRationale: sanitizeSummaryField(
      args.assessmentRationale,
      DEFAULT_RATIONALE,
    ),
    evidenceReviewRationale: sanitizeSummaryField(
      evidenceReviewSource,
      DEFAULT_EVIDENCE_REVIEW_RATIONALE,
    ),
  };
}

export const SUMMARY_TEXT_DEFAULTS = {
  DEFAULT_VARIANCE_SUMMARY,
  DEFAULT_DOCUMENTATION_SUMMARY,
  DEFAULT_HUMAN_NEXT_STEP,
  DEFAULT_RATIONALE,
  DEFAULT_EVIDENCE_REVIEW_RATIONALE,
} as const;
