import type { RemoteDelta } from "../../services/api/deltas";
import type { RemoteMeasurement } from "../../services/api/measurements";
import type { DeltaStatus } from "../../types/delta";
import { effectiveMeasurementReviewStatus } from "../measurementReview";

export type RankedProjectVariance = {
  planItemId: string;
  measurementId: string;
  deltaId: string;
  percentDifference: number;
  difference: number;
  unit: string;
  status: DeltaStatus;
};

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Selects the current variance for each Plan Item: only a Delta attached to
 * that item's latest accepted measurement can qualify. Missing legacy review
 * status is treated as accepted by the shared measurement-review semantics.
 */
export function rankCurrentProjectVariances(
  measurements: readonly RemoteMeasurement[],
  deltas: readonly RemoteDelta[],
): RankedProjectVariance[] {
  const latestAcceptedByPlanItem = new Map<string, RemoteMeasurement>();

  for (const measurement of measurements) {
    if (
      effectiveMeasurementReviewStatus(measurement.reviewStatus) !== "accepted"
    ) {
      continue;
    }

    const current = latestAcceptedByPlanItem.get(measurement.planItemId);
    const nextTime = timestamp(measurement.createdAt);
    const currentTime = current ? timestamp(current.createdAt) : Number.NEGATIVE_INFINITY;
    if (
      !current ||
      nextTime > currentTime ||
      (nextTime === currentTime && measurement.id.localeCompare(current.id) > 0)
    ) {
      latestAcceptedByPlanItem.set(measurement.planItemId, measurement);
    }
  }

  const deltaByMeasurement = new Map<string, RemoteDelta>();
  for (const delta of deltas) {
    const current = deltaByMeasurement.get(delta.measurementId);
    if (
      !current ||
      timestamp(delta.createdAt) > timestamp(current.createdAt) ||
      (timestamp(delta.createdAt) === timestamp(current.createdAt) &&
        delta.id.localeCompare(current.id) > 0)
    ) {
      deltaByMeasurement.set(delta.measurementId, delta);
    }
  }

  const ranked: RankedProjectVariance[] = [];
  for (const measurement of latestAcceptedByPlanItem.values()) {
    const delta = deltaByMeasurement.get(measurement.id);
    if (
      !delta ||
      delta.planItemId !== measurement.planItemId ||
      delta.percentDifference === null ||
      !Number.isFinite(delta.percentDifference) ||
      !Number.isFinite(delta.difference)
    ) {
      continue;
    }

    ranked.push({
      planItemId: measurement.planItemId,
      measurementId: measurement.id,
      deltaId: delta.id,
      percentDifference: delta.percentDifference,
      difference: delta.difference,
      unit: delta.unit,
      status: delta.status,
    });
  }

  return ranked.sort(
    (left, right) =>
      Math.abs(right.percentDifference) - Math.abs(left.percentDifference) ||
      left.planItemId.localeCompare(right.planItemId),
  );
}
