import type { ProjectMemberRole } from "../../types/projectMember";

/**
 * Human-readable collaboration role labels (presentation only).
 */
export function formatProjectMemberRoleLabel(
  role: ProjectMemberRole | string,
): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "project_admin":
      return "Project admin";
    case "contractor":
      return "Contractor";
    case "field_member":
      return "Field member";
    case "viewer":
      return "Viewer";
    default:
      return "Project member";
  }
}
