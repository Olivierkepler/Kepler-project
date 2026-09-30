import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";
import {
  isPendingPlanItemImageSync,
  type PendingPlanItemImageSync,
} from "../utils/domain/planItemImageSyncState";

export { isPendingPlanItemImageSync } from "../utils/domain/planItemImageSyncState";
export type { PendingPlanItemImageSync } from "../utils/domain/planItemImageSyncState";

async function readPending(): Promise<PendingPlanItemImageSync[]> {
  return (await readJsonArray<unknown>(STORAGE_KEYS.planItemImageSyncState))
    .filter(isPendingPlanItemImageSync);
}

function sameIdentity(
  record: PendingPlanItemImageSync,
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): boolean {
  return record.ownerUid === ownerUid && record.localProjectId === localProjectId &&
    record.localPlanItemId === localPlanItemId;
}

function newOperationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getPendingPlanItemImageSyncsForUser(
  ownerUid: string,
): Promise<PendingPlanItemImageSync[]> {
  return (await readPending()).filter((item) => item.ownerUid === ownerUid);
}

export async function markPlanItemImageSyncPending(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
  operation: PendingPlanItemImageSync["operation"],
): Promise<PendingPlanItemImageSync> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localPlanItemId.trim()) {
    throw new Error("Invalid pending Plan Item image identity.");
  }
  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId, localPlanItemId),
  );
  const nextRecord: PendingPlanItemImageSync = {
    ownerUid,
    localProjectId,
    localPlanItemId,
    operation,
    operationId: newOperationId(),
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  };
  await writeJsonArray(
    STORAGE_KEYS.planItemImageSyncState,
    [...pending.filter((item) => !sameIdentity(item, ownerUid, localProjectId, localPlanItemId)), nextRecord],
  );
  return nextRecord;
}

export async function clearPlanItemImageSyncPending(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
  expectedOperationId?: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter((item) =>
    !sameIdentity(item, ownerUid, localProjectId, localPlanItemId) ||
    (expectedOperationId !== undefined && item.operationId !== expectedOperationId),
  );
  await writeJsonArray(STORAGE_KEYS.planItemImageSyncState, next);
}

export async function touchPlanItemImageSyncPending(
  pendingOperation: PendingPlanItemImageSync,
): Promise<void> {
  const pending = await readPending();
  const next = pending.map((item) =>
    item.operationId === pendingOperation.operationId
      ? { ...item, lastAttemptAt: new Date().toISOString() }
      : item,
  );
  await writeJsonArray(STORAGE_KEYS.planItemImageSyncState, next);
}
