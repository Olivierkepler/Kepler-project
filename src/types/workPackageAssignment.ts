/**
 * Local WorkPackageAssignment domain foundation (Phase 2B).
 *
 * Connects one ProjectMember to one WorkPackage within a Project.
 * Responsibility/assignment foundation only — not permissions.
 *
 * References ProjectMember.id (membership in the project), not a bare
 * userId. Do not duplicate member role/email/name here.
 *
 * Multiple assignments per WorkPackage and per ProjectMember are
 * represented as separate records.
 *
 * Ownership partitioning remains storage-namespace scoped via store
 * `ownerUid` parameters — domain records stay free of ownerUid.
 */

export type WorkPackageAssignmentStatus =
  | "assigned"
  | "accepted"
  | "in_progress"
  | "ready_for_review"
  | "completed"
  | "cancelled";

export type WorkPackageAssignment = {
  id: string;
  projectId: string;
  workPackageId: string;
  /** ProjectMember.id for this project — not Firebase userId. */
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};
