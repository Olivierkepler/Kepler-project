import type { DeltaStatus } from "../types/delta";
import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/**
 * Pending Delta disposition sync records.
 * Extends the Phase 34 review queue to carry target status + reason.
 * Absence means no outstanding cloud disposition work.
 */
export type PendingDeltaReview = {
  ownerUid: string;
  localProjectId: string;
  localDeltaId: string;
  status: DeltaStatus;
  dispositionReason: string;
  createdAt: string;
  lastAttemptAt: string;
};

function isDeltaStatus(value: unknown): value is DeltaStatus {
  return (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved" ||
    value === "reviewed"
  );
}

function normalizePendingStatus(value: unknown): DeltaStatus {
  if (value === "reviewed" || value === undefined || value === null) {
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

  return "accepted";
}

function isPendingDeltaReview(value: unknown): value is PendingDeltaReview {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.ownerUid !== "string" ||
    record.ownerUid.trim().length === 0 ||
    typeof record.localProjectId !== "string" ||
    record.localProjectId.trim().length === 0 ||
    typeof record.localDeltaId !== "string" ||
    record.localDeltaId.trim().length === 0 ||
    typeof record.createdAt !== "string" ||
    record.createdAt.trim().length === 0 ||
    typeof record.lastAttemptAt !== "string" ||
    record.lastAttemptAt.trim().length === 0
  ) {
    return false;
  }

  // Legacy Phase 34 records omit status/reason → accepted.
  if (
    record.status !== undefined &&
    !isDeltaStatus(record.status)
  ) {
    return false;
  }

  if (
    record.dispositionReason !== undefined &&
    typeof record.dispositionReason !== "string"
  ) {
    return false;
  }

  return true;
}

function normalizePending(value: unknown): PendingDeltaReview | null {
  if (!isPendingDeltaReview(value)) {
    return null;
  }

  const record = value as PendingDeltaReview & {
    status?: unknown;
    dispositionReason?: unknown;
  };

  return {
    ownerUid: record.ownerUid,
    localProjectId: record.localProjectId,
    localDeltaId: record.localDeltaId,
    status: normalizePendingStatus(record.status),
    dispositionReason:
      typeof record.dispositionReason === "string"
        ? record.dispositionReason
        : "",
    createdAt: record.createdAt,
    lastAttemptAt: record.lastAttemptAt,
  };
}

async function readPending(): Promise<PendingDeltaReview[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.deltaReviewSyncState,
  );
  return items
    .map(normalizePending)
    .filter((item): item is PendingDeltaReview => item !== null);
}

function sameIdentity(
  a: PendingDeltaReview,
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): boolean {
  return (
    a.ownerUid === ownerUid &&
    a.localProjectId === localProjectId &&
    a.localDeltaId === localDeltaId
  );
}

export async function getPendingDeltaReviewsForUser(
  ownerUid: string,
): Promise<PendingDeltaReview[]> {
  const pending = await readPending();
  return pending.filter((item) => item.ownerUid === ownerUid);
}

export async function getPendingDeltaReviewsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PendingDeltaReview[]> {
  const pending = await readPending();
  return pending.filter(
    (item) =>
      item.ownerUid === ownerUid && item.localProjectId === localProjectId,
  );
}

export async function isDeltaReviewPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<boolean> {
  const pending = await readPending();
  return pending.some((item) =>
    sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );
}

/**
 * Upserts a pending disposition record (deduped by owner + project + delta).
 */
export async function markDeltaReviewPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
  status: DeltaStatus = "accepted",
  dispositionReason: string = "",
): Promise<void> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localDeltaId.trim()) {
    throw new Error("Invalid pending delta disposition identity.");
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
    status,
    dispositionReason,
    createdAt: existing?.createdAt ?? now,
    lastAttemptAt: now,
  });

  await writeJsonArray(STORAGE_KEYS.deltaReviewSyncState, next);
}

/**
 * Removes pending record after successful cloud disposition sync.
 */
export async function clearDeltaReviewPending(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<void> {
  const pending = await readPending();
  const next = pending.filter(
    (item) => !sameIdentity(item, ownerUid, localProjectId, localDeltaId),
  );
  await writeJsonArray(STORAGE_KEYS.deltaReviewSyncState, next);
}
