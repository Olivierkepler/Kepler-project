/**
 * Minimal ProjectMember shape for agent provenance (Phase 2L.1).
 * Role only is exposed to the model — never email/phone/userId as PII display.
 */
export type ProjectMemberRole =
  | "owner"
  | "project_admin"
  | "contractor"
  | "field_member"
  | "viewer";

export type ProjectMemberStatus = "invited" | "active" | "removed";

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};
