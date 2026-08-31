import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending-only PlanItem update records.
 * Retry reloads latest local PlanItem and PATCHes current editable fields.
 */
export type PendingPlanItemUpdate = {
  ownerUid: string;
  localProjectId: string;
  localPlanItemId: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isPendingPlanItemUpdate(
  value: unknown,
): value is PendingPlanItemUpdate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.localPlanItemId === "string" &&
    record.localPlanItemId.trim().length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.trim().length > 0 &&
    typeof record.lastAttemptAt === "string" &&
    record.lastAttemptAt.trim().length > 0
  );
}

async function readPending(): Promise<PendingPlanItemUpdate[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.planItemUpdateSyncState,
  );
  return items.filter(isPendingPlanItemUpdate);
}

function sameIdentity(
  item: PendingPlanItemUpdate,
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): boolean {
  return (
    item.ownerUid === ownerUid &&
    item.localProjectId === localProjectId &&
    item.localPlanItemId === localPlanItemId
  );
}

export async function getPendingPlanItemUpdatesForUser(
  ownerUid: string,
): Promise<PendingPlanItemUpdate[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function markPlanItemUpdatePending(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<void> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localPlanItemId.trim()
  ) {
    throw new Error("Invalid pending plan item update identity.");
  }

  const now = new Date().toISOString();
  const pending = await readPending();
  const existing = pending.find((item) =>
    sameIdentity(item, ownerUid, localProjectId, localPlanItemId),
  );

  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localPlanItemId),
  );

  next.push({
    ownerUid,
    localProjectId,
    localPlanItemId,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.planItemUpdateSyncState, next);
}

export async function clearPlanItemUpdatePending(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localPlanItemId),
  );
  await writeJsonArray(STORAGE_KEYS.planItemUpdateSyncState, next);
}
