import type { Delta } from "../../types/delta";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import {
  calculateDifference,
  calculatePercentDifference,
} from "../calculations/comparison";
import { calculateCostImpact } from "../calculations/cost";
import { calculateLaborImpactHours } from "../calculations/labor";
import { calculateScheduleImpactDays } from "../calculations/schedule";

function createDeltaId(): string {
  return `delta-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Builds a length Delta from a saved measurement and its linked plan item.
 * Returns null when the pair is not eligible for a Delta (zero difference,
 * unit mismatch, invalid rates/costs, etc.).
 */
export function createDeltaFromMeasurement(
  measurement: Measurement,
  planItem: PlanItem,
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

  return {
    id: createDeltaId(),
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
    createdAt: new Date().toISOString(),
  };
}
