import { z, ZodError } from "zod";

export const RECOMMENDED_ACTIONS = [
  "request_evidence",
  "prepare_summary",
  "escalate",
] as const;

export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

/**
 * Structured Field Variance assessment produced by Gemini via ADK.
 * No chain-of-thought / hidden reasoning fields.
 */
export const fieldVarianceAssessmentSchema = z.object({
  summary: z.string().min(1).max(2000),
  evidenceAssessment: z.string().min(1).max(2000),
  recommendedAction: z.enum(RECOMMENDED_ACTIONS),
  userVisibleRationale: z.string().min(1).max(2000),
});

export type FieldVarianceAssessment = z.infer<
  typeof fieldVarianceAssessmentSchema
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeRecommendedAction(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return normalized;
}

function normalizeEvidenceAssessment(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!isRecord(value)) {
    return value;
  }

  // Harmless unwrap: model sometimes emits an object with a prose field.
  return (
    firstNonEmptyString(
      value.text,
      value.description,
      value.assessment,
      value.summary,
      value.evidenceAssessment,
      value.userVisibleRationale,
    ) ?? value
  );
}

/**
 * Unwraps a single common wrapper object when the inner payload looks like an
 * assessment. Does not invent fields.
 */
function unwrapAssessmentEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const wrapperKeys = [
    "assessment",
    "fieldVarianceAssessment",
    "result",
    "data",
  ] as const;

  for (const key of wrapperKeys) {
    const inner = value[key];
    if (!isRecord(inner)) {
      continue;
    }

    const hasAssessmentShape =
      "summary" in inner ||
      "varianceSummary" in inner ||
      "recommendedAction" in inner ||
      "action" in inner ||
      "userVisibleRationale" in inner ||
      "rationale" in inner;

    if (hasAssessmentShape) {
      return inner;
    }
  }

  return value;
}

/**
 * Minimal, semantics-preserving normalization before Zod validation.
 * Maps only known alias / formatting differences. Does not invent defaults.
 */
export function normalizeFieldVarianceAssessmentInput(
  value: unknown,
): unknown {
  const unwrapped = unwrapAssessmentEnvelope(value);
  if (!isRecord(unwrapped)) {
    return unwrapped;
  }

  const summary = firstNonEmptyString(
    unwrapped.summary,
    unwrapped.varianceSummary,
  );
  const evidenceAssessment = normalizeEvidenceAssessment(
    unwrapped.evidenceAssessment ?? unwrapped.documentationSummary,
  );
  const recommendedAction = normalizeRecommendedAction(
    unwrapped.recommendedAction ?? unwrapped.action ?? unwrapped.recommendation,
  );
  const userVisibleRationale = firstNonEmptyString(
    unwrapped.userVisibleRationale,
    unwrapped.rationale,
    unwrapped.reason,
  );

  const next: Record<string, unknown> = { ...unwrapped };

  if (summary !== undefined) {
    next.summary = summary;
  }
  if (evidenceAssessment !== undefined) {
    next.evidenceAssessment = evidenceAssessment;
  }
  if (recommendedAction !== undefined) {
    next.recommendedAction = recommendedAction;
  }
  if (userVisibleRationale !== undefined) {
    next.userVisibleRationale = userVisibleRationale;
  }

  return next;
}

/**
 * Safe Zod diagnostics for structured logs.
 * Emits field paths, issue codes, and expected categories only — never values.
 */
export function formatZodIssueDiagnostics(
  error: ZodError,
  maxLength = 80,
): string {
  const parts = error.issues.slice(0, 4).map((issue) => {
    const path =
      issue.path.length > 0
        ? issue.path.map(String).join(".")
        : "(root)";
    const expected =
      "expected" in issue && issue.expected !== undefined
        ? ` expected=${String(issue.expected)}`
        : "";
    return `${path}:${issue.code}${expected}`;
  });

  const body = parts.join("; ");
  const prefix = "ZodError ";
  return `${prefix}${body}`.slice(0, maxLength);
}

export function parseFieldVarianceAssessment(
  value: unknown,
): FieldVarianceAssessment {
  const normalized = normalizeFieldVarianceAssessmentInput(value);

  try {
    return fieldVarianceAssessmentSchema.parse(normalized);
  } catch (error) {
    if (error instanceof ZodError) {
      const diagnostic = new Error(formatZodIssueDiagnostics(error));
      diagnostic.name = "ZodError";
      (diagnostic as Error & { issues?: ZodError["issues"] }).issues =
        error.issues;
      throw diagnostic;
    }
    throw error;
  }
}

export type DirectDeltaEvidencePolicy = {
  hasDirectDeltaEvidence: boolean;
  directDeltaEvidenceCount: number;
};
