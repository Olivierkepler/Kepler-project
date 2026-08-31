import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { ProjectMemberRole } from "../../domain/projectMember.js";
import {
  ensureOwnerProjectMember,
  getProjectMemberById,
} from "../../repositories/projectMembersRepository.js";
import { assertProjectReadableByUser } from "../collaboration/projectReadAccess.js";
import { createProjectMemberId } from "../../domain/projectMemberId.js";

export type FeedAccessContext = {
  projectId: string;
  currentUserId: string;
  role: ProjectMemberRole | "legacy_owner";
  isOwner: boolean;
};

const WRITABLE_ROLES = new Set<ProjectMemberRole | "legacy_owner">([
  "legacy_owner",
  "owner",
  "project_admin",
  "contractor",
  "field_member",
]);

export function canCreateFeedPost(
  role: ProjectMemberRole | "legacy_owner",
): boolean {
  return WRITABLE_ROLES.has(role);
}

export async function assertFeedReadable(
  projectId: string,
  uid: string,
): Promise<FeedAccessContext> {
  const readAccess = await assertProjectReadableByUser(projectId, uid);

  if (readAccess.isOwner) {
    return {
      projectId: readAccess.project.id,
      currentUserId: uid,
      role: "legacy_owner",
      isOwner: true,
    };
  }

  if (!readAccess.membership || readAccess.membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  return {
    projectId: readAccess.project.id,
    currentUserId: uid,
    role: readAccess.membership.role,
    isOwner: false,
  };
}

export async function assertFeedWritable(
  projectId: string,
  uid: string,
): Promise<FeedAccessContext> {
  const readAccess = await assertProjectReadableByUser(projectId, uid);

  if (readAccess.isOwner) {
    return {
      projectId: readAccess.project.id,
      currentUserId: uid,
      role: "legacy_owner",
      isOwner: true,
    };
  }

  let membership = readAccess.membership;

  if (!membership) {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (!canCreateFeedPost(membership.role)) {
    throw new ProjectAccessError("Project not found", 404);
  }

  return {
    projectId: readAccess.project.id,
    currentUserId: uid,
    role: membership.role,
    isOwner: false,
  };
}

export function resolveProjectMemberId(
  projectId: string,
  userId: string,
): string {
  return createProjectMemberId(projectId, userId);
}

export async function ensureFeedOwnerMembership(
  projectId: string,
  ownerUid: string,
) {
  const memberId = resolveProjectMemberId(projectId, ownerUid);
  const existing = await getProjectMemberById(memberId);

  if (existing) {
    return existing;
  }

  const project = await assertProjectReadableByUser(projectId, ownerUid);

  if (!project.isOwner) {
    throw new ProjectAccessError("Project not found", 404);
  }

  return ensureOwnerProjectMember(project.project);
}
