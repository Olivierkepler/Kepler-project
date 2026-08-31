import type { ProjectMemberRole } from "./projectMember";

/**
 * Project collaboration invitation (Phase 1B foundation).
 *
 * An invitation invites an email address to join a project with a role.
 * It does NOT grant access by itself — acceptance → ProjectMember is a
 * later phase. Domain records stay free of ownerUid; partitioning is
 * storage-namespace scoped like ProjectMember / Evidence.
 */

export type ProjectInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type ProjectInvitation = {
  id: string;
  projectId: string;
  /** Normalized invitee email (trim + lowercase). */
  email: string;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  /** userId of the member who created the invitation. */
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};
