import type { Project } from "../domain/project.js";
import type { Team } from "../domain/team.js";
import type { TeamMembership } from "../domain/teamMembership.js";
import type { ProjectMember } from "../domain/projectMember.js";
import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { assertProjectAccessContext, type ProjectAccessContext } from "./collaboration/projectAccessScope.js";
import {
  archiveTeam as archiveTeamRecord,
  createTeam as createTeamRecord,
  getTeamById,
  listTeamsForProject,
  updateTeamName,
} from "../repositories/teamsRepository.js";
import {
  createTeamMembership,
  deactivateTeamMembershipsForTeam,
  listTeamMembershipsForProjectMember,
  listTeamMembershipsForTeam,
  removeTeamMembership,
} from "../repositories/teamMembershipsRepository.js";
import { getProjectMemberById } from "../repositories/projectMembersRepository.js";
import { createTeamId } from "../domain/teamId.js";
import { hasActiveTeamWorkPackageAssignments } from "../repositories/teamWorkPackageAssignmentsRepository.js";

export class TeamServiceError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409 = 404) {
    super(message);
    this.name = "TeamServiceError";
  }
}

export type TeamServiceDependencies = {
  assertOwned(projectId: string, uid: string): Promise<Project>;
  assertReadable(projectId: string, uid: string): Promise<ProjectAccessContext>;
  createTeam(team: Team): Promise<void>;
  getTeam(teamId: string): Promise<Team | undefined>;
  listTeams(projectId: string): Promise<Team[]>;
  updateTeamName(input: { projectId: string; teamId: string; name: string; updatedAt: string }): Promise<Team | undefined>;
  archiveTeam(input: { projectId: string; teamId: string; updatedAt: string }): Promise<Team | undefined>;
  getProjectMember(memberId: string): Promise<ProjectMember | undefined>;
  listMembershipsForTeam(input: { projectId: string; teamId: string }): Promise<TeamMembership[]>;
  listMembershipsForMember(input: { projectId: string; projectMemberId: string }): Promise<TeamMembership[]>;
  createMembership(input: { projectId: string; teamId: string; projectMemberId: string; nowIso: string }): ReturnType<typeof createTeamMembership>;
  removeMembership(input: { projectId: string; teamId: string; projectMemberId: string; updatedAt: string }): Promise<TeamMembership | undefined>;
  deactivateMemberships(input: { projectId: string; teamId: string; updatedAt: string }): Promise<void>;
  hasActiveWorkPackageAssignments?(projectId: string, teamId: string): Promise<boolean>;
};

const defaultDependencies: TeamServiceDependencies = {
  assertOwned: assertProjectOwnedByUser,
  assertReadable: assertProjectAccessContext,
  createTeam: createTeamRecord,
  getTeam: getTeamById,
  listTeams: listTeamsForProject,
  updateTeamName,
  archiveTeam: archiveTeamRecord,
  getProjectMember: getProjectMemberById,
  listMembershipsForTeam: listTeamMembershipsForTeam,
  listMembershipsForMember: listTeamMembershipsForProjectMember,
  createMembership: createTeamMembership,
  removeMembership: removeTeamMembership,
  deactivateMemberships: deactivateTeamMembershipsForTeam,
  hasActiveWorkPackageAssignments: hasActiveTeamWorkPackageAssignments,
};

function requireActiveTeam(team: Team | undefined, projectId: string): Team {
  if (!team || team.projectId !== projectId || team.status !== "active") {
    throw new TeamServiceError("Team not found", 404);
  }
  return team;
}

async function canReadTeam(
  access: ProjectAccessContext,
  teamId: string,
  deps: TeamServiceDependencies,
): Promise<boolean> {
  if (access.accessMode === "full") return true;
  const ownMembershipId = access.membership?.id;
  if (!ownMembershipId) return false;
  const teamMemberships = await deps.listMembershipsForTeam({
    projectId: access.project.id,
    teamId,
  });
  return teamMemberships.some((item) => item.projectMemberId === ownMembershipId);
}

export async function listTeamsForReader(
  projectId: string,
  uid: string,
  deps: TeamServiceDependencies = defaultDependencies,
): Promise<Team[]> {
  const access = await deps.assertReadable(projectId, uid);
  const teams = await deps.listTeams(projectId);
  if (access.accessMode === "full") return teams;
  const ownMembershipId = access.membership?.id;
  if (!ownMembershipId) return [];
  const memberships = await deps.listMembershipsForMember({
    projectId,
    projectMemberId: ownMembershipId,
  });
  const visibleIds = new Set(memberships.map((item) => item.teamId));
  return teams.filter((team) => visibleIds.has(team.id));
}

export async function getTeamForReader(
  projectId: string,
  teamId: string,
  uid: string,
  deps: TeamServiceDependencies = defaultDependencies,
): Promise<Team> {
  const access = await deps.assertReadable(projectId, uid);
  const team = requireActiveTeam(await deps.getTeam(teamId), projectId);
  if (!(await canReadTeam(access, teamId, deps))) {
    throw new TeamServiceError("Team not found", 404);
  }
  return team;
}

