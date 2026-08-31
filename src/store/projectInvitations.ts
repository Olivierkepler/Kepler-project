import type { ProjectMemberRole } from "../types/projectMember";
import type {
  ProjectInvitation,
  ProjectInvitationStatus,
} from "../types/projectInvitation";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

const PROJECT_MEMBER_ROLES: readonly ProjectMemberRole[] = [
  "owner",
  "project_admin",
  "contractor",
  "field_member",
  "viewer",
];

const PROJECT_INVITATION_STATUSES: readonly ProjectInvitationStatus[] = [
  "pending",
  "accepted",
  "declined",
  "revoked",
];

/** Statuses that block creating another invitation for the same project + email. */
const BLOCKING_INVITATION_STATUSES: readonly ProjectInvitationStatus[] = [
  "pending",
  "accepted",
];

function scopedProjectInvitationsKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for project invitation storage.");
  }

  return `${STORAGE_KEYS.projectInvitations}/${ownerUid}`;
}

/**
 * Deterministic invitee email normalization for storage / comparison.
 */
export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isProjectMemberRole(value: unknown): value is ProjectMemberRole {
  return (
    typeof value === "string" &&
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(value)
  );
}

function isProjectInvitationStatus(
  value: unknown,
): value is ProjectInvitationStatus {
  return (
    typeof value === "string" &&
    (PROJECT_INVITATION_STATUSES as readonly string[]).includes(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Local id helper — matches project-member- / project- / plan- style generators.
 */
export function createLocalProjectInvitationId(
  now: number = Date.now(),
): string {
  return `project-invitation-${now}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeProjectInvitation(
  value: unknown,
): ProjectInvitation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.email) ||
    !isProjectMemberRole(record.role) ||
    !isProjectInvitationStatus(record.status) ||
    !isNonEmptyString(record.invitedBy) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  const email = normalizeInvitationEmail(record.email);

  if (!email) {
    return null;
  }

  return {
    id: record.id,
    projectId: record.projectId,
    email,
    role: record.role,
    status: record.status,
    invitedBy: record.invitedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isValidProjectInvitation(item: ProjectInvitation): boolean {
  return normalizeProjectInvitation(item) !== null;
}

function copyProjectInvitation(item: ProjectInvitation): ProjectInvitation {
  return { ...item };
}

function hasBlockingInvitationForEmail(
  items: ProjectInvitation[],
  projectId: string,
  email: string,
): boolean {
  return items.some(
    (item) =>
      item.projectId === projectId &&
      item.email === email &&
      BLOCKING_INVITATION_STATUSES.includes(item.status),
  );
}

async function loadProjectInvitations(
  ownerUid: string,
): Promise<ProjectInvitation[]> {
  const items = await readJsonArray<unknown>(
    scopedProjectInvitationsKey(ownerUid),
  );

  return items
    .map(normalizeProjectInvitation)
    .filter((item): item is ProjectInvitation => item !== null)
    .map(copyProjectInvitation);
}

export async function getProjectInvitations(
  ownerUid: string,
): Promise<ProjectInvitation[]> {
  return loadProjectInvitations(ownerUid);
}

export async function getProjectInvitationsForProject(
  ownerUid: string,
  projectId: string,
): Promise<ProjectInvitation[]> {
  const items = await loadProjectInvitations(ownerUid);

  return items
    .filter((item) => item.projectId === projectId)
    .map(copyProjectInvitation);
}

export async function getProjectInvitationById(
  ownerUid: string,
  invitationId: string,
): Promise<ProjectInvitation | undefined> {
  const items = await loadProjectInvitations(ownerUid);
  const found = items.find((item) => item.id === invitationId);
  return found ? copyProjectInvitation(found) : undefined;
}

/**
 * Finds an invitation for a project by invitee email (normalized).
 * Prefers pending, then accepted, then any other status match.
 */
export async function findProjectInvitationByEmail(
  ownerUid: string,
  projectId: string,
  email: string,
): Promise<ProjectInvitation | undefined> {
  const normalized = normalizeInvitationEmail(email);

  if (!normalized || !projectId.trim()) {
    return undefined;
  }

  const matches = (await loadProjectInvitations(ownerUid)).filter(
    (item) => item.projectId === projectId && item.email === normalized,
  );

  if (matches.length === 0) {
    return undefined;
  }

  const pending = matches.find((item) => item.status === "pending");
  if (pending) {
    return copyProjectInvitation(pending);
  }

  const accepted = matches.find((item) => item.status === "accepted");
  if (accepted) {
    return copyProjectInvitation(accepted);
  }

  return copyProjectInvitation(matches[0]);
}

/**
 * Appends a ProjectInvitation for this owner namespace.
 *
 * Returns false when:
 * - the invitation id already exists, OR
 * - the project already has a pending/accepted invitation for the same
 *   normalized email
 *
 * Does NOT create a ProjectMember. Does not overwrite existing records.
 */
export async function addProjectInvitationIfAbsent(
  ownerUid: string,
  invitation: ProjectInvitation,
): Promise<boolean> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for project invitation.");
  }

  const normalized = normalizeProjectInvitation(invitation);

  if (!normalized || !isValidProjectInvitation(normalized)) {
    throw new Error("Invalid project invitation.");
  }

  const items = await loadProjectInvitations(ownerUid);

  if (items.some((existing) => existing.id === normalized.id)) {
    return false;
  }

  if (
    hasBlockingInvitationForEmail(
      items,
      normalized.projectId,
      normalized.email,
    )
  ) {
    return false;
  }

  await writeJsonArray(scopedProjectInvitationsKey(ownerUid), [
    ...items,
    copyProjectInvitation(normalized),
  ]);

  return true;
}

export type ProjectInvitationUpdate = {
  role?: ProjectMemberRole;
  status?: ProjectInvitationStatus;
};

function isValidProjectInvitationUpdate(
  update: ProjectInvitationUpdate,
): boolean {
  if (update.role !== undefined && !isProjectMemberRole(update.role)) {
    return false;
  }

  if (
    update.status !== undefined &&
    !isProjectInvitationStatus(update.status)
  ) {
    return false;
  }

  return update.role !== undefined || update.status !== undefined;
}

/**
 * Narrow ProjectInvitation field update.
 * Does not allow id / projectId / email / invitedBy / createdAt mutation.
 * Sets updatedAt to now on successful write.
 */
export async function updateProjectInvitation(
  ownerUid: string,
  invitationId: string,
  update: ProjectInvitationUpdate,
  nowIso: string = new Date().toISOString(),
): Promise<ProjectInvitation | undefined> {
  if (
    !ownerUid.trim() ||
    !invitationId.trim() ||
    !isValidProjectInvitationUpdate(update)
  ) {
    throw new Error("Invalid project invitation update.");
  }

  const items = await loadProjectInvitations(ownerUid);
  const index = items.findIndex((item) => item.id === invitationId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];
  const nextInvitation: ProjectInvitation = {
    ...current,
    ...(update.role !== undefined ? { role: update.role } : {}),
    ...(update.status !== undefined ? { status: update.status } : {}),
    updatedAt: nowIso,
  };

  const next = [...items];
  next[index] = copyProjectInvitation(nextInvitation);
  await writeJsonArray(scopedProjectInvitationsKey(ownerUid), next);
  return copyProjectInvitation(nextInvitation);
}
