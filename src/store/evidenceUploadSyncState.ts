import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only Evidence upload records.
 * Retry reloads latest local Evidence and uploads current state.
 */
export type PendingEvidenceUpload = {
  ownerUid: string;
  localProjectId: string;
  localEvidenceId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingEvidenceUpload(
  value: unknown,
): value is PendingEvidenceUpload {
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
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingEvidenceUpload[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.evidenceUploadSyncState,
  );
  return items.filter(isPendingEvidenceUpload);
}

function sameIdentity(
  item: PendingEvidenceUpload,
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

export async function getPendingEvidenceUploadsForUser(
  ownerUid: string,
): Promise<PendingEvidenceUpload[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function getPendingEvidenceUploadsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PendingEvidenceUpload[]> {
  const pending = await readPending();
  return pending.filter(
    (item) =>
      item.ownerUid === ownerUid && item.localProjectId === localProjectId,
  );
}

export async function isEvidenceUploadPending(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<boolean> {
  const pending = await readPending();
  return pending.some((item) =>
    sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );
}

export async function markEvidenceUploadPending(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<void> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localEvidenceId.trim()
  ) {
    throw new Error("Invalid pending evidence upload identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );

  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );

  next.push({
    ownerUid,
    localProjectId,
    localEvidenceId,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.evidenceUploadSyncState, next);
}

export async function clearEvidenceUploadPending(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localEvidenceId),
  );
  await writeJsonArray(STORAGE_KEYS.evidenceUploadSyncState, next);
}
