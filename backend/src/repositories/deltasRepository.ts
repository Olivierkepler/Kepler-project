import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Delta, DeltaStatus } from "../domain/delta.js";
import {
  disposedAtForStatus,
  normalizeDeltaStatus,
  normalizeDispositionReason,
} from "../validation/delta.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

/**
 * Normalizes Firestore Delta docs for Phase 56.
 * Legacy "reviewed" → "accepted". Missing disposition fields → defaults.
 * Does not rewrite storage.
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

export async function getDeltaByMeasurementId(
  measurementId: string,
): Promise<Delta | undefined> {
  requireId(measurementId, "measurementId");

  const snapshot = await db
    .collection(COLLECTIONS.deltas)
    .where("measurementId", "==", measurementId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return undefined;
  }

  return normalizeDeltaDocument(snapshot.docs[0]?.data());
}

export async function getDeltasForProject(
  projectId: string,
): Promise<Delta[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.deltas)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => normalizeDeltaDocument(doc.data()))
    .filter((item): item is Delta => item !== undefined);
}

/**
 * Writes a Delta using document ID = delta.id.
 * Overwrites the full document (merge: false).
 */
export async function setDelta(delta: Delta): Promise<void> {
  requireId(delta.id, "delta.id");
  requireId(delta.localDeltaId, "delta.localDeltaId");
  requireId(delta.projectId, "delta.projectId");
  requireId(delta.planItemId, "delta.planItemId");
  requireId(delta.measurementId, "delta.measurementId");

  await db
    .collection(COLLECTIONS.deltas)
    .doc(delta.id)
    .set(delta, { merge: false });
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: number | string; message?: string };

  if (record.code === 6 || record.code === "ALREADY_EXISTS") {
    return true;
  }

  return (
    typeof record.message === "string" &&
    record.message.includes("ALREADY_EXISTS")
  );
}

export type CreateDeltaIfAbsentResult = {
  created: boolean;
  delta: Delta;
};

/**
 * Idempotent Delta create for a Measurement.
 * Prefers any existing Delta for measurementId; otherwise creates at the
 * candidate document id (create-if-absent). Concurrent creates resolve to
 * one document.
 */
export async function createDeltaIfAbsentForMeasurement(
  candidate: Delta,
): Promise<CreateDeltaIfAbsentResult> {
  requireId(candidate.id, "delta.id");
  requireId(candidate.measurementId, "delta.measurementId");

  const existingByMeasurement = await getDeltaByMeasurementId(
    candidate.measurementId,
  );

  if (existingByMeasurement) {
    return { created: false, delta: existingByMeasurement };
  }

  const ref = db.collection(COLLECTIONS.deltas).doc(candidate.id);

  try {
    await ref.create(candidate);
    return { created: true, delta: candidate };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const byId = await getDeltaById(candidate.id);
    if (byId) {
      return { created: false, delta: byId };
    }

    const byMeasurement = await getDeltaByMeasurementId(
      candidate.measurementId,
    );
    if (byMeasurement) {
      return { created: false, delta: byMeasurement };
    }

    throw error;
  }
}

/**
 * Applies disposition update. Server owns disposedAt.
 * Idempotent when status + reason already match.
 */
export async function updateDeltaDisposition(
  deltaId: string,
  status: DeltaStatus,
  dispositionReason: string,
): Promise<Delta | undefined> {
  requireId(deltaId, "deltaId");

  const existing = await getDeltaById(deltaId);

  if (!existing) {
    return undefined;
  }

  const reason = normalizeDispositionReason(dispositionReason);
  const statusChanged = existing.status !== status;
  const reasonChanged = existing.dispositionReason !== reason;

  if (!statusChanged && !reasonChanged) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const disposedAt = disposedAtForStatus(
    status,
    existing.disposedAt,
    nowIso,
    statusChanged,
  );

  const next: Delta = {
    ...existing,
    status,
    dispositionReason: reason,
    disposedAt,
  };

  await db.collection(COLLECTIONS.deltas).doc(deltaId).update({
    status,
    dispositionReason: reason,
    disposedAt,
  });

  return next;
}

/**
 * Legacy open → accepted (formerly "reviewed").
 * Kept for Phase 34 clients; maps onto Phase 56 disposition.
 */
export async function markDeltaReviewed(
  deltaId: string,
): Promise<Delta | undefined> {
  return updateDeltaDisposition(deltaId, "accepted", "");
}
