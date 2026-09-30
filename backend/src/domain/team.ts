export type TeamStatus = "active" | "archived";

/** Project-scoped work group. Presentation and assignment data live elsewhere. */
export type Team = {
  id: string;
  projectId: string;
  name: string;
  status: TeamStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const TEAM_STATUSES: readonly TeamStatus[] = ["active", "archived"];
