import type { ProjectMemberRole } from "./projectMember.js";

/**
 * Cloud ProjectInvitation (Phase 1G).
 *
 * Compatible with mobile invitation statuses/roles.
 * Invitation ≠ Membership — creating or accepting does not grant general
 * project API access in Phase 1G (assertProjectOwnedByUser unchanged).
 */

export type ProjectInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type ProjectInvitation = {
  id: string;
  /** Remote Firestore project document ID. */
  projectId: string;
  /** Normalized invitee email (trim + lowercase). */
  email: string;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  /** Firebase Auth UID of the creator. */
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Set when accepted; otherwise null.
   * Audit only — not used for authorization in Phase 1G.
   */
  acceptedByUserId: string | null;
};

export const PROJECT_INVITATION_STATUSES: readonly ProjectInvitationStatus[] = [
  "pending",
  "accepted",
  "declined",
  "revoked",
] as const;

/** Statuses that block another invitation for the same project + email. */
export const BLOCKING_INVITATION_STATUSES: readonly ProjectInvitationStatus[] =
  ["pending", "accepted"] as const;

/** Roles allowed on create — owner transfer is a separate workflow. */
export const INVITABLE_PROJECT_MEMBER_ROLES: readonly Exclude<
  ProjectMemberRole,
  "owner"
>[] = ["project_admin", "contractor", "field_member", "viewer"] as const;

export type InvitableProjectMemberRole =
  (typeof INVITABLE_PROJECT_MEMBER_ROLES)[number];
