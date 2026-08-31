import type { Delta, DeltaStatus } from "../domain/delta.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
} from "./primitives.js";

const MAX_DISPOSITION_REASON_LENGTH = 500;

export function isDeltaStatus(value: unknown): value is DeltaStatus {
  return (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved"
  );
}

/**
 * Maps wire/legacy status onto Phase 56 disposition values.
 * "reviewed" → "accepted". Invalid → null.
 */
export function normalizeDeltaStatus(value: unknown): DeltaStatus | null {
  if (value === "reviewed") {
    return "accepted";
  }

  if (isDeltaStatus(value)) {
    return value;
  }

  return null;
}

export function normalizeDispositionReason(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_DISPOSITION_REASON_LENGTH);
}

export function disposedAtForStatus(
  status: DeltaStatus,
  previousDisposedAt: string | null,
  nowIso: string,
  statusChanged: boolean,
): string | null {
  if (status === "open") {
    return null;
  }

  if (!statusChanged && previousDisposedAt) {
    return previousDisposedAt;
  }

  return nowIso;
}

function dispositionFieldsFromBody(body: Record<string, unknown>): {
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
} | null {
  const status = normalizeDeltaStatus(body.status);

  if (!status) {
    return null;
  }

  const dispositionReason = normalizeDispositionReason(
    body.dispositionReason,
  );
  const nowIso = new Date().toISOString();
  const disposedAt =
    status === "open"
      ? null
      : typeof body.disposedAt === "string" && body.disposedAt.trim().length > 0
        ? body.disposedAt
        : nowIso;

  return { status, dispositionReason, disposedAt };
}

/**
 * Parses create-only Delta payloads (POST /api/deltas).
 * Requires localDeltaId. Client may supply remote id + remote refs.
 */
export function parseDelta(body: unknown): Delta | null {
  if (!isRecord(body)) {
    return null;
  }

  const percentOk =
    body.percentDifference === null || isFiniteNumber(body.percentDifference);
  const disposition = dispositionFieldsFromBody(body);

  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.localDeltaId) ||
    body.localDeltaId.includes("/") ||
    !isNonEmptyString(body.projectId) ||
    !isNonEmptyString(body.planItemId) ||
    !isNonEmptyString(body.measurementId) ||
    body.type !== "length" ||
    !isFiniteNumber(body.plannedValue) ||
    !isFiniteNumber(body.actualValue) ||
    !isFiniteNumber(body.difference) ||
    !percentOk ||
    !isNonEmptyString(body.unit) ||
    !isFiniteNumber(body.unitCost) ||
    !isFiniteNumber(body.costImpact) ||
    !isFiniteNumber(body.productionRatePerDay) ||
    !isFiniteNumber(body.scheduleImpactDays) ||
    !isFiniteNumber(body.laborHoursPerUnit) ||
    !isFiniteNumber(body.laborImpactHours) ||
    !disposition ||
    !isNonEmptyString(body.createdAt)
  ) {
    return null;
  }

  return {
    id: body.id,
    localDeltaId: body.localDeltaId,
    projectId: body.projectId,
    planItemId: body.planItemId,
    measurementId: body.measurementId,
    type: "length",
    plannedValue: body.plannedValue,
    actualValue: body.actualValue,
    difference: body.difference,
    percentDifference: body.percentDifference as number | null,
    unit: body.unit,
    unitCost: body.unitCost,
    costImpact: body.costImpact,
    productionRatePerDay: body.productionRatePerDay,
    scheduleImpactDays: body.scheduleImpactDays,
    laborHoursPerUnit: body.laborHoursPerUnit,
    laborImpactHours: body.laborImpactHours,
    status: disposition.status,
    dispositionReason: disposition.dispositionReason,
    disposedAt: disposition.disposedAt,
    createdAt: body.createdAt,
  };
}

export type DeltaBootstrapItemInput = {
  localDeltaId: string;
  localPlanItemId: string;
  localMeasurementId: string;
  type: "length";
  plannedValue: number;
  actualValue: number;
  difference: number;
  percentDifference: number | null;
  unit: string;
  unitCost: number;
  costImpact: number;
  productionRatePerDay: number;
  scheduleImpactDays: number;
  laborHoursPerUnit: number;
  laborImpactHours: number;
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
};

export function parseDeltaBootstrapItem(
  body: unknown,
): DeltaBootstrapItemInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const percentOk =
    body.percentDifference === null || isFiniteNumber(body.percentDifference);
  const disposition = dispositionFieldsFromBody(body);

  if (
    !isNonEmptyString(body.localDeltaId) ||
    body.localDeltaId.includes("/") ||
    !isNonEmptyString(body.localPlanItemId) ||
    body.localPlanItemId.includes("/") ||
    !isNonEmptyString(body.localMeasurementId) ||
    body.localMeasurementId.includes("/") ||
    body.type !== "length" ||
    !isFiniteNumber(body.plannedValue) ||
    !isFiniteNumber(body.actualValue) ||
    !isFiniteNumber(body.difference) ||
    !percentOk ||
    !isNonEmptyString(body.unit) ||
    !isFiniteNumber(body.unitCost) ||
    !isFiniteNumber(body.costImpact) ||
    !isFiniteNumber(body.productionRatePerDay) ||
    !isFiniteNumber(body.scheduleImpactDays) ||
    !isFiniteNumber(body.laborHoursPerUnit) ||
    !isFiniteNumber(body.laborImpactHours) ||
    !disposition ||
    !isNonEmptyString(body.createdAt)
  ) {
    return null;
  }

  return {
    localDeltaId: body.localDeltaId,
    localPlanItemId: body.localPlanItemId,
    localMeasurementId: body.localMeasurementId,
    type: "length",
    plannedValue: body.plannedValue,
    actualValue: body.actualValue,
    difference: body.difference,
    percentDifference: body.percentDifference as number | null,
    unit: body.unit,
    unitCost: body.unitCost,
    costImpact: body.costImpact,
    productionRatePerDay: body.productionRatePerDay,
    scheduleImpactDays: body.scheduleImpactDays,
    laborHoursPerUnit: body.laborHoursPerUnit,
    laborImpactHours: body.laborImpactHours,
    status: disposition.status,
    dispositionReason: disposition.dispositionReason,
    disposedAt: disposition.disposedAt,
    createdAt: body.createdAt,
  };
}

export function parseDeltaBootstrapBody(
  body: unknown,
): DeltaBootstrapItemInput[] | null {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return null;
  }

  if (body.items.length === 0) {
    return null;
  }

  const items: DeltaBootstrapItemInput[] = [];

  for (const entry of body.items) {
    const parsed = parseDeltaBootstrapItem(entry);

    if (!parsed) {
      return null;
    }

    items.push(parsed);
  }

  return items;
}

export type DeltaDispositionPatchInput = {
  status: DeltaStatus;
  dispositionReason: string;
};

/**
 * Parses Phase 56 disposition PATCH body.
 * Client sends status + optional reason; server owns disposedAt.
 */
export function parseDeltaDispositionPatch(
  body: unknown,
): DeltaDispositionPatchInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const status = normalizeDeltaStatus(body.status);

  if (!status) {
    return null;
  }

  if (
    body.dispositionReason !== undefined &&
    typeof body.dispositionReason !== "string"
  ) {
    return null;
  }

  return {
    status,
    dispositionReason: normalizeDispositionReason(body.dispositionReason),
  };
}
