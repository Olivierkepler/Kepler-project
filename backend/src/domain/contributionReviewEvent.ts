import type { MeasurementReviewStatus } from "./measurement.js";

/**
 * Append-only audit record for Measurement contribution review mutations
 * (Phase 2J.1).
 *
 * Does not represent assignment acceptance or Delta disposition.
 */
export type ContributionReviewEvent = {
  id: string;
  projectId: string;
  measurementId: string;
  /**
   * Effective prior status. For legacy Measurements first reviewed after
   * 2J.1, previousStatus is "accepted" (effective), not null.
   * null is reserved for cases with no prior effective status (unused in 2J.1).
   */
  previousStatus: MeasurementReviewStatus | null;
  nextStatus: MeasurementReviewStatus;
  reviewerUid: string;
  note?: string;
  createdAt: string;
};

/**
 * Builds a ContributionReviewEvent document ID.
 * Format: `contribution-review-event-${now}-${random}`
 */
export function createContributionReviewEventId(
  now: number = Date.now(),
): string {
  return `contribution-review-event-${now}-${Math.floor(Math.random() * 100000)}`;
}
