import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { Project } from "../../domain/project.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import { getProjectMember } from "../../repositories/projectMembersRepository.js";
import { getProjectById } from "../../repositories/projectsRepository.js";

/**
 * Membership-aware READ authorization context (Phase 1I).
 *
 * Discoverability (/me/projects) ≠ read authorization.
 * Read authorization ≠ write permission.
 *
 * Assignment-aware scope filtering lives in projectAccessScope.ts (Phase 2H.1).
 * Prefer assertProjectAccessContext for operational LIST endpoints.
 */
export type ProjectReadAccess = {
  project: Project;
  isOwner: boolean;
  /** Present when an ACTIVE ProjectMember row exists for the user. */
  membership: ProjectMember | null;
};

/**
 * Allows READ access when the user is the project owner OR an ACTIVE member.
 *
 * - Project.ownerUid remains sufficient for owners (no membership required).
 * - invited / removed memberships do not grant access.
 * - Missing or unauthorized projects surface as 404 (same as owner checks).
 *
 * Does not grant write/mutation permission.
 */
export async function assertProjectReadableByUser(
  projectId: string,
  uid: string,
): Promise<ProjectReadAccess> {
  if (!uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const trimmedProjectId = projectId.trim();

  if (!trimmedProjectId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const project = await getProjectById(trimmedProjectId);

  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (project.ownerUid === uid) {
    const membership = await getProjectMember(trimmedProjectId, uid);

    return {
      project,
      isOwner: true,
      membership:
        membership && membership.status === "active" ? membership : null,
    };
  }

  const membership = await getProjectMember(trimmedProjectId, uid);

  if (!membership || membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  return {
    project,
    isOwner: false,
    membership,
  };
}
