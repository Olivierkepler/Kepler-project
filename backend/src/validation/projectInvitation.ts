import {
  BLOCKING_INVITATION_STATUSES,
  INVITABLE_PROJECT_MEMBER_ROLES,
  PROJECT_INVITATION_STATUSES,
  type InvitableProjectMemberRole,
  type ProjectInvitation,
  type ProjectInvitationStatus,
} from "../domain/projectInvitation.js";
import { isProjectMemberRole } from "./projectMember.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

/**
 * Deterministic invitee email normalization for storage / comparison.
 */
export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isProjectInvitationStatus(
  value: unknown,
): value is ProjectInvitationStatus {
  return (
    typeof value === "string" &&
    (PROJECT_INVITATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isInvitableProjectMemberRole(
  value: unknown,
): value is InvitableProjectMemberRole {
  return (
    typeof value === "string" &&
    (INVITABLE_PROJECT_MEMBER_ROLES as readonly string[]).includes(value)
  );
}

export function isBlockingInvitationStatus(
  status: ProjectInvitationStatus,
): boolean {
  return (BLOCKING_INVITATION_STATUSES as readonly string[]).includes(status);
}

/**
 * Create-invitation body: email + invitable role only.
 * Never accepts invitedBy / projectId / status from the client.
 */
export function parseProjectInvitationCreateInput(
  body: unknown,
): { email: string; role: InvitableProjectMemberRole } | null {
  if (!isRecord(body)) {
    return null;
  }

  if (!isNonEmptyString(body.email) || !isInvitableProjectMemberRole(body.role)) {
    return null;
  }

  const email = normalizeInvitationEmail(body.email);

  if (!email) {
    return null;
  }

  return { email, role: body.role };
}

/**
 * Normalizes a Firestore ProjectInvitation document.
 */
export function normalizeProjectInvitationDocument(
  data: unknown,
): ProjectInvitation | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.email) ||
    !isProjectMemberRole(data.role) ||
    !isProjectInvitationStatus(data.status) ||
    !isNonEmptyString(data.invitedBy) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) {
    return undefined;
  }

  let acceptedByUserId: string | null = null;

  if (data.acceptedByUserId === null || data.acceptedByUserId === undefined) {
    acceptedByUserId = null;
  } else if (isNonEmptyString(data.acceptedByUserId)) {
    acceptedByUserId = data.acceptedByUserId.trim();
  } else {
    return undefined;
  }

  const email = normalizeInvitationEmail(data.email);

  if (!email) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    email,
    role: data.role,
    status: data.status,
    invitedBy: data.invitedBy.trim(),
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
    acceptedByUserId,
  };
}
