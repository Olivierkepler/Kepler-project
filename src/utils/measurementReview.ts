import { colors } from "../theme/colors";

/**
 * Contribution review status for Measurements (Phase 2J.2).
 * Independent of assignment acceptance and Delta disposition.
 */
export type MeasurementReviewStatus = "pending" | "accepted" | "rejected";

/**
 * Effective review status for presentation.
 * Legacy records missing reviewStatus are treated as accepted.
 */
export function effectiveMeasurementReviewStatus(
  reviewStatus: MeasurementReviewStatus | undefined | null,
): MeasurementReviewStatus {
  return reviewStatus ?? "accepted";
}

export function formatMeasurementReviewStatusLabel(
  reviewStatus: MeasurementReviewStatus | undefined | null,
): string {
  switch (effectiveMeasurementReviewStatus(reviewStatus)) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
  }
}

export function measurementReviewStatusColor(
  reviewStatus: MeasurementReviewStatus | undefined | null,
): string {
  switch (effectiveMeasurementReviewStatus(reviewStatus)) {
    case "pending":
      return colors.delta;
    case "accepted":
      return colors.success;
    case "rejected":
      return colors.danger;
  }
}
