/**
 * Project collaboration membership (Phase 1A foundation).
 *
 * Ownership of operational data remains storage-namespace scoped via
 * store `ownerUid` parameters — domain records stay free of ownerUid,
 * matching Evidence / Delta / Measurement conventions.
 *
 * Project.ownerUid is not part of the current Project domain type;
 * existing project ownership behavior is unchanged in this phase.
 */

export type ProjectMemberRole =
  | "owner"
  | "project_admin"
  | "contractor"
  | "field_member"
  | "viewer";

export type ProjectMemberStatus =
  | "invited"
  | "active"
  | "removed";

export type ProjectMember = {
  id: string;
  projectId: string;
  /** Authenticated user id for this membership. */
  userId: string;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  /** userId of the member who created the invite / membership. */
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};
