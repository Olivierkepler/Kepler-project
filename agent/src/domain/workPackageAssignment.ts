/**
 * Minimal WorkPackageAssignment shape for agent provenance (Phase 2L.1).
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
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};
