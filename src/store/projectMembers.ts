import type {
  ProjectMember,
  ProjectMemberRole,
  ProjectMemberStatus,
} from "../types/projectMember";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

const PROJECT_MEMBER_ROLES: readonly ProjectMemberRole[] = [
  "owner",
  "project_admin",
  "contractor",
  "field_member",
  "viewer",
];

const PROJECT_MEMBER_STATUSES: readonly ProjectMemberStatus[] = [
  "invited",
  "active",
  "removed",
];

function scopedProjectMembersKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for project member storage.");
  }

  return `${STORAGE_KEYS.projectMembers}/${ownerUid}`;
}

function isProjectMemberRole(value: unknown): value is ProjectMemberRole {
  return (
    typeof value === "string" &&
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(value)
  );
}

function isProjectMemberStatus(value: unknown): value is ProjectMemberStatus {
  return (
    typeof value === "string" &&
    (PROJECT_MEMBER_STATUSES as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Local id helper — matches project-/plan-/delta- style generators.
 */
export function createLocalProjectMemberId(
  now: number = Date.now(),
): string {
  return `project-member-${now}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeProjectMember(value: unknown): ProjectMember | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.userId) ||
    !isProjectMemberRole(record.role) ||
    !isProjectMemberStatus(record.status) ||
    !isNonEmptyString(record.invitedBy) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  return {
    id: record.id,
    projectId: record.projectId,
    userId: record.userId,
    role: record.role,
    status: record.status,
    invitedBy: record.invitedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isValidProjectMember(item: ProjectMember): boolean {
  return normalizeProjectMember(item) !== null;
}

function copyProjectMember(item: ProjectMember): ProjectMember {
  return { ...item };
}

async function loadProjectMembers(ownerUid: string): Promise<ProjectMember[]> {
  const items = await readJsonArray<unknown>(
    scopedProjectMembersKey(ownerUid),
  );

  return items
    .map(normalizeProjectMember)
    .filter((item): item is ProjectMember => item !== null)
    .map(copyProjectMember);
}

export async function getProjectMembers(
  ownerUid: string,
): Promise<ProjectMember[]> {
  return loadProjectMembers(ownerUid);
}

export async function getProjectMembersForProject(
  ownerUid: string,
  projectId: string,
): Promise<ProjectMember[]> {
  const items = await loadProjectMembers(ownerUid);

  return items
    .filter((item) => item.projectId === projectId)
    .map(copyProjectMember);
}

export async function getProjectMemberById(
  ownerUid: string,
  memberId: string,
): Promise<ProjectMember | undefined> {
  const items = await loadProjectMembers(ownerUid);
  const found = items.find((item) => item.id === memberId);
  return found ? copyProjectMember(found) : undefined;
}

/**
 * Finds a membership for a project by authenticated userId.
 * Prefer active, then invited, then any other status match.
 */
export async function findProjectMemberByUserId(
  ownerUid: string,
  projectId: string,
  userId: string,
): Promise<ProjectMember | undefined> {
  if (!projectId.trim() || !userId.trim()) {
    return undefined;
  }

  const matches = (await loadProjectMembers(ownerUid)).filter(
    (item) => item.projectId === projectId && item.userId === userId,
  );

  if (matches.length === 0) {
    return undefined;
  }

  const active = matches.find((item) => item.status === "active");
  if (active) {
    return copyProjectMember(active);
  }

  const invited = matches.find((item) => item.status === "invited");
  if (invited) {
    return copyProjectMember(invited);
  }

  return copyProjectMember(matches[0]);
}

/**
 * Appends a ProjectMember for this owner namespace.
 * Does not overwrite an existing id.
 * Returns false when the id already exists.
 */
export async function addProjectMemberIfAbsent(
  ownerUid: string,
  member: ProjectMember,
): Promise<boolean> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for project member.");
  }

  if (!isValidProjectMember(member)) {
    throw new Error("Invalid project member.");
  }

  const items = await loadProjectMembers(ownerUid);

  if (items.some((existing) => existing.id === member.id)) {
    return false;
  }

  await writeJsonArray(scopedProjectMembersKey(ownerUid), [
    ...items,
    copyProjectMember(member),
  ]);

  return true;
}

export type ProjectMemberUpdate = {
  role?: ProjectMemberRole;
  status?: ProjectMemberStatus;
};

function isValidProjectMemberUpdate(update: ProjectMemberUpdate): boolean {
  if (update.role !== undefined && !isProjectMemberRole(update.role)) {
    return false;
  }

  if (update.status !== undefined && !isProjectMemberStatus(update.status)) {
    return false;
  }

  return update.role !== undefined || update.status !== undefined;
}

/**
 * Narrow ProjectMember field update.
 * Does not allow id / projectId / userId / invitedBy / createdAt mutation.
 * Sets updatedAt to now on successful write.
 */
export async function updateProjectMember(
  ownerUid: string,
  memberId: string,
  update: ProjectMemberUpdate,
  nowIso: string = new Date().toISOString(),
): Promise<ProjectMember | undefined> {
  if (
    !ownerUid.trim() ||
    !memberId.trim() ||
    !isValidProjectMemberUpdate(update)
  ) {
    throw new Error("Invalid project member update.");
  }

  const items = await loadProjectMembers(ownerUid);
  const index = items.findIndex((item) => item.id === memberId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];
  const nextMember: ProjectMember = {
    ...current,
    ...(update.role !== undefined ? { role: update.role } : {}),
    ...(update.status !== undefined ? { status: update.status } : {}),
    updatedAt: nowIso,
  };

  const next = [...items];
  next[index] = copyProjectMember(nextMember);
  await writeJsonArray(scopedProjectMembersKey(ownerUid), next);
  return copyProjectMember(nextMember);
}
