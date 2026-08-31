/**
 * PlanImportCandidate — proposed measurable baseline items from document
 * intelligence (Phase 2P.3+) with human review state (Phase 2P.4).
 *
 * UNTRUSTED proposed data until a human approves in Phase 2P.5+.
 * Never create PlanItems from candidates in 2P.3 or 2P.4.
 *
 * Effective fields (label, type, plannedValue, unit, description) may be
 * human-edited. Original AI extraction is preserved in original* fields.
 */

export type PlanImportCandidateType =
  | "length"
  | "count"
  | "area"
  | "volume"
  | "other";

/**
 * Human review state — independent from AI confidence and selection.
 * New extractions candidates start as "unreviewed".
 */
export type PlanImportCandidateReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "needs_attention";

export type PlanImportCandidate = {
  id: string;
  importId: string;
  projectId: string;

  /** Effective (possibly human-edited) label. */
  label: string;
  type: PlanImportCandidateType;
  plannedValue?: number;
  unit?: string;
  description?: string;

  /** Remote PlanImportFile.id — required provenance (immutable). */
  sourceFileId: string;
  sourcePage?: number;
  sourceReference?: string;
  sourceExcerpt?: string;

  /** 0.0–1.0 model confidence (immutable after extraction). */
  confidence: number;

  /** Whether candidate is intended for eventual Plan inclusion. */
  selected: boolean;

  /** Human review status (server-owned transitions). */
  reviewStatus: PlanImportCandidateReviewStatus;

  /** Preserved AI extraction — set at create; never overwritten by edits. */
  originalLabel: string;
  originalType: PlanImportCandidateType;
  originalPlannedValue?: number;
  originalUnit?: string;

  /** Server-derived review audit (never from client). */
  reviewedByUid?: string;
  reviewedAt?: string;

  /**
   * Remote PlanItem.id created from this candidate (Phase 2P.5).
   * Server-only; immutable after approval; never client-supplied.
   */
  createdPlanItemId?: string;

  createdAt: string;
  updatedAt: string;
};

export const PLAN_IMPORT_CANDIDATE_TYPES: readonly PlanImportCandidateType[] = [
  "length",
  "count",
  "area",
  "volume",
  "other",
] as const;

export const PLAN_IMPORT_CANDIDATE_REVIEW_STATUSES: readonly PlanImportCandidateReviewStatus[] =
  ["unreviewed", "reviewed", "needs_attention"] as const;

export function isPlanImportCandidateType(
  value: unknown,
): value is PlanImportCandidateType {
  return (
    typeof value === "string" &&
    (PLAN_IMPORT_CANDIDATE_TYPES as readonly string[]).includes(value)
  );
}

export function isPlanImportCandidateReviewStatus(
  value: unknown,
): value is PlanImportCandidateReviewStatus {
  return (
    typeof value === "string" &&
    (PLAN_IMPORT_CANDIDATE_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

function isMeasurableType(type: PlanImportCandidateType): boolean {
  return (
    type === "length" ||
    type === "count" ||
    type === "area" ||
    type === "volume"
  );
}

/**
 * Required-field errors that block approval readiness for selected candidates.
 * Low confidence alone does not block once the human has reviewed.
 */
export function candidateHasUnresolvedRequiredErrors(
  candidate: Pick<
    PlanImportCandidate,
    "label" | "type" | "plannedValue" | "unit" | "sourceFileId"
  >,
): boolean {
  if (!candidate.label.trim()) {
    return true;
  }
  if (!candidate.sourceFileId.trim()) {
    return true;
  }

  if (isMeasurableType(candidate.type)) {
    if (
      candidate.plannedValue === undefined ||
      !Number.isFinite(candidate.plannedValue) ||
      candidate.plannedValue < 0
    ) {
      return true;
    }
    if (!candidate.unit || !candidate.unit.trim()) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministic "needs attention" rules for UI filters/badges (not AI-decided).
 * Broader than required-field errors (includes low confidence / thin provenance).
 */
export function candidateNeedsAttention(
  candidate: Pick<
    PlanImportCandidate,
    | "label"
    | "type"
    | "plannedValue"
    | "unit"
    | "confidence"
    | "sourceFileId"
    | "sourcePage"
    | "sourceReference"
  >,
): boolean {
  if (candidateHasUnresolvedRequiredErrors(candidate)) {
    return true;
  }
  if (candidate.confidence < 0.6) {
    return true;
  }

  // Provenance incomplete beyond sourceFileId (conservative).
  const hasPage =
    typeof candidate.sourcePage === "number" &&
    Number.isInteger(candidate.sourcePage) &&
    candidate.sourcePage >= 1;
  const hasReference = Boolean(candidate.sourceReference?.trim());
  if (!hasPage && !hasReference) {
    return true;
  }

  return false;
}

/**
 * Stricter PlanItem-compatible checks for selected candidates at approval time.
 * Type "other" cannot become a PlanItem. plannedValue must be > 0.
 */
export function candidateIsPlanItemCompatible(
  candidate: Pick<
    PlanImportCandidate,
    "label" | "type" | "plannedValue" | "unit" | "sourceFileId"
  >,
): boolean {
  if (candidate.type === "other") {
    return false;
  }
  if (!candidate.label.trim()) {
    return false;
  }
  if (!candidate.sourceFileId.trim()) {
    return false;
  }
  if (
    candidate.plannedValue === undefined ||
    !Number.isFinite(candidate.plannedValue) ||
    candidate.plannedValue <= 0
  ) {
    return false;
  }
  if (!candidate.unit || !candidate.unit.trim()) {
    return false;
  }
  return true;
}

export function candidateHasHumanEdits(
  candidate: PlanImportCandidate,
): boolean {
  if (candidate.label !== candidate.originalLabel) {
    return true;
  }
  if (candidate.type !== candidate.originalType) {
    return true;
  }
  const currentValue = candidate.plannedValue;
  const originalValue = candidate.originalPlannedValue;
  if (currentValue !== originalValue) {
    // Treat undefined vs undefined as equal; undefined vs number as edit.
    if (!(currentValue === undefined && originalValue === undefined)) {
      return true;
    }
  }
  const currentUnit = candidate.unit ?? "";
  const originalUnit = candidate.originalUnit ?? "";
  if (currentUnit !== originalUnit) {
    return true;
  }
  return false;
}
