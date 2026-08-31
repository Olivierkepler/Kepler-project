import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only Measurement upload records.
 * Absence of a record means no outstanding Measurement upload work.
 */
export type PendingMeasurementUpload = {
  ownerUid: string;
  localProjectId: string;
  localMeasurementId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingMeasurementUpload(
  value: unknown,
): value is PendingMeasurementUpload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.localMeasurementId === "string" &&
    record.localMeasurementId.trim().length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingMeasurementUpload[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.measurementUploadSyncState,
  );
  return items.filter(isPendingMeasurementUpload);
}

function sameIdentity(
  item: PendingMeasurementUpload,
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): boolean {
  return (
    item.ownerUid === ownerUid &&
    item.localProjectId === localProjectId &&
    item.localMeasurementId === localMeasurementId
  );
}

export async function getPendingMeasurementUploadsForUser(
  ownerUid: string,
): Promise<PendingMeasurementUpload[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function getPendingMeasurementUploadsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PendingMeasurementUpload[]> {
  const pending = await readPending();
  return pending.filter(
    (item) =>
      item.ownerUid === ownerUid && item.localProjectId === localProjectId,
  );
}

export async function isMeasurementUploadPending(
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): Promise<boolean> {
  const pending = await readPending();
  return pending.some((item) =>
    sameIdentity(item, ownerUid, localProjectId, localMeasurementId),
  );
}

export async function markMeasurementUploadPending(
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): Promise<void> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localMeasurementId.trim()) {
    throw new Error("Invalid pending measurement upload identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId, localMeasurementId),
  );

  const next = pending.filter(
    (item) =>
      !sameIdentity(item, ownerUid, localProjectId, localMeasurementId),
  );

  next.push({
    ownerUid,
    localProjectId,
    localMeasurementId,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.measurementUploadSyncState, next);
}

export async function clearMeasurementUploadPending(
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) =>
      !sameIdentity(item, ownerUid, localProjectId, localMeasurementId),
  );
  await writeJsonArray(STORAGE_KEYS.measurementUploadSyncState, next);
}
