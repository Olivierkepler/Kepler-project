import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only Project update records.
 * Retry reloads latest local Project and PATCHes current editable fields.
 */
export type PendingProjectUpdate = {
  ownerUid: string;
  localProjectId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingProjectUpdate(value: unknown): value is PendingProjectUpdate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingProjectUpdate[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.projectUpdateSyncState,
  );
  return items.filter(isPendingProjectUpdate);
}

function sameIdentity(
  item: PendingProjectUpdate,
  ownerUid: string,
  localProjectId: string,
): boolean {
  return (
    item.ownerUid === ownerUid && item.localProjectId === localProjectId
  );
}

export async function getPendingProjectUpdatesForUser(
  ownerUid: string,
): Promise<PendingProjectUpdate[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function markProjectUpdatePending(
  ownerUid: string,
  localProjectId: string,
): Promise<void> {
  if (!ownerUid.trim() || !localProjectId.trim()) {
    throw new Error("Invalid pending project update identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId),
  );

  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId),
  );

  next.push({
    ownerUid,
    localProjectId,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.projectUpdateSyncState, next);
}

export async function clearProjectUpdatePending(
  ownerUid: string,
  localProjectId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId),
  );
  await writeJsonArray(STORAGE_KEYS.projectUpdateSyncState, next);
}
