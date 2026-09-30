export type TeamMembershipStatus = "active" | "removed";

/** Team membership references a ProjectMember identity, never a bare UID. */
export type TeamMembership = {
  id: string;
  projectId: string;
  teamId: string;
  projectMemberId: string;
  status: TeamMembershipStatus;
  createdAt: string;
  updatedAt: string;
};
