import type { WorkPackageAssignmentStatus } from "./workPackageAssignment";

export type TeamWorkPackageAssignment = {
  id: string;
  projectId: string;
  workPackageId: string;
  teamId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};
