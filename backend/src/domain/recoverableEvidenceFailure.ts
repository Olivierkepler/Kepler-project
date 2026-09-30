import {
  FIELD_VARIANCE_WORKFLOW_TYPE,
  type AgentRun,
} from "./agentRun.js";

/**
 * Stable machine-readable category for unusable Field Variance photo evidence.
 * Distinct from genuine execution failures that remain terminal `failed`.
 */
export const UNSUPPORTED_MEDIA_ERROR_CATEGORY = "unsupported_media" as const;

export const REPLACEMENT_EVIDENCE_REQUEST_MESSAGE =
  "The submitted photo could not be analyzed. Capture a clear replacement photo and try again.";

/**
 * Thrown / recognized only for evidence-quality failures at the analysis boundary.
 * Do not use for quota, auth, network, or repository errors.
 */
export class RecoverableEvidenceQualityError extends Error {
  readonly code: typeof UNSUPPORTED_MEDIA_ERROR_CATEGORY =
    UNSUPPORTED_MEDIA_ERROR_CATEGORY;

  constructor(message = "Evidence media cannot be analyzed") {
    super(message);
    this.name = "RecoverableEvidenceQualityError";
  }
}

export function isRecoverableEvidenceQualityError(
  error: unknown,
): error is RecoverableEvidenceQualityError {
  return (
    error instanceof RecoverableEvidenceQualityError ||
    (error !== null &&
      typeof error === "object" &&
      (error as { name?: string }).name === "RecoverableEvidenceQualityError" &&
      (error as { code?: string }).code === UNSUPPORTED_MEDIA_ERROR_CATEGORY)
  );
}

/**
 * Narrow normalization of provider/SDK textual decode failures into the
 * structured recoverable category. Intentionally does not match timeouts,
 * quota, auth, or generic server errors.
 */
export function classifyRecoverableEvidenceMediaFailure(
  error: unknown,
): RecoverableEvidenceQualityError | null {
  if (isRecoverableEvidenceQualityError(error)) {
    return error;
  }

  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string"
        ? error
        : "";

  const normalized = message.toLowerCase();
  if (!normalized) {
    return null;
  }

  const decodeSignals = [
    "failed to decode image",
    "decode image data",
    "unable to decode image",
    "cannot decode image",
    "invalid image",
    "image is valid",
    "unsupported image",
    "could not process image",
    "image data is invalid",
    "malformed image",
    "corrupt image",
    "corrupted image",
  ];

  if (decodeSignals.some((signal) => normalized.includes(signal))) {
    return new RecoverableEvidenceQualityError(message.slice(0, 200));
  }

  return null;
}

/**
 * True when a persisted errorCategory indicates recoverable unusable evidence.
 * Accepts the stable category and historical sanitized Gemini decode strings.
 */
export function isRecoverableEvidenceErrorCategory(
  errorCategory: string | null | undefined,
): boolean {
  if (!errorCategory || !errorCategory.trim()) {
    return false;
  }

  const trimmed = errorCategory.trim();
  if (trimmed === UNSUPPORTED_MEDIA_ERROR_CATEGORY) {
    return true;
  }

  return classifyRecoverableEvidenceMediaFailure(new Error(trimmed)) !== null;
}

/**
 * Narrow eligibility for explicit failed → waiting_for_evidence recovery.
 * Does not make every failed AgentRun recoverable.
 */
export function isEligibleForFailedEvidenceRecovery(
  agentRun: AgentRun,
): boolean {
  if (agentRun.workflowType !== FIELD_VARIANCE_WORKFLOW_TYPE) {
    return false;
  }

  if (agentRun.status !== "failed" || agentRun.currentStep !== "failed") {
    return false;
  }

  if (!isRecoverableEvidenceErrorCategory(agentRun.errorCategory)) {
    return false;
  }

  if (
    !agentRun.contextRefs.remoteDeltaId.trim() ||
    !agentRun.contextRefs.localDeltaId.trim()
  ) {
    return false;
  }

  return true;
}
