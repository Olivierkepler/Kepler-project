import {
  PROJECT_MEMBER_ROLES,
  PROJECT_MEMBER_STATUSES,
  type ProjectMember,
  type ProjectMemberRole,
  type ProjectMemberStatus,
} from "../domain/projectMember.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function isProjectMemberRole(
  value: unknown,
): value is ProjectMemberRole {
  return (
    typeof value === "string" &&
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(value)
  );
}

export function isProjectMemberStatus(
  value: unknown,
): value is ProjectMemberStatus {
  return (
    typeof value === "string" &&
    (PROJECT_MEMBER_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normalizes a Firestore ProjectMember document.
 * Invalid / incomplete docs are rejected (undefined).
 */
export function normalizeProjectMemberDocument(
  data: unknown,
): ProjectMember | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.userId) ||
    !isProjectMemberRole(data.role) ||
    !isProjectMemberStatus(data.status) ||
    !isNonEmptyString(data.invitedBy) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    userId: data.userId.trim(),
    role: data.role,
    status: data.status,
    invitedBy: data.invitedBy.trim(),
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
  };
}
