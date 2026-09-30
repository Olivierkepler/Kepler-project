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
 * Deterministic localDeltaId for owner server reconciliation (Phase 2F-C).
 * Format: owner-reconcile-{localMeasurementId}
 */
export function createOwnerReconcileLocalDeltaId(
  localMeasurementId: string,
): string {
  const local = localMeasurementId.trim();
  if (!local) {
    throw new Error("localMeasurementId is required");
  }
  if (local.includes("/")) {
    throw new Error("localMeasurementId must not contain '/'");
  }
  return `owner-reconcile-${local}`;
}

export type DeltaBuildIneligibleReason =
  | "project_mismatch"
  | "type_mismatch"
  | "unit_mismatch"
  | "invalid_unit_cost"
  | "invalid_production_rate"
  | "invalid_labor_rate"
  | "schedule_labor_unavailable";

/**
 * Discriminated Plan-vs-Reality build result.
 * Separates exact zero variance from ineligible calculation inputs.
 */
export type BuildDeltaFromMeasurementResult =
  | { status: "ok"; delta: Delta }
  | { status: "no_delta"; reason: "zero_difference" }
  | { status: "ineligible"; reason: DeltaBuildIneligibleReason };

/**
 * Canonical length Delta construction from Measurement + PlanItem.
 * Identity (`localDeltaId`) is supplied by the calling workflow.
 * Does not persist; does not trigger Activity or agent.
 */
export function buildDeltaFromMeasurement(
  measurement: Measurement,
  planItem: PlanItem,
  localDeltaId: string,
  createdAt: string = new Date().toISOString(),
): BuildDeltaFromMeasurementResult {
  const trimmedLocalDeltaId = localDeltaId.trim();
  if (!trimmedLocalDeltaId || trimmedLocalDeltaId.includes("/")) {
    return { status: "ineligible", reason: "project_mismatch" };
  }

  if (
    measurement.projectId !== planItem.projectId ||
    measurement.planItemId !== planItem.id
  ) {
    return { status: "ineligible", reason: "project_mismatch" };
  }

  if (planItem.type !== "length" || measurement.type !== "length") {
    return { status: "ineligible", reason: "type_mismatch" };
  }

  if (planItem.unit !== measurement.unit) {
    return { status: "ineligible", reason: "unit_mismatch" };
  }

  if (!Number.isFinite(planItem.unitCost) || planItem.unitCost < 0) {
    return { status: "ineligible", reason: "invalid_unit_cost" };
  }

  if (
    !Number.isFinite(planItem.productionRatePerDay) ||
    planItem.productionRatePerDay <= 0
  ) {
    return { status: "ineligible", reason: "invalid_production_rate" };
  }

  if (
    !Number.isFinite(planItem.laborHoursPerUnit) ||
    planItem.laborHoursPerUnit < 0
  ) {
    return { status: "ineligible", reason: "invalid_labor_rate" };
  }

  const difference = calculateDifference(
    planItem.plannedValue,
    measurement.value,
  );

  if (difference === 0) {
    return { status: "no_delta", reason: "zero_difference" };
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
    return { status: "ineligible", reason: "schedule_labor_unavailable" };
  }

  return {
    status: "ok",
    delta: {
      id: createRemoteDeltaId(measurement.projectId, trimmedLocalDeltaId),
      localDeltaId: trimmedLocalDeltaId,
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
    },
  };
}

/**
 * Collaborator-compatible wrapper: uses collab-review-* identity.
 * Returns null for zero difference or ineligible inputs (legacy contract).
 */
export function createDeltaFromMeasurement(
  measurement: Measurement,
  planItem: PlanItem,
  createdAt: string = new Date().toISOString(),
): Delta | null {
  const result = buildDeltaFromMeasurement(
    measurement,
    planItem,
    createCollaboratorReviewLocalDeltaId(measurement.localMeasurementId),
    createdAt,
  );

  return result.status === "ok" ? result.delta : null;
}
