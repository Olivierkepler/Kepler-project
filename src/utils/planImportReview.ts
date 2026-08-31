/**
 * Pure Plan Import review helpers (Phase 2P.4).
 * Deterministic UI/domain rules — not AI-decided.
 */

export type PlanImportCandidateReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "needs_attention";

export type PlanImportCandidateType =
  | "length"
  | "count"
  | "area"
  | "volume"
  | "other";

export type PlanImportReviewCandidateLike = {
  label: string;
  type: PlanImportCandidateType;
  plannedValue?: number | null;
  unit?: string | null;
  confidence: number;
  sourceFileId: string;
  sourcePage?: number | null;
  sourceReference?: string | null;
  selected: boolean;
  reviewStatus: PlanImportCandidateReviewStatus;
};

export type PlanImportReviewFilter =
  | "all"
  | "selected"
  | "needs_attention"
  | "reviewed";

export function confidenceBand(
  confidence: number,
): "High" | "Medium" | "Low" {
  if (confidence >= 0.85) {
    return "High";
  }
  if (confidence >= 0.6) {
    return "Medium";
  }
  return "Low";
}

function isMeasurableType(type: PlanImportCandidateType): boolean {
  return (
    type === "length" ||
    type === "count" ||
    type === "area" ||
    type === "volume"
  );
}

export function candidateHasUnresolvedRequiredErrors(
  candidate: Pick<
    PlanImportReviewCandidateLike,
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
      candidate.plannedValue == null ||
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

export function candidateNeedsAttention(
  candidate: Pick<
    PlanImportReviewCandidateLike,
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

export function candidateHasHumanEdits(args: {
  label: string;
  type: PlanImportCandidateType;
  plannedValue?: number | null;
  unit?: string | null;
  originalLabel: string;
  originalType: PlanImportCandidateType;
  originalPlannedValue?: number | null;
  originalUnit?: string | null;
}): boolean {
  if (args.label !== args.originalLabel) {
    return true;
  }
  if (args.type !== args.originalType) {
    return true;
  }
  const currentValue =
    args.plannedValue == null ? undefined : args.plannedValue;
  const originalValue =
    args.originalPlannedValue == null
      ? undefined
      : args.originalPlannedValue;
  if (currentValue !== originalValue) {
    return true;
  }
  const currentUnit = args.unit?.trim() ?? "";
  const originalUnit = args.originalUnit?.trim() ?? "";
  return currentUnit !== originalUnit;
}

export function filterPlanImportCandidates<T extends PlanImportReviewCandidateLike>(
  candidates: T[],
  filter: PlanImportReviewFilter,
): T[] {
  switch (filter) {
    case "selected":
      return candidates.filter((c) => c.selected);
    case "needs_attention":
      return candidates.filter((c) => candidateNeedsAttention(c));
    case "reviewed":
      return candidates.filter((c) => c.reviewStatus === "reviewed");
    case "all":
    default:
      return candidates;
  }
}

export function summarizePlanImportReview(
  candidates: PlanImportReviewCandidateLike[],
): {
  total: number;
  selected: number;
  reviewed: number;
  needsAttention: number;
  selectedNeedsAttention: number;
  reviewedSelected: number;
  unresolvedSelected: number;
} {
  const selected = candidates.filter((c) => c.selected);
  return {
    total: candidates.length,
    selected: selected.length,
    reviewed: candidates.filter((c) => c.reviewStatus === "reviewed").length,
    needsAttention: candidates.filter((c) => candidateNeedsAttention(c)).length,
    selectedNeedsAttention: selected.filter((c) =>
      candidateNeedsAttention(c),
    ).length,
    reviewedSelected: selected.filter((c) => c.reviewStatus === "reviewed")
      .length,
    unresolvedSelected: selected.filter((c) =>
      candidateHasUnresolvedRequiredErrors(c),
    ).length,
  };
}

export function isPlanImportApprovalReady(
  candidates: PlanImportReviewCandidateLike[],
): { ready: boolean; reasons: string[] } {
  const summary = summarizePlanImportReview(candidates);
  const reasons: string[] = [];

  if (summary.selected === 0) {
    reasons.push("Select at least one suggestion to continue.");
  }
  if (summary.reviewedSelected < summary.selected) {
    reasons.push("Review every selected suggestion before continuing.");
  }
  if (summary.unresolvedSelected > 0) {
    reasons.push("Fix missing required fields on selected suggestions.");
  }

  return { ready: reasons.length === 0, reasons };
}

export function formatPlannedValue(
  plannedValue: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (plannedValue == null || !Number.isFinite(plannedValue)) {
    return null;
  }

  const valueText = Number.isInteger(plannedValue)
    ? plannedValue.toLocaleString("en-US")
    : String(plannedValue);
  const unitText = unit?.trim() ? ` ${unit.trim()}` : "";
  return `${valueText}${unitText}`;
}

export function formatCandidateType(type: PlanImportCandidateType): string {
  switch (type) {
    case "length":
      return "LENGTH";
    case "count":
      return "COUNT";
    case "area":
      return "AREA";
    case "volume":
      return "VOLUME";
    default:
      return "OTHER";
  }
}
