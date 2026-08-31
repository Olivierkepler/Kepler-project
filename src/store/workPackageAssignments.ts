import type {
  WorkPackageAssignment,
  WorkPackageAssignmentStatus,
} from "../types/workPackageAssignment";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

const WORK_PACKAGE_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] =
  [
    "assigned",
    "accepted",
    "in_progress",
    "ready_for_review",
    "completed",
    "cancelled",
  ];

/** Statuses that block another assignment for the same relationship. */
const BLOCKING_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] = [
  "assigned",
  "accepted",
  "in_progress",
  "ready_for_review",
  "completed",
];

function scopedWorkPackageAssignmentsKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for work package assignment storage.");
  }

  return `${STORAGE_KEYS.workPackageAssignments}/${ownerUid}`;
}

function isWorkPackageAssignmentStatus(
  value: unknown,
): value is WorkPackageAssignmentStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_ASSIGNMENT_STATUSES as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBlockingAssignmentStatus(
  status: WorkPackageAssignmentStatus,
): boolean {
  return (BLOCKING_ASSIGNMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * Local id helper — matches work-package- / project-member- style.
 */
export function createLocalWorkPackageAssignmentId(
  now: number = Date.now(),
): string {
  return `work-package-assignment-${now}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeWorkPackageAssignment(
  value: unknown,
): WorkPackageAssignment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.workPackageId) ||
    !isNonEmptyString(record.projectMemberId) ||
    !isWorkPackageAssignmentStatus(record.status) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    workPackageId: record.workPackageId.trim(),
    projectMemberId: record.projectMemberId.trim(),
    status: record.status,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

function isValidWorkPackageAssignment(
  item: WorkPackageAssignment,
): boolean {
  return normalizeWorkPackageAssignment(item) !== null;
}

function copyWorkPackageAssignment(
  item: WorkPackageAssignment,
): WorkPackageAssignment {
  return { ...item };
}

function sameRelationship(
  a: WorkPackageAssignment,
  b: Pick<
    WorkPackageAssignment,
    "projectId" | "workPackageId" | "projectMemberId"
  >,
): boolean {
  return (
    a.projectId === b.projectId &&
    a.workPackageId === b.workPackageId &&
    a.projectMemberId === b.projectMemberId
  );
}

async function loadWorkPackageAssignments(
  ownerUid: string,
): Promise<WorkPackageAssignment[]> {
  const items = await readJsonArray<unknown>(
    scopedWorkPackageAssignmentsKey(ownerUid),
  );

  return items
    .map(normalizeWorkPackageAssignment)
    .filter((item): item is WorkPackageAssignment => item !== null)
    .map(copyWorkPackageAssignment);
}

export async function getWorkPackageAssignments(
  ownerUid: string,
): Promise<WorkPackageAssignment[]> {
  return loadWorkPackageAssignments(ownerUid);
}

export async function getWorkPackageAssignmentsForProject(
  ownerUid: string,
  projectId: string,
): Promise<WorkPackageAssignment[]> {
  const items = await loadWorkPackageAssignments(ownerUid);

  return items
    .filter((item) => item.projectId === projectId)
    .map(copyWorkPackageAssignment);
}

export async function getWorkPackageAssignmentsForWorkPackage(
  ownerUid: string,
  workPackageId: string,
): Promise<WorkPackageAssignment[]> {
  const items = await loadWorkPackageAssignments(ownerUid);

  return items
    .filter((item) => item.workPackageId === workPackageId)
    .map(copyWorkPackageAssignment);
}

export async function getWorkPackageAssignmentsForMember(
  ownerUid: string,
  projectMemberId: string,
): Promise<WorkPackageAssignment[]> {
  const items = await loadWorkPackageAssignments(ownerUid);

  return items
    .filter((item) => item.projectMemberId === projectMemberId)
    .map(copyWorkPackageAssignment);
}

export async function getWorkPackageAssignmentById(
  ownerUid: string,
  assignmentId: string,
): Promise<WorkPackageAssignment | undefined> {
  const items = await loadWorkPackageAssignments(ownerUid);
  const found = items.find((item) => item.id === assignmentId);
  return found ? copyWorkPackageAssignment(found) : undefined;
}

/**
 * Appends a WorkPackageAssignment for this owner namespace.
 * Does not overwrite an existing id.
 * Also refuses a second non-cancelled assignment for the same
 * projectId + workPackageId + projectMemberId relationship
 * (aligned with invitation active-duplicate protection).
 * Returns false when blocked by id or active relationship duplicate.
 */
export async function addWorkPackageAssignmentIfAbsent(
  ownerUid: string,
  assignment: WorkPackageAssignment,
): Promise<boolean> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for work package assignment.");
  }

  if (!isValidWorkPackageAssignment(assignment)) {
    throw new Error("Invalid work package assignment.");
  }

  const items = await loadWorkPackageAssignments(ownerUid);

  if (items.some((existing) => existing.id === assignment.id)) {
    return false;
  }

  if (isBlockingAssignmentStatus(assignment.status)) {
    const duplicate = items.some(
      (existing) =>
        sameRelationship(existing, assignment) &&
        isBlockingAssignmentStatus(existing.status),
    );

    if (duplicate) {
      return false;
    }
  }

  await writeJsonArray(scopedWorkPackageAssignmentsKey(ownerUid), [
    ...items,
    copyWorkPackageAssignment(assignment),
  ]);

  return true;
}

export type WorkPackageAssignmentUpdate = {
  status?: WorkPackageAssignmentStatus;
};

function isValidWorkPackageAssignmentUpdate(
  update: WorkPackageAssignmentUpdate,
): boolean {
  if (update.status === undefined) {
    return false;
  }

  return isWorkPackageAssignmentStatus(update.status);
}

/**
 * Narrow WorkPackageAssignment field update.
 * Only status is mutable in Phase 2B.
 * Does not allow id / projectId / workPackageId / projectMemberId /
 * createdAt mutation. Sets updatedAt to now on successful write.
 */
export async function updateWorkPackageAssignment(
  ownerUid: string,
  assignmentId: string,
  update: WorkPackageAssignmentUpdate,
  nowIso: string = new Date().toISOString(),
): Promise<WorkPackageAssignment | undefined> {
  if (
    !ownerUid.trim() ||
    !assignmentId.trim() ||
    !isValidWorkPackageAssignmentUpdate(update)
  ) {
    throw new Error("Invalid work package assignment update.");
  }

  const items = await loadWorkPackageAssignments(ownerUid);
  const index = items.findIndex((item) => item.id === assignmentId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];
  const nextAssignment: WorkPackageAssignment = {
    ...current,
    status: update.status!,
    updatedAt: nowIso,
  };

  const next = [...items];
  next[index] = copyWorkPackageAssignment(nextAssignment);
  await writeJsonArray(scopedWorkPackageAssignmentsKey(ownerUid), next);
  return copyWorkPackageAssignment(nextAssignment);
}

/**
 * Removes a WorkPackageAssignment from the owner namespace.
 * Returns false when not found.
 */
export async function removeWorkPackageAssignment(
  ownerUid: string,
  assignmentId: string,
): Promise<boolean> {
  if (!ownerUid.trim() || !assignmentId.trim()) {
    throw new Error("Invalid work package assignment remove.");
  }

  const items = await loadWorkPackageAssignments(ownerUid);
  const next = items.filter((item) => item.id !== assignmentId);

  if (next.length === items.length) {
    return false;
  }

  await writeJsonArray(scopedWorkPackageAssignmentsKey(ownerUid), next);
  return true;
}
