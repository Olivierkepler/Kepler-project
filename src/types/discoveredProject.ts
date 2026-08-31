import type { ProjectStatus } from "./project";
import type { ProjectMemberRole } from "./projectMember";

/**
 * Cloud project discovery DTO from GET /api/me/projects (Phase 1H.2).
 *
 * Distinct from local AsyncStorage Project — not written into local stores.
 * Discoverability ≠ operational project access.
 */
export type DiscoveredProjectMembership = {
  role: ProjectMemberRole;
  status: "active";
};

export type DiscoveredProject = {
  /** Remote Firestore project document ID. */
  id: string;
  /** Originating client/local project ID (maps to local Project.id when owned). */
  localProjectId: string;
  name: string;
  location: string;
  status: ProjectStatus;
  ownerUid: string;
  membership: DiscoveredProjectMembership;
};
