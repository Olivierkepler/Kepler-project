import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Project } from "../domain/project.js";
import type { ProjectMember } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { normalizeProjectMemberDocument } from "../validation/projectMember.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function sortProjectMembers(items: ProjectMember[]): ProjectMember[] {
  return [...items].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") {
      return -1;
    }
    if (b.role === "owner" && a.role !== "owner") {
      return 1;
    }
    const userCmp = a.userId.localeCompare(b.userId);
    if (userCmp !== 0) {
      return userCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export async function getProjectMemberById(
  memberId: string,
): Promise<ProjectMember | undefined> {
  requireId(memberId, "memberId");

  const snapshot = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(memberId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeProjectMemberDocument(snapshot.data());
}

export async function getProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMember | undefined> {
  requireId(projectId, "projectId");
  requireId(userId, "userId");

  return getProjectMemberById(createProjectMemberId(projectId, userId));
}

export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.projectMembers)
    .where("projectId", "==", projectId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeProjectMemberDocument(doc.data()))
    .filter((item): item is ProjectMember => item !== undefined);

  return sortProjectMembers(items);
}

/**
 * Active memberships for a user (foundation for Phase 1H discovery).
 * Filters status in memory to avoid requiring a composite index in 1F.
 */
export async function listActiveProjectMembershipsForUser(
  userId: string,
): Promise<ProjectMember[]> {
  requireId(userId, "userId");

  const snapshot = await db
    .collection(COLLECTIONS.projectMembers)
    .where("userId", "==", userId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeProjectMemberDocument(doc.data()))
    .filter(
      (item): item is ProjectMember =>
        item !== undefined && item.status === "active",
    );

  return sortProjectMembers(items);
}

/**
 * Create-if-absent write. Does not overwrite an existing membership.
 * Returns true when a new document was written.
 */
export async function addProjectMemberIfAbsent(
  member: ProjectMember,
): Promise<boolean> {
  const normalized = normalizeProjectMemberDocument(member);

  if (!normalized) {
    throw new Error("Invalid project member.");
  }

  const expectedId = createProjectMemberId(
    normalized.projectId,
    normalized.userId,
  );

  if (normalized.id !== expectedId) {
    throw new Error("Project member id must be deterministic.");
  }

  const existing = await getProjectMemberById(normalized.id);

  if (existing) {
    return false;
  }

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(normalized.id)
    .set(normalized, { merge: false });

  return true;
}

/**
 * Ensures the cloud project owner has an active owner membership.
 * Idempotent create-if-absent — does not overwrite existing rows.
 */
export async function ensureOwnerProjectMember(
  project: Project,
  nowIso: string = new Date().toISOString(),
): Promise<ProjectMember> {
  requireId(project.id, "project.id");
  requireId(project.ownerUid, "project.ownerUid");

  const existing = await getProjectMember(project.id, project.ownerUid);

  if (existing) {
    return existing;
  }

  const member: ProjectMember = {
    id: createProjectMemberId(project.id, project.ownerUid),
    projectId: project.id,
    userId: project.ownerUid,
    role: "owner",
    status: "active",
    invitedBy: project.ownerUid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const created = await addProjectMemberIfAbsent(member);

  if (!created) {
    const raced = await getProjectMember(project.id, project.ownerUid);
    if (raced) {
      return raced;
    }
    throw new Error("Failed to ensure owner project membership.");
  }

  return member;
}

/**
 * Soft-remove an active ProjectMember (Phase 2M.1 activity source).
 * Idempotent when already removed. Does not delete the document.
 */
export async function markProjectMemberRemoved(
  memberId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ProjectMember | undefined> {
  requireId(memberId, "memberId");

  const existing = await getProjectMemberById(memberId);

  if (!existing) {
    return undefined;
  }

  if (existing.status === "removed") {
    return existing;
  }

  const updated: ProjectMember = {
    ...existing,
    status: "removed",
    updatedAt: nowIso,
  };

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(memberId)
    .set(updated, { merge: false });

  return updated;
}
