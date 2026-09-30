import type { WorkPackageAssignmentStatus } from "./workPackageAssignment.js";

/** Team responsibility remains independent from individual member assignments. */
export type TeamWorkPackageAssignment = {
  id: string;
  projectId: string;
  workPackageId: string;
  teamId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};
