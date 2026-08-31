import { z, ZodError } from "zod";

import { formatZodIssueDiagnostics } from "./assessment.js";

export const EVIDENCE_RELEVANCE_VALUES = [
  "relevant",
  "possibly_relevant",
  "not_relevant",
  "insufficient_information",
  "unsupported_media",
] as const;

export type EvidenceRelevance = (typeof EVIDENCE_RELEVANCE_VALUES)[number];

/**
 * Structured Evidence analysis (Phase A6).
 * Presence remains deterministic; this captures Gemini-assisted relevance/quality.
 * No chain-of-thought fields.
 *
 * evidenceId / evidenceType are app-owned (trusted Evidence record).
 * All other fields are model-owned interpretive analysis.
 */
export const evidenceAnalysisSchema = z.object({
  evidenceId: z.string().min(1).max(200),
  evidenceType: z.enum(["photo", "note"]),
  relevance: z.enum(EVIDENCE_RELEVANCE_VALUES),
  description: z.string().min(1).max(2000),
  supportsDocumentedVariance: z.boolean().nullable(),
  needsAdditionalEvidence: z.boolean(),
  suggestedFollowUp: z.string().max(500).nullable(),
  userVisibleRationale: z.string().min(1).max(2000),
});

export type EvidenceAnalysis = z.infer<typeof evidenceAnalysisSchema>;

/** Trusted identity from the selected Evidence record — never from the model. */
export type TrustedEvidenceIdentity = {
  evidenceId: string;
  evidenceType: "photo" | "note";
};

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

function normalizeRelevance(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeNullableString(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Unwraps a single common wrapper when the inner payload looks like analysis.
 * Does not invent fields.
 */
function unwrapEvidenceAnalysisEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const wrapperKeys = [
    "analysis",
    "evidenceAnalysis",
    "result",
    "data",
  ] as const;

  for (const key of wrapperKeys) {
    const inner = value[key];
    if (!isRecord(inner)) {
      continue;
    }

    const hasAnalysisShape =
      "relevance" in inner ||
      "description" in inner ||
      "userVisibleRationale" in inner ||
      "needsAdditionalEvidence" in inner ||
      "supportsDocumentedVariance" in inner;

    if (hasAnalysisShape) {
      return inner;
    }
  }

  return value;
}

/**
 * Minimal, semantics-preserving normalization of model analysis fields.
 * Does not invent relevance/booleans; does not trust model identity fields.
 */
export function normalizeEvidenceAnalysisModelInput(value: unknown): unknown {
  const unwrapped = unwrapEvidenceAnalysisEnvelope(value);
  if (!isRecord(unwrapped)) {
    return unwrapped;
  }

  const relevance = normalizeRelevance(
    unwrapped.relevance ?? unwrapped.evidenceRelevance,
  );
  const description = firstNonEmptyString(
    unwrapped.description,
    unwrapped.observations,
    unwrapped.summary,
  );
  const userVisibleRationale = firstNonEmptyString(
    unwrapped.userVisibleRationale,
    unwrapped.rationale,
    unwrapped.reason,
  );
  const suggestedFollowUp = normalizeNullableString(
    unwrapped.suggestedFollowUp ?? unwrapped.followUp ?? unwrapped.suggestion,
  );

  const next: Record<string, unknown> = { ...unwrapped };

  if (relevance !== undefined) {
    next.relevance = relevance;
  }
  if (description !== undefined) {
    next.description = description;
  }
  if (userVisibleRationale !== undefined) {
    next.userVisibleRationale = userVisibleRationale;
  }
  if (
    suggestedFollowUp !== undefined &&
    ("suggestedFollowUp" in unwrapped ||
      "followUp" in unwrapped ||
      "suggestion" in unwrapped)
  ) {
    next.suggestedFollowUp = suggestedFollowUp;
  }

  return next;
}

/**
 * Composes a Zod-ready payload: trusted Evidence identity + model analysis.
 * Model-returned evidenceId / evidenceType are discarded (never authoritative).
 * Does not mutate the input object.
 */
export function composeEvidenceAnalysisInput(
  modelValue: unknown,
  trusted: TrustedEvidenceIdentity,
): unknown {
  const evidenceId = trusted.evidenceId.trim();
  const evidenceType = trusted.evidenceType;

  if (!evidenceId) {
    throw new Error("trusted_evidence_id_required");
  }
  if (evidenceType !== "photo" && evidenceType !== "note") {
    throw new Error("trusted_evidence_type_invalid");
  }

  const normalized = normalizeEvidenceAnalysisModelInput(modelValue);
  if (!isRecord(normalized)) {
    return {
      evidenceId,
      evidenceType,
    };
  }

  const {
    evidenceId: _modelEvidenceId,
    evidenceType: _modelEvidenceType,
    ...modelFields
  } = normalized;

  return {
    ...modelFields,
    evidenceId,
    evidenceType,
  };
}

/**
 * Validates an already-composed EvidenceAnalysis object (strict Zod).
 */
export function parseEvidenceAnalysis(value: unknown): EvidenceAnalysis {
  try {
    return evidenceAnalysisSchema.parse(value);
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

/**
 * Parse model structured output by composing trusted Evidence identity first.
 * Prefer this path for ADK/Gemini Evidence analysis results.
 */
export function parseEvidenceAnalysisFromModel(
  modelValue: unknown,
  trusted: TrustedEvidenceIdentity,
): EvidenceAnalysis {
  const composed = composeEvidenceAnalysisInput(modelValue, trusted);
  return parseEvidenceAnalysis(composed);
}

export type EvidenceAnalysisSkipReason =
  | "no_direct_delta_evidence"
  | "no_analyzable_evidence";

export type EvidencePhotoLoadError =
  | "missing_object"
  | "unsupported_media"
  | "too_large"
  | "mime_mismatch"
  | "download_failed";
