export type TeamStatus = "active" | "archived";

/** Presentation-safe cloud Team record. */
export type Team = {
  id: string;
  projectId: string;
  name: string;
  status: TeamStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
