import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only Evidence cloud delete records.
 * Captures remote IDs before local mapping removal.
 */
export type PendingEvidenceDelete = {
  ownerUid: string;
  localProjectId: string;
  localEvidenceId: string;
  remoteProjectId: string;
  remoteEvidenceId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingEvidenceDelete(
  value: unknown,
): value is PendingEvidenceDelete {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.localEvidenceId === "string" &&
    record.localEvidenceId.trim().length > 0 &&
    typeof record.remoteProjectId === "string" &&
    record.remoteProjectId.trim().length > 0 &&
    typeof record.remoteEvidenceId === "string" &&
    record.remoteEvidenceId.trim().length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingEvidenceDelete[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.evidenceDeleteSyncState,
  );
  return items.filter(isPendingEvidenceDelete);
}

function sameIdentity(
  item: PendingEvidenceDelete,
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): boolean {
  return (
    item.ownerUid === ownerUid &&
    item.localProjectId === localProjectId &&
    item.localEvidenceId === localEvidenceId
  );
}

export async function getPendingEvidenceDeletesForUser(
  ownerUid: string,
): Promise<PendingEvidenceDelete[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function getPendingEvidenceDeletesForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PendingEvidenceDelete[]> {
  const pending = await readPending();
  return pending.filter(
    (item) =>
      item.ownerUid === ownerUid && item.localProjectId === localProjectId,
  );
}

export async function isEvidenceDeletePending(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<boolean> {
  const pending = await readPending();
  return pending.some((item) =>
    sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );
}

export async function markEvidenceDeletePending(
  pendingItem: Omit<PendingEvidenceDelete, "createdAt" | "lastAttemptAt"> & {
    createdAt?: string;
  },
): Promise<void> {
  if (
    !pendingItem.ownerUid.trim() ||
    !pendingItem.localProjectId.trim() ||
    !pendingItem.localEvidenceId.trim() ||
    !pendingItem.remoteProjectId.trim() ||
    !pendingItem.remoteEvidenceId.trim()
  ) {
    throw new Error("Invalid pending evidence delete identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(
      item,
      pendingItem.ownerUid,
      pendingItem.localProjectId,
      pendingItem.localEvidenceId,
    ),
  );

  const next = pending.filter(
    (item) =>
      !sameIdentity(
        item,
        pendingItem.ownerUid,
        pendingItem.localProjectId,
        pendingItem.localEvidenceId,
      ),
  );

  next.push({
    ownerUid: pendingItem.ownerUid,
    localProjectId: pendingItem.localProjectId,
    localEvidenceId: pendingItem.localEvidenceId,
    remoteProjectId: pendingItem.remoteProjectId,
    remoteEvidenceId: pendingItem.remoteEvidenceId,
    createdAt: existing?.createdAt ?? pendingItem.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.evidenceDeleteSyncState, next);
}

export async function clearEvidenceDeletePending(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );
  await writeJsonArray(STORAGE_KEYS.evidenceDeleteSyncState, next);
}
