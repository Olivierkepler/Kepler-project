/**
 * Pure PlanItem provenance presentation helpers (Phase 2P.6).
 * Read-only formatting — never mutates Plan / Measurement / Delta data.
 */

import {
  confidenceBand,
  formatPlannedValue,
} from "./planImportReview";

export type ProvenanceQuantityLike = {
  label: string;
  type: string;
  plannedValue: number | null;
  unit: string | null;
};

export function formatProvenanceQuantity(
  quantity: ProvenanceQuantityLike,
): string {
  const value = formatPlannedValue(quantity.plannedValue, quantity.unit);
  if (value) {
    return `${quantity.label} · ${value}`;
  }
  return quantity.label;
}

export function formatProvenanceConfidence(confidence: number): string {
  const band = confidenceBand(confidence);
  const pct = Math.round(confidence * 100);
  return `${band} · ${pct}%`;
}

export function formatProvenanceDate(
  iso: string | null | undefined,
): string | null {
  if (!iso || !iso.trim()) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function provenanceValuesDiffer(
  original: ProvenanceQuantityLike,
  reviewed: ProvenanceQuantityLike,
): boolean {
  if (original.label.trim() !== reviewed.label.trim()) {
    return true;
  }
  if (original.type !== reviewed.type) {
    return true;
  }
  if (original.plannedValue !== reviewed.plannedValue) {
    return true;
  }
  const originalUnit = original.unit?.trim() ?? "";
  const reviewedUnit = reviewed.unit?.trim() ?? "";
  return originalUnit !== reviewedUnit;
}

/**
 * Review adjustment for quantity only (not a field Delta).
 * Returns null when unchanged or non-numeric.
 */
export function formatReviewAdjustment(
  original: ProvenanceQuantityLike,
  reviewed: ProvenanceQuantityLike,
): string | null {
  if (
    original.plannedValue == null ||
    reviewed.plannedValue == null ||
    !Number.isFinite(original.plannedValue) ||
    !Number.isFinite(reviewed.plannedValue)
  ) {
    return null;
  }
  if (original.plannedValue === reviewed.plannedValue) {
    return null;
  }
  const delta = reviewed.plannedValue - original.plannedValue;
  const unit = reviewed.unit?.trim() || original.unit?.trim() || "";
  const abs = Math.abs(delta);
  const formatted =
    unit.toLowerCase() === "ea"
      ? `${abs}`
      : abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sign = delta > 0 ? "+" : "−";
  return unit ? `${sign}${formatted} ${unit}` : `${sign}${formatted}`;
}

export function formatProvenanceSourceLine(args: {
  fileName: string;
  page?: number | null;
  reference?: string | null;
}): string {
  const parts: string[] = [args.fileName.trim() || "Source document"];
  if (args.reference && args.reference.trim()) {
    parts.push(args.reference.trim());
  }
  if (args.page != null && Number.isFinite(args.page)) {
    parts.push(`Page ${args.page}`);
  }
  return parts.join(" · ");
}

export function formatReviewerLabel(
  _reviewedByUid: string | null | undefined,
): string {
  // No user directory in this phase — avoid exposing raw UIDs.
  return "Project owner";
}
