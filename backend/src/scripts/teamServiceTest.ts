/** Safe, in-memory tests for project-scoped Teams and Team memberships. */
import type { Project } from "../domain/project.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { Team } from "../domain/team.js";
import type { TeamMembership } from "../domain/teamMembership.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";
import {
  addTeamMemberForOwner,
  archiveTeamForOwner,
  createTeamForOwner,
  listTeamMembersForReader,
  listTeamsForReader,
  renameTeamForOwner,
  removeTeamMemberForOwner,
  TeamServiceError,
  type TeamServiceDependencies,
} from "../services/teamService.js";
import { parseTeamCreateInput } from "../validation/team.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function expectReject(action: () => Promise<unknown>, message: string): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

const project: Project = {
  id: "remote-project-a",
  localProjectId: "project-local-a",
  ownerUid: "owner-a",
  name: "Test project",
  location: "",
  status: "active",
  progress: 0,
  openDeltas: 0,
  assignedTasks: 0,
};
const otherProject: Project = { ...project, id: "remote-project-b", ownerUid: "owner-b" };

function member(id: string, projectId: string): ProjectMember {
  return {
    id,
    projectId,
    userId: `user-${id}`,
    role: "field_member",
    status: "active",
    invitedBy: "owner-a",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
  };
}

function accessContext(target: Project, uid: string, memberId?: string): ProjectAccessContext {
  return {
    project: target,
    currentUserId: uid,
    isOwner: uid === target.ownerUid,
    membership: memberId ? member(memberId, target.id) : null,
    role: memberId ? "field_member" : "legacy_owner",
    accessMode: memberId ? "assigned_scope" : "full",
    assignedWorkPackageIds: [],
    assignedPlanItemIds: [],
  };
}

