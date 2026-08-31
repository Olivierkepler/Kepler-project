import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only Delta *creation/upload* records.
 * Distinct from Delta *review* pending state.
 */
export type PendingDeltaUpload = {
  ownerUid: string;
  localProjectId: string;
  localDeltaId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingDeltaUpload(value: unknown): value is PendingDeltaUpload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.localDeltaId === "string" &&
    record.localDeltaId.trim().length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingDeltaUpload[]> {
  const items = await readJsonArray<unknown>(STORAGE_KEYS.deltaUploadSyncState);
  return items.filter(isPendingDeltaUpload);
}

function sameIdentity(
  item: PendingDeltaUpload,
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): boolean {
  return (
    item.ownerUid === ownerUid &&
    item.localProjectId === localProjectId &&
    item.localDeltaId === localDeltaId
  );
}

export async function getPendingDeltaUploadsForUser(
  ownerUid: string,
): Promise<PendingDeltaUpload[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function getPendingDeltaUploadsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PendingDeltaUpload[]> {
  const pending = await readPending();
  return pending.filter(
    (item) =>
      item.ownerUid === ownerUid && item.localProjectId === localProjectId,
  );
}

export async function isDeltaUploadPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<boolean> {
  const pending = await readPending();
  return pending.some((item) =>
    sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );
}

export async function markDeltaUploadPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<void> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localDeltaId.trim()) {
    throw new Error("Invalid pending delta upload identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );

  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );

  next.push({
    ownerUid,
    localProjectId,
    localDeltaId,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.deltaUploadSyncState, next);
}

export async function clearDeltaUploadPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );
  await writeJsonArray(STORAGE_KEYS.deltaUploadSyncState, next);
}
