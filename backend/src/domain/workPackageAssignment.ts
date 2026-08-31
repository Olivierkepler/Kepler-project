/**
 * Cloud WorkPackageAssignment (Phase 2D foundation + Phase 2K.1 progress).
 *
 * Semantically compatible with mobile src/types/workPackageAssignment.ts.
 * Timestamps follow backend ISO-string convention.
 *
 * - id: remote canonical Firestore document ID
 * - projectId: remote Project ID
 * - workPackageId: remote WorkPackage ID
 * - projectMemberId: remote ProjectMember ID (not Firebase userId)
 *
 * One record = one member ↔ one WorkPackage responsibility.
 * status is the assignment lifecycle (not percentage progress).
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
  /** Canonical ProjectMember.id — not userId. */
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};

export const WORK_PACKAGE_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] =
  [
    "assigned",
    "accepted",
    "in_progress",
    "ready_for_review",
    "completed",
    "cancelled",
  ] as const;

/**
 * Statuses that block another assignment for the same
 * projectId + workPackageId + projectMemberId relationship.
 * cancelled does not block reassignment.
 */
export const BLOCKING_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] =
  [
    "assigned",
    "accepted",
    "in_progress",
    "ready_for_review",
    "completed",
  ] as const;