async function run(): Promise<void> {
  const teams: Team[] = [];
  const memberships: TeamMembership[] = [];
  const projectMembers = [member("pm-a", project.id), member("pm-b", project.id), member("pm-other", otherProject.id)];
  const unrelatedWorkPackageAssignments = [{ id: "assignment-kept", projectId: project.id }];
  const activeAssignedTeams = new Set<string>();

  const deps: TeamServiceDependencies = {
    async assertOwned(projectId, uid) {
      const target = [project, otherProject].find((item) => item.id === projectId && item.ownerUid === uid);
      if (!target) throw new Error("Owner access required");
      return target;
    },
    async assertReadable(projectId, uid) {
      const target = [project, otherProject].find((item) => item.id === projectId);
      if (!target) throw new Error("Project not found");
      if (uid === target.ownerUid) return accessContext(target, uid);
      const id = uid === "field-a" ? "pm-a" : uid === "field-b" ? "pm-b" : undefined;
      if (!id) throw new Error("Project access required");
      return accessContext(target, uid, id);
    },
    async createTeam(team) { teams.push(team); },
    async getTeam(teamId) { return teams.find((team) => team.id === teamId); },
    async listTeams(projectId) { return teams.filter((team) => team.projectId === projectId && team.status === "active"); },
    async updateTeamName(input) {
      const index = teams.findIndex((team) => team.id === input.teamId && team.projectId === input.projectId && team.status === "active");
      if (index < 0) return undefined;
      teams[index] = { ...teams[index]!, name: input.name, updatedAt: input.updatedAt };
      return teams[index];
    },
    async archiveTeam(input) {
      const index = teams.findIndex((team) => team.id === input.teamId && team.projectId === input.projectId);
      if (index < 0) return undefined;
      teams[index] = { ...teams[index]!, status: "archived", updatedAt: input.updatedAt };
      return teams[index];
    },
    async getProjectMember(memberId) { return projectMembers.find((item) => item.id === memberId); },
    async listMembershipsForTeam(input) {
      return memberships.filter((item) => item.projectId === input.projectId && item.teamId === input.teamId && item.status === "active");
    },
    async listMembershipsForMember(input) {
      return memberships.filter((item) => item.projectId === input.projectId && item.projectMemberId === input.projectMemberId && item.status === "active");
    },
    async createMembership(input) {
      const team = teams.find((item) => item.id === input.teamId);
      const projectMember = projectMembers.find((item) => item.id === input.projectMemberId);
      if (!team) return { kind: "team_not_found" };
      if (team.status !== "active") return { kind: "team_archived" };
      if (!projectMember || projectMember.status !== "active") return { kind: "member_not_found" };
      if (team.projectId !== input.projectId || projectMember.projectId !== input.projectId) return { kind: "wrong_project" };
      const existing = memberships.find((item) => item.teamId === input.teamId && item.projectMemberId === input.projectMemberId);
      if (existing?.status === "active") return { kind: "existing", membership: existing };
      if (existing) {
        const reactivated = { ...existing, status: "active" as const, updatedAt: input.nowIso };
        memberships[memberships.indexOf(existing)] = reactivated;
        return { kind: "reactivated", membership: reactivated };
      }
      const created: TeamMembership = {
        id: `tm-${memberships.length + 1}`,
        projectId: input.projectId,
        teamId: input.teamId,
        projectMemberId: input.projectMemberId,
        status: "active",
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      };
      memberships.push(created);
      return { kind: "created", membership: created };
    },
    async removeMembership(input) {
      const existing = memberships.find((item) => item.projectId === input.projectId && item.teamId === input.teamId && item.projectMemberId === input.projectMemberId && item.status === "active");
      if (!existing) return undefined;
      const removed = { ...existing, status: "removed" as const, updatedAt: input.updatedAt };
      memberships[memberships.indexOf(existing)] = removed;
      return removed;
    },
    async deactivateMemberships(input) {
      memberships.forEach((item, index) => {
        if (item.projectId === input.projectId && item.teamId === input.teamId && item.status === "active") {
          memberships[index] = { ...item, status: "removed", updatedAt: input.updatedAt };
        }
      });
    },
    async hasActiveWorkPackageAssignments(_projectId, teamId) { return activeAssignedTeams.has(teamId); },
  };

  assert(parseTeamCreateInput({ name: "  Electrical  " })?.name === "Electrical", "Team name is trimmed");
  assert(parseTeamCreateInput({ name: "  " }) === null, "Blank Team name is rejected");
  await expectReject(() => createTeamForOwner({ projectId: project.id, uid: "not-owner", name: "Denied" }, deps), "Non-owner cannot create a Team");

  const electrical = await createTeamForOwner({ projectId: project.id, uid: "owner-a", name: "Electrical" }, deps);
  const plumbing = await createTeamForOwner({ projectId: project.id, uid: "owner-a", name: "Plumbing" }, deps);
  assert((await listTeamsForReader(project.id, "owner-a", deps)).length === 2, "Authorized project reader lists Teams");
  assert((await renameTeamForOwner({ projectId: project.id, teamId: electrical.id, uid: "owner-a", name: "Electrical Crew" }, deps)).name === "Electrical Crew", "Owner can rename Team");
  await expectReject(() => renameTeamForOwner({ projectId: otherProject.id, teamId: electrical.id, uid: "owner-b", name: "Wrong project" }, deps), "Team cannot be changed through another project");

  const first = await addTeamMemberForOwner({ projectId: project.id, teamId: electrical.id, projectMemberId: "pm-a", uid: "owner-a" }, deps);
  assert(first.created, "Owner adds a same-project Project Member");
  const duplicate = await addTeamMemberForOwner({ projectId: project.id, teamId: electrical.id, projectMemberId: "pm-a", uid: "owner-a" }, deps);
  assert(!duplicate.created && memberships.length === 1, "Duplicate membership is idempotent");
  await expectReject(() => addTeamMemberForOwner({ projectId: project.id, teamId: electrical.id, projectMemberId: "pm-other", uid: "owner-a" }, deps), "Cross-project Project Member is rejected");
  await addTeamMemberForOwner({ projectId: project.id, teamId: plumbing.id, projectMemberId: "pm-a", uid: "owner-a" }, deps);
  assert(memberships.filter((item) => item.projectMemberId === "pm-a" && item.status === "active").length === 2, "A Project Member can belong to multiple Teams");

  assert((await listTeamsForReader(project.id, "field-a", deps)).length === 2, "A member can read multiple Team memberships");
  await addTeamMemberForOwner({ projectId: project.id, teamId: plumbing.id, projectMemberId: "pm-b", uid: "owner-a" }, deps);
  assert((await listTeamsForReader(project.id, "field-b", deps)).length === 1, "Assigned-scope reader sees their Team only");
  assert((await listTeamsForReader(project.id, "field-b", deps)).every((team) => team.id === plumbing.id), "Assigned-scope result is constrained to membership");
  assert((await listTeamMembersForReader(project.id, plumbing.id, "field-b", deps)).length === 2, "Member can read their Team membership list");
  await expectReject(() => listTeamMembersForReader(project.id, electrical.id, "field-b", deps), "Member cannot inspect another Team membership list");

  await removeTeamMemberForOwner({ projectId: project.id, teamId: electrical.id, projectMemberId: "pm-a", uid: "owner-a" }, deps);
  assert(projectMembers.some((item) => item.id === "pm-a"), "Removing Team membership preserves Project Member");
  assert(unrelatedWorkPackageAssignments.length === 1, "Membership removal does not touch WorkPackageAssignment");
  activeAssignedTeams.add(plumbing.id);
  await expectReject(() => archiveTeamForOwner({ projectId: project.id, teamId: plumbing.id, uid: "owner-a" }, deps), "Team with active Work Package responsibility cannot archive");
  assert(teams.find((item) => item.id === plumbing.id)?.status === "active", "Blocked archive leaves Team active");
  assert(memberships.filter((item) => item.teamId === plumbing.id && item.status === "active").length === 2, "Blocked archive preserves active memberships");
  activeAssignedTeams.delete(plumbing.id);
  const archived = await archiveTeamForOwner({ projectId: project.id, teamId: plumbing.id, uid: "owner-a" }, deps);
  assert(archived.status === "archived", "Owner archives Team");
  assert(memberships.filter((item) => item.teamId === plumbing.id && item.status === "active").length === 0, "Archiving deactivates Team memberships");
  assert(projectMembers.length === 3 && unrelatedWorkPackageAssignments.length === 1, "Team archive preserves Project Members and WorkPackageAssignments");
  await expectReject(() => addTeamMemberForOwner({ projectId: project.id, teamId: plumbing.id, projectMemberId: "pm-b", uid: "owner-a" }, deps), "Archived Team rejects new memberships");
  assert(memberships.every((item) => item.status === "active" || item.status === "removed"), "Membership lifecycle remains explicit");
  assert(teams.length === 2 && memberships.length === 3, "In-memory operations create no duplicate Team/member records");
  assert(teams.every((team) => team.id !== "__unassigned__"), "No synthetic Team is created");
  assert(teams.some((team) => team.status === "archived"), "Archived Team remains addressable as an archived record");
  assert(teams.find((team) => team.id === electrical.id)?.name === "Electrical Crew", "Rename retains Team identity");
  assert(memberships.some((item) => item.status === "removed"), "Removal uses the membership lifecycle");
  assert(teams.every((team) => team.projectId === project.id), "Team records retain project scope");
  assert(new Set(memberships.map((item) => item.id)).size === memberships.length, "Membership IDs remain unique");
  assert(first.membership.projectMemberId === "pm-a", "Membership links canonical ProjectMember ID");
  assert(!(first.membership as unknown as Record<string, unknown>).userId, "Membership does not duplicate auth UID");
  assert(!(first.membership as unknown as Record<string, unknown>).email, "Membership does not duplicate profile fields");
  assert(deps.assertOwned !== undefined, "Owner authorization is injected for isolated testing");
  assert(deps.assertReadable !== undefined, "Reader authorization is injected for isolated testing");
  assert(TeamServiceError.name === "TeamServiceError", "Service error type is available to routes");

  console.log("PASS team service in-memory tests");
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Team service tests failed");
  process.exitCode = 1;
});
