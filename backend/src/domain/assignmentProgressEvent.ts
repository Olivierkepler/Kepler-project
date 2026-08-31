import type { WorkPackageAssignmentStatus } from "./workPackageAssignment.js";

/**
 * Append-only audit record for WorkPackageAssignment lifecycle transitions
 * (Phase 2K.1).
 *
 * Does not represent Measurement contribution review or Delta disposition.
 */
export type AssignmentProgressEvent = {
  id: string;
  projectId: string;
  assignmentId: string;
  workPackageId: string;
  projectMemberId: string;
  previousStatus: WorkPackageAssignmentStatus | null;
  nextStatus: WorkPackageAssignmentStatus;
  actorUid: string;
  note?: string;
  createdAt: string;
};

/**
 * Builds an AssignmentProgressEvent document ID.
 * Format: `assignment-progress-event-${now}-${random}`
 */
export function createAssignmentProgressEventId(
  now: number = Date.now(),
): string {
  return `assignment-progress-event-${now}-${Math.floor(Math.random() * 100000)}`;
}
