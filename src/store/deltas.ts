import type { Delta, DeltaStatus } from "../types/delta";
import {
  resolveScopedOperationalArray,
  scopedOperationalKey,
} from "./localDataScope";
import { writeJsonArray } from "./storage";

const MAX_DISPOSITION_REASON_LENGTH = 500;

function copyDelta(delta: Delta): Delta {
  return { ...delta };
}

function normalizeDeltaStatus(value: unknown): DeltaStatus | null {
  if (value === "reviewed") {
    return "accepted";
  }

  if (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved"
  ) {
    return value;
  }

  return null;
}

function normalizeDispositionReason(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_DISPOSITION_REASON_LENGTH);
}

/**
 * Accepts Phase 33–55 Deltas missing disposition fields / legacy "reviewed".
 */
function normalizeDelta(value: unknown): Delta | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const percentOk =
    record.percentDifference === null ||
    typeof record.percentDifference === "number";
  const status = normalizeDeltaStatus(record.status);

  if (
    typeof record.id !== "string" ||
    record.id.trim().length === 0 ||
    typeof record.projectId !== "string" ||
    typeof record.planItemId !== "string" ||
    typeof record.measurementId !== "string" ||
    record.type !== "length" ||
    typeof record.plannedValue !== "number" ||
    typeof record.actualValue !== "number" ||
    typeof record.difference !== "number" ||
    !percentOk ||
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
    return null;
  }

  const dispositionReason = normalizeDispositionReason(
    record.dispositionReason,
  );
  const disposedAt =
    status === "open"
      ? null
      : typeof record.disposedAt === "string" &&
          record.disposedAt.trim().length > 0
        ? record.disposedAt
        : null;

  return {
    id: record.id,
    projectId: record.projectId,
    planItemId: record.planItemId,
    measurementId: record.measurementId,
    type: "length",
    plannedValue: record.plannedValue,
    actualValue: record.actualValue,
    difference: record.difference,
    percentDifference:
      typeof record.percentDifference === "number"
        ? record.percentDifference
        : null,
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

async function loadDeltas(ownerUid: string): Promise<Delta[]> {
  const items = await resolveScopedOperationalArray("deltas", ownerUid, () => []);
  return items
    .map(normalizeDelta)
    .filter((item): item is Delta => item !== null)
    .map(copyDelta);
}

export async function getDeltas(ownerUid: string): Promise<Delta[]> {
  return loadDeltas(ownerUid);
}

export async function getDeltasForProject(
  ownerUid: string,
  projectId: string,
): Promise<Delta[]> {
  const deltas = await loadDeltas(ownerUid);

  return deltas
    .filter((delta) => delta.projectId === projectId)
    .map(copyDelta);
}

export async function getDeltaByMeasurementId(
  ownerUid: string,
  measurementId: string,
): Promise<Delta | undefined> {
  const deltas = await loadDeltas(ownerUid);
  const found = deltas.find(
    (delta) => delta.measurementId === measurementId,
  );

  return found ? copyDelta(found) : undefined;
}

export async function getDeltaById(
  ownerUid: string,
  deltaId: string,
): Promise<Delta | undefined> {
  const deltas = await loadDeltas(ownerUid);
  const found = deltas.find((delta) => delta.id === deltaId);

  return found ? copyDelta(found) : undefined;
}

export async function addDelta(ownerUid: string, delta: Delta): Promise<void> {
  const normalized = normalizeDelta(delta);

  if (!normalized) {
    throw new Error("Invalid delta.");
  }

  const deltas = await loadDeltas(ownerUid);

  if (deltas.some((item) => item.measurementId === delta.measurementId)) {
    return;
  }

  await writeJsonArray(scopedOperationalKey("deltas", ownerUid), [
    ...deltas,
    copyDelta(normalized),
  ]);
}

/**
 * Local-first disposition update.
 * Returns the updated Delta, or undefined when not found.
 */
export async function updateDeltaDisposition(
  ownerUid: string,
  deltaId: string,
  status: DeltaStatus,
  dispositionReason: string,
): Promise<Delta | undefined> {
  const deltas = await loadDeltas(ownerUid);
  const index = deltas.findIndex((delta) => delta.id === deltaId);

  if (index < 0) {
    return undefined;
  }

  const existing = deltas[index];
  const reason = normalizeDispositionReason(dispositionReason);
  const statusChanged = existing.status !== status;
  const nowIso = new Date().toISOString();

  const nextItem: Delta = {
    ...existing,
    status,
    dispositionReason: reason,
    disposedAt:
      status === "open"
        ? null
        : statusChanged || !existing.disposedAt
          ? nowIso
          : existing.disposedAt,
  };

  const next = [...deltas];
  next[index] = copyDelta(nextItem);
  await writeJsonArray(scopedOperationalKey("deltas", ownerUid), next);
  return copyDelta(nextItem);
}

/**
 * Legacy helper: open → accepted.
 */
export async function markDeltaReviewed(
  ownerUid: string,
  deltaId: string,
): Promise<boolean> {
  const existing = await getDeltaById(ownerUid, deltaId);

  if (!existing || existing.status === "accepted") {
    return false;
  }

  const updated = await updateDeltaDisposition(
    ownerUid,
    deltaId,
    "accepted",
    existing.dispositionReason,
  );

  return updated != null;
}

/**
 * Applies remote disposition onto local Delta when no pending mutation.
 */
export async function applyRemoteDeltaDisposition(
  ownerUid: string,
  deltaId: string,
  status: DeltaStatus,
  dispositionReason: string,
  disposedAt: string | null,
): Promise<boolean> {
  const deltas = await loadDeltas(ownerUid);
  const index = deltas.findIndex((delta) => delta.id === deltaId);

  if (index < 0) {
    return false;
  }

  const existing = deltas[index];
  const reason = normalizeDispositionReason(dispositionReason);
  const nextDisposedAt = status === "open" ? null : disposedAt;

  if (
    existing.status === status &&
    existing.dispositionReason === reason &&
    existing.disposedAt === nextDisposedAt
  ) {
    return false;
  }

  const nextItem: Delta = {
    ...existing,
    status,
    dispositionReason: reason,
    disposedAt: nextDisposedAt,
  };

  const next = [...deltas];
  next[index] = copyDelta(nextItem);
  await writeJsonArray(scopedOperationalKey("deltas", ownerUid), next);
  return true;
}
