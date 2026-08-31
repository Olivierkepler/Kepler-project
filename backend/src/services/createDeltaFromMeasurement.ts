import type { Delta } from "../domain/delta.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
import type { Measurement } from "../domain/measurement.js";
import type { PlanItem } from "../domain/planItem.js";
import {
  calculateDifference,
  calculatePercentDifference,
} from "./calculations/comparison.js";
import { calculateCostImpact } from "./calculations/cost.js";
import { calculateLaborImpactHours } from "./calculations/labor.js";
import { calculateScheduleImpactDays } from "./calculations/schedule.js";

/**
 * Deterministic localDeltaId for collaborator review → Delta bridge.
 * Format: collab-review-{localMeasurementId}
 */
export function createCollaboratorReviewLocalDeltaId(
  localMeasurementId: string,
): string {
  const local = localMeasurementId.trim();
  if (!local) {
    throw new Error("localMeasurementId is required");
  }
  if (local.includes("/")) {
    throw new Error("localMeasurementId must not contain '/'");
  }
  return `collab-review-${local}`;
}

/**
 * Builds a length Delta from a Measurement + PlanItem using the same
 * Plan-vs-Reality semantics as mobile createDeltaFromMeasurement.
 *
 * Returns null when the pair is not eligible (zero difference, unit
 * mismatch, invalid rates/costs, etc.).
 *
 * localDeltaId / id are deterministic from project + measurement.
 */
export function createDeltaFromMeasurement(
  measurement: Measurement,
  planItem: PlanItem,
  createdAt: string = new Date().toISOString(),
): Delta | null {
  if (
    measurement.projectId !== planItem.projectId ||
    measurement.planItemId !== planItem.id ||
    planItem.type !== "length" ||
    measurement.type !== "length" ||
    planItem.unit !== measurement.unit ||
    !Number.isFinite(planItem.unitCost) ||
    planItem.unitCost < 0 ||
    !Number.isFinite(planItem.productionRatePerDay) ||
    planItem.productionRatePerDay <= 0 ||
    !Number.isFinite(planItem.laborHoursPerUnit) ||
    planItem.laborHoursPerUnit < 0
  ) {
    return null;
  }

  const difference = calculateDifference(
    planItem.plannedValue,
    measurement.value,
  );

  if (difference === 0) {
    return null;
  }

  const scheduleImpactDays = calculateScheduleImpactDays(
    difference,
    planItem.productionRatePerDay,
  );
  const laborImpactHours = calculateLaborImpactHours(
    difference,
    planItem.laborHoursPerUnit,
  );

  if (scheduleImpactDays === null || laborImpactHours === null) {
    return null;
  }

  const localDeltaId = createCollaboratorReviewLocalDeltaId(
    measurement.localMeasurementId,
  );

  return {
    id: createRemoteDeltaId(measurement.projectId, localDeltaId),
    localDeltaId,
    projectId: measurement.projectId,
    planItemId: measurement.planItemId,
    measurementId: measurement.id,
    type: "length",
    plannedValue: planItem.plannedValue,
    actualValue: measurement.value,
    difference,
    percentDifference: calculatePercentDifference(
      planItem.plannedValue,
      measurement.value,
    ),
    unit: measurement.unit,
    unitCost: planItem.unitCost,
    costImpact: calculateCostImpact(difference, planItem.unitCost),
    productionRatePerDay: planItem.productionRatePerDay,
    scheduleImpactDays,
    laborHoursPerUnit: planItem.laborHoursPerUnit,
    laborImpactHours,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt,
  };
}
