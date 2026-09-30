import type {
  WorkPackage,
  WorkPackageStatus,
} from "../types/workPackage";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

const WORK_PACKAGE_STATUSES: readonly WorkPackageStatus[] = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

function scopedWorkPackagesKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for work package storage.");
  }

  return `${STORAGE_KEYS.workPackages}/${ownerUid}`;
}

function isWorkPackageStatus(value: unknown): value is WorkPackageStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_STATUSES as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePlanItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];

  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return null;
    }

    ids.push(entry.trim());
  }

  return ids;
}

/**
 * Local id helper — matches project-member- / project-invitation- style.
 */
export function createLocalWorkPackageId(now: number = Date.now()): string {
  return `work-package-${now}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeWorkPackage(value: unknown): WorkPackage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const planItemIds = normalizePlanItemIds(record.planItemIds);

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.name) ||
    !isWorkPackageStatus(record.status) ||
    planItemIds === null ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  if (
    record.description !== undefined &&
    typeof record.description !== "string"
  ) {
    return null;
  }

  const description =
    typeof record.description === "string" ? record.description : undefined;

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    name: record.name.trim(),
    ...(description !== undefined && description.trim().length > 0
      ? { description }
      : {}),
    status: record.status,
    planItemIds,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

function isValidWorkPackage(item: WorkPackage): boolean {
  return normalizeWorkPackage(item) !== null;
}

function copyWorkPackage(item: WorkPackage): WorkPackage {
  const { imageUrl: _presentationUrl, ...persistedFields } = item;
  return {
    ...persistedFields,
    planItemIds: [...item.planItemIds],
  };
}

async function loadWorkPackages(ownerUid: string): Promise<WorkPackage[]> {
  const items = await readJsonArray<unknown>(
    scopedWorkPackagesKey(ownerUid),
  );

  return items
    .map(normalizeWorkPackage)
    .filter((item): item is WorkPackage => item !== null)
    .map(copyWorkPackage);
}

export async function getWorkPackages(
  ownerUid: string,
): Promise<WorkPackage[]> {
  return loadWorkPackages(ownerUid);
}

export async function getWorkPackagesForProject(
  ownerUid: string,
  projectId: string,
): Promise<WorkPackage[]> {
  const items = await loadWorkPackages(ownerUid);

  return items
    .filter((item) => item.projectId === projectId)
    .map(copyWorkPackage);
}

export async function getWorkPackageById(
  ownerUid: string,
  workPackageId: string,
): Promise<WorkPackage | undefined> {
  const items = await loadWorkPackages(ownerUid);
  const found = items.find((item) => item.id === workPackageId);
  return found ? copyWorkPackage(found) : undefined;
}

/**
 * Appends a WorkPackage for this owner namespace.
 * Does not overwrite an existing id.
 * Returns false when the id already exists.
 */
export async function addWorkPackageIfAbsent(
  ownerUid: string,
  workPackage: WorkPackage,
): Promise<boolean> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for work package.");
  }

  if (!isValidWorkPackage(workPackage)) {
    throw new Error("Invalid work package.");
  }

  const items = await loadWorkPackages(ownerUid);

  if (items.some((existing) => existing.id === workPackage.id)) {
    return false;
  }

  await writeJsonArray(scopedWorkPackagesKey(ownerUid), [
    ...items,
    copyWorkPackage(workPackage),
  ]);

  return true;
}

export type WorkPackageUpdate = {
  name?: string;
  description?: string;
  status?: WorkPackageStatus;
  planItemIds?: string[];
};

function isValidWorkPackageUpdate(update: WorkPackageUpdate): boolean {
  if (update.name !== undefined) {
    if (typeof update.name !== "string" || update.name.trim().length === 0) {
      return false;
    }
  }

  if (update.description !== undefined) {
    if (typeof update.description !== "string") {
      return false;
    }
  }

  if (update.status !== undefined && !isWorkPackageStatus(update.status)) {
    return false;
  }

  if (update.planItemIds !== undefined) {
    if (normalizePlanItemIds(update.planItemIds) === null) {
      return false;
    }
  }

  return (
    update.name !== undefined ||
    update.description !== undefined ||
    update.status !== undefined ||
    update.planItemIds !== undefined
  );
}

/**
 * Narrow WorkPackage field update.
 * Does not allow id / projectId / createdAt mutation.
 * Sets updatedAt to now on successful write.
 */
export async function updateWorkPackage(
  ownerUid: string,
  workPackageId: string,
  update: WorkPackageUpdate,
  nowIso: string = new Date().toISOString(),
): Promise<WorkPackage | undefined> {
  if (
    !ownerUid.trim() ||
    !workPackageId.trim() ||
    !isValidWorkPackageUpdate(update)
  ) {
    throw new Error("Invalid work package update.");
  }

  const items = await loadWorkPackages(ownerUid);
  const index = items.findIndex((item) => item.id === workPackageId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];
  const nextPlanItemIds =
    update.planItemIds !== undefined
      ? normalizePlanItemIds(update.planItemIds)
      : current.planItemIds;

  if (nextPlanItemIds === null) {
    throw new Error("Invalid work package update.");
  }

  const nextWorkPackage: WorkPackage = {
    id: current.id,
    projectId: current.projectId,
    name:
      update.name !== undefined ? update.name.trim() : current.name,
    status: update.status !== undefined ? update.status : current.status,
    planItemIds: [...nextPlanItemIds],
    createdAt: current.createdAt,
    updatedAt: nowIso,
  };

  if (update.description !== undefined) {
    const trimmed = update.description.trim();
    if (trimmed.length > 0) {
      nextWorkPackage.description = update.description;
    }
  } else if (
    current.description !== undefined &&
    current.description.trim().length > 0
  ) {
    nextWorkPackage.description = current.description;
  }

  const next = [...items];
  next[index] = copyWorkPackage(nextWorkPackage);
  await writeJsonArray(scopedWorkPackagesKey(ownerUid), next);
  return copyWorkPackage(nextWorkPackage);
}

/**
 * Removes a WorkPackage from the owner namespace.
 * Returns false when not found.
 */
export async function removeWorkPackage(
  ownerUid: string,
  workPackageId: string,
): Promise<boolean> {
  if (!ownerUid.trim() || !workPackageId.trim()) {
    throw new Error("Invalid work package remove.");
  }

  const items = await loadWorkPackages(ownerUid);
  const next = items.filter((item) => item.id !== workPackageId);

  if (next.length === items.length) {
    return false;
  }

  await writeJsonArray(scopedWorkPackagesKey(ownerUid), next);
  return true;
}
