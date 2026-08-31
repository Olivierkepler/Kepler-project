import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Delta, DeltaStatus } from "../domain/delta.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function normalizeDeltaStatus(value: unknown): DeltaStatus | undefined {
  if (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved"
  ) {
    return value;
  }
  if (value === "reviewed") {
    return "accepted";
  }
  return undefined;
}

/**
 * Normalizes Firestore Delta docs. Does not mutate storage.
 */
export function normalizeDeltaDocument(data: unknown): Delta | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const status = normalizeDeltaStatus(record.status ?? "open");

  if (
    typeof record.id !== "string" ||
    typeof record.localDeltaId !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.planItemId !== "string" ||
    typeof record.measurementId !== "string" ||
    record.type !== "length" ||
    typeof record.plannedValue !== "number" ||
    typeof record.actualValue !== "number" ||
    typeof record.difference !== "number" ||
    !(
      record.percentDifference === null ||
      typeof record.percentDifference === "number"
    ) ||
    typeof record.unit !== "string" ||
    typeof record.unitCost !== "number" ||
    typeof record.costImpact !== "number" ||
    typeof record.productionRatePerDay !== "number" ||
    typeof record.scheduleImpactDays !== "number" ||
    typeof record.laborHoursPerUnit !== "number" ||
    typeof record.laborImpactHours !== "number" ||
    !status ||
    typeof record.createdAt !== "string"
  ) {
    return undefined;
  }

  const dispositionReason =
    typeof record.dispositionReason === "string"
      ? record.dispositionReason
      : "";

  const disposedAt =
    status === "open"
      ? null
      : typeof record.disposedAt === "string" &&
          record.disposedAt.trim().length > 0
        ? record.disposedAt
        : null;

  return {
    id: record.id,
    localDeltaId: record.localDeltaId,
    projectId: record.projectId,
    planItemId: record.planItemId,
    measurementId: record.measurementId,
    type: "length",
    plannedValue: record.plannedValue,
    actualValue: record.actualValue,
    difference: record.difference,
    percentDifference: record.percentDifference,
    unit: record.unit,
    unitCost: record.unitCost,
    costImpact: record.costImpact,
    productionRatePerDay: record.productionRatePerDay,
    scheduleImpactDays: record.scheduleImpactDays,
    laborHoursPerUnit: record.laborHoursPerUnit,
    laborImpactHours: record.laborImpactHours,
    status,
    dispositionReason,
    disposedAt,
    createdAt: record.createdAt,
  };
}

export async function getDeltaById(
  deltaId: string,
): Promise<Delta | undefined> {
  requireId(deltaId, "deltaId");

  const snapshot = await db
    .collection(COLLECTIONS.deltas)
    .doc(deltaId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeDeltaDocument(snapshot.data());
}