export async function listTeamMembersForReader(
  projectId: string,
  teamId: string,
  uid: string,
  deps: TeamServiceDependencies = defaultDependencies,
): Promise<TeamMembership[]> {
  const access = await deps.assertReadable(projectId, uid);
  requireActiveTeam(await deps.getTeam(teamId), projectId);
  if (!(await canReadTeam(access, teamId, deps))) {
    throw new TeamServiceError("Team not found", 404);
  }
  return deps.listMembershipsForTeam({ projectId, teamId });
}

export async function createTeamForOwner(input: {
  projectId: string;
  uid: string;
  name: string;
  nowIso?: string;
}, deps: TeamServiceDependencies = defaultDependencies): Promise<Team> {
  const project = await deps.assertOwned(input.projectId, input.uid);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const team: Team = {
    id: createTeamId(),
    projectId: project.id,
    name: input.name,
    status: "active",
    createdBy: input.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await deps.createTeam(team);
  return team;
}

export async function renameTeamForOwner(input: {
  projectId: string;
  teamId: string;
  uid: string;
  name: string;
  nowIso?: string;
}, deps: TeamServiceDependencies = defaultDependencies): Promise<Team> {
  await deps.assertOwned(input.projectId, input.uid);
  requireActiveTeam(await deps.getTeam(input.teamId), input.projectId);
  const updated = await deps.updateTeamName({
    projectId: input.projectId,
    teamId: input.teamId,
    name: input.name,
    updatedAt: input.nowIso ?? new Date().toISOString(),
  });
  if (!updated) throw new TeamServiceError("Team not found", 404);
  return updated;
}

export async function addTeamMemberForOwner(input: {
  projectId: string;
  teamId: string;
  projectMemberId: string;
  uid: string;
  nowIso?: string;
}, deps: TeamServiceDependencies = defaultDependencies): Promise<{ membership: TeamMembership; created: boolean }> {
  await deps.assertOwned(input.projectId, input.uid);
  requireActiveTeam(await deps.getTeam(input.teamId), input.projectId);
  const member = await deps.getProjectMember(input.projectMemberId);
  if (!member || member.projectId !== input.projectId || member.status !== "active") {
    throw new TeamServiceError("Active Project Member not found", 404);
  }
  const result = await deps.createMembership({
    projectId: input.projectId,
    teamId: input.teamId,
    projectMemberId: input.projectMemberId,
    nowIso: input.nowIso ?? new Date().toISOString(),
  });
  if (result.kind === "team_not_found" || result.kind === "team_archived") {
    throw new TeamServiceError("Team not found", 404);
  }
  if (result.kind === "member_not_found") {
    throw new TeamServiceError("Active Project Member not found", 404);
  }
  if (result.kind === "wrong_project") {
    throw new TeamServiceError("Team and Project Member must belong to this project", 400);
  }
  if (result.kind !== "created" && result.kind !== "reactivated" && result.kind !== "existing") {
    throw new TeamServiceError("Team membership could not be created", 400);
  }
  return { membership: result.membership, created: result.kind === "created" };
}

export async function removeTeamMemberForOwner(input: {
  projectId: string;
  teamId: string;
  projectMemberId: string;
  uid: string;
  nowIso?: string;
}, deps: TeamServiceDependencies = defaultDependencies): Promise<void> {
  await deps.assertOwned(input.projectId, input.uid);
  requireActiveTeam(await deps.getTeam(input.teamId), input.projectId);
  const member = await deps.getProjectMember(input.projectMemberId);
  if (!member || member.projectId !== input.projectId) {
    throw new TeamServiceError("Project Member not found", 404);
  }
  await deps.removeMembership({
    projectId: input.projectId,
    teamId: input.teamId,
    projectMemberId: input.projectMemberId,
    updatedAt: input.nowIso ?? new Date().toISOString(),
  });
}

export async function archiveTeamForOwner(input: {
  projectId: string;
  teamId: string;
  uid: string;
  nowIso?: string;
}, deps: TeamServiceDependencies = defaultDependencies): Promise<Team> {
  await deps.assertOwned(input.projectId, input.uid);
  const existing = await deps.getTeam(input.teamId);
  if (!existing || existing.projectId !== input.projectId) {
    throw new TeamServiceError("Team not found", 404);
  }
  if (await deps.hasActiveWorkPackageAssignments?.(input.projectId, input.teamId)) {
    throw new TeamServiceError(
      "Remove this Team from its assigned Work Packages before archiving it.",
      409,
    );
  }
  const nowIso = input.nowIso ?? new Date().toISOString();
  const archived = await deps.archiveTeam({
    projectId: input.projectId,
    teamId: input.teamId,
    updatedAt: nowIso,
  });
  if (!archived) throw new TeamServiceError("Team not found", 404);
  await deps.deactivateMemberships({
    projectId: input.projectId,
    teamId: input.teamId,
    updatedAt: nowIso,
  });
  return archived;
}
