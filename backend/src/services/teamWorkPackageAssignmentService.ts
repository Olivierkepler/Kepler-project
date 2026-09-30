import type { Project } from "../domain/project.js";
import type { Team } from "../domain/team.js";
import type { TeamWorkPackageAssignment } from "../domain/teamWorkPackageAssignment.js";
import type { WorkPackage } from "../domain/workPackage.js";
import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { assertProjectAccessContext, type ProjectAccessContext } from "./collaboration/projectAccessScope.js";
import { getTeamById } from "../repositories/teamsRepository.js";
import { getWorkPackageById } from "../repositories/workPackagesRepository.js";
import { createTeamWorkPackageAssignment, hasActiveTeamWorkPackageAssignments, listTeamWorkPackageAssignmentsForProject, removeTeamWorkPackageAssignment } from "../repositories/teamWorkPackageAssignmentsRepository.js";
import { listTeamMembershipsForProjectMember } from "../repositories/teamMembershipsRepository.js";

export class TeamWorkPackageAssignmentError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 409 = 404) { super(message); this.name = "TeamWorkPackageAssignmentError"; }
}

export type TeamWorkPackageAssignmentDependencies = {
  assertOwned(projectId: string, uid: string): Promise<Project>;
  assertReadable(projectId: string, uid: string): Promise<ProjectAccessContext>;
  getTeam(teamId: string): Promise<Team | undefined>;
  getWorkPackage(workPackageId: string): Promise<WorkPackage | undefined>;
  create(input: { projectId: string; workPackageId: string; teamId: string }): ReturnType<typeof createTeamWorkPackageAssignment>;
  list(projectId: string): Promise<TeamWorkPackageAssignment[]>;
  remove(projectId: string, workPackageId: string, teamId: string): Promise<TeamWorkPackageAssignment | undefined>;
  teamHasMembership(projectId: string, teamId: string, projectMemberId: string): Promise<boolean>;
  hasActiveForTeam(projectId: string, teamId: string): Promise<boolean>;
};

const defaults: TeamWorkPackageAssignmentDependencies = {
  assertOwned: assertProjectOwnedByUser,
  assertReadable: assertProjectAccessContext,
  getTeam: getTeamById,
  getWorkPackage: getWorkPackageById,
  create: createTeamWorkPackageAssignment,
  list: listTeamWorkPackageAssignmentsForProject,
  remove: removeTeamWorkPackageAssignment,
  async teamHasMembership(projectId, teamId, projectMemberId) {
    return (await listTeamMembershipsForProjectMember({ projectId, projectMemberId })).some((membership) => membership.teamId === teamId);
  },
  hasActiveForTeam: hasActiveTeamWorkPackageAssignments,
};

export async function assignTeamToWorkPackage(input: { projectId: string; workPackageId: string; teamId: string; uid: string }, deps = defaults) {
  await deps.assertOwned(input.projectId, input.uid);
  const [team, workPackage] = await Promise.all([deps.getTeam(input.teamId), deps.getWorkPackage(input.workPackageId)]);
  if (!workPackage || workPackage.projectId !== input.projectId) throw new TeamWorkPackageAssignmentError("Work package does not belong to this project", 400);
  if (!team || team.projectId !== input.projectId) throw new TeamWorkPackageAssignmentError("Team does not belong to this project", 400);
  if (team.status !== "active") throw new TeamWorkPackageAssignmentError("Archived Teams cannot receive assignments", 400);
  const result = await deps.create({ projectId: input.projectId, workPackageId: input.workPackageId, teamId: input.teamId });
  if (!result.created) {
    if (result.reason === "duplicate") throw new TeamWorkPackageAssignmentError("This Team is already assigned to the Work Package", 409);
    throw new TeamWorkPackageAssignmentError("Team and Work Package must belong to this project", 400);
  }
  return result.assignment;
}

export async function listTeamAssignmentsForReader(projectId: string, uid: string, deps = defaults): Promise<TeamWorkPackageAssignment[]> {
  const access = await deps.assertReadable(projectId, uid);
  const records = await deps.list(projectId);
  if (access.accessMode === "full") return records;
  const ownMemberId = access.membership?.id;
  if (!ownMemberId) return [];
  const visible = await Promise.all(records.map((record) => deps.teamHasMembership(projectId, record.teamId, ownMemberId)));
  return records.filter((record, index) => visible[index] && access.assignedWorkPackageIds.includes(record.workPackageId));
}

export async function removeTeamAssignment(input: { projectId: string; workPackageId: string; teamId: string; uid: string }, deps = defaults) {
  await deps.assertOwned(input.projectId, input.uid);
  return deps.remove(input.projectId, input.workPackageId, input.teamId);
}

export async function teamCanArchive(projectId: string, teamId: string, deps = defaults): Promise<boolean> {
  return !(await deps.hasActiveForTeam(projectId, teamId));
}
