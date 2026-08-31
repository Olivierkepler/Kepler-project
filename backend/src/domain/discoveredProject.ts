import type { ProjectStatus } from "./project.js";
import type { ProjectMemberRole } from "./projectMember.js";

/**
 * Safe project discovery DTO (Phase 1H).
 *
 * Discoverability ≠ operational project API access.
 * Membership role is the authenticated user's effective role for listing.
 */
export type DiscoveredProjectMembership = {
  role: ProjectMemberRole;
  status: "active";
};

export type DiscoveredProject = {
  id: string;
  localProjectId: string;
  name: string;
  location: string;
  status: ProjectStatus;
  ownerUid: string;
  membership: DiscoveredProjectMembership;
};
