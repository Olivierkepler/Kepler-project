export type TeamMembershipStatus = "active" | "removed";

/** Links a Team to a canonical ProjectMember identity. */
export type TeamMembership = {
  id: string;
  projectId: string;
  teamId: string;
  projectMemberId: string;
  status: TeamMembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export const TEAM_MEMBERSHIP_STATUSES: readonly TeamMembershipStatus[] = [
  "active",
  "removed",
];
