import type { DiscoveredProject } from "../../domain/discoveredProject.js";
import type { Project } from "../../domain/project.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import { listActiveProjectMembershipsForUser } from "../../repositories/projectMembersRepository.js";
import {
  getProjectsByIds,
  getProjectsForOwner,
} from "../../repositories/projectsRepository.js";

function toDiscoveredProject(
  project: Project,
  membership: DiscoveredProject["membership"],
): DiscoveredProject {
  return {
    id: project.id,
    localProjectId: project.localProjectId,
    name: project.name,
    location: project.location,
    status: project.status,
    ownerUid: project.ownerUid,
    membership,
  };
}

function sortDiscoveredProjects(
  items: DiscoveredProject[],
): DiscoveredProject[] {
  return [...items].sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Discovers cloud projects for an authenticated user.
 *
 * Includes:
 * A) projects with ACTIVE ProjectMember for userId
 * B) legacy projects where Project.ownerUid == userId (effective owner role)
 *
 * Deduplicates by project id. Skips orphan memberships whose Project is missing.
 * Does not grant operational project API access.
 */
export async function discoverProjectsForUser(
  userId: string,
): Promise<DiscoveredProject[]> {
  const uid = userId.trim();

  if (!uid) {
    throw new Error("userId is required");
  }

  const [memberships, ownedProjects] = await Promise.all([
    listActiveProjectMembershipsForUser(uid),
    getProjectsForOwner(uid),
  ]);

  const membershipByProjectId = new Map<string, ProjectMember>();

  for (const membership of memberships) {
    membershipByProjectId.set(membership.projectId, membership);
  }

  const projectIds = new Set<string>();

  for (const membership of memberships) {
    projectIds.add(membership.projectId);
  }

  for (const project of ownedProjects) {
    projectIds.add(project.id);
  }

  const projects = await getProjectsByIds([...projectIds]);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  // Owned projects from the ownerUid query are authoritative even if batch miss.
  for (const project of ownedProjects) {
    projectById.set(project.id, project);
  }

  const discovered: DiscoveredProject[] = [];

  for (const projectId of projectIds) {
    const project = projectById.get(projectId);

    if (!project) {
      console.error(
        `Phase 1H discovery skipped orphan projectId=${projectId} userId=${uid}`,
      );
      continue;
    }

    const membership = membershipByProjectId.get(projectId);

    if (membership) {
      discovered.push(
        toDiscoveredProject(project, {
          role: membership.role,
          status: "active",
        }),
      );
      continue;
    }

    if (project.ownerUid === uid) {
      discovered.push(
        toDiscoveredProject(project, {
          role: "owner",
          status: "active",
        }),
      );
    }
  }

  return sortDiscoveredProjects(discovered);
}
