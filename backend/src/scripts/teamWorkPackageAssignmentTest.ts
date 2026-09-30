/** In-memory service tests; no Firestore writes. */
import type { Project } from "../domain/project.js";
import type { Team } from "../domain/team.js";
import type { TeamMembership } from "../domain/teamMembership.js";
import type { TeamWorkPackageAssignment } from "../domain/teamWorkPackageAssignment.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";
import { archiveTeamForOwner, type TeamServiceDependencies } from "../services/teamService.js";
import { assignTeamToWorkPackage, listTeamAssignmentsForReader, removeTeamAssignment, TeamWorkPackageAssignmentError, type TeamWorkPackageAssignmentDependencies } from "../services/teamWorkPackageAssignmentService.js";

const project: Project = { id: "p", localProjectId: "lp", ownerUid: "owner", name: "P", location: "", status: "active", progress: 0, openDeltas: 0, assignedTasks: 0 };
const projectB: Project = { ...project, id: "q", ownerUid: "other" };
const teamA: Team = { id: "ta", projectId: "p", name: "Electrical", status: "active", createdBy: "owner", createdAt: "now", updatedAt: "now" };
const teamB: Team = { ...teamA, id: "tb", name: "Mechanical" };
const foreignTeam: Team = { ...teamA, id: "tx", projectId: "q" };
const packageA: WorkPackage = { id: "wa", projectId: "p", name: "Package A", status: "ready", planItemIds: ["i1", "i2"], createdAt: "now", updatedAt: "now" };
const packageB: WorkPackage = { ...packageA, id: "wb", name: "Package B", planItemIds: ["i2", "i3"] };
const foreignPackage: WorkPackage = { ...packageA, id: "wx", projectId: "q" };
const projectMember: ProjectMember = { id: "pm", projectId: "p", userId: "user", role: "field_member", status: "active", invitedBy: "owner", createdAt: "now", updatedAt: "now" };
const members = [projectMember];
const memberAssignments = [{ id: "member-assignment", projectId: "p", workPackageId: "wa", projectMemberId: "pm" }];
const memberships: TeamMembership[] = [{ id: "membership", projectId: "p", teamId: "ta", projectMemberId: "pm", status: "active", createdAt: "now", updatedAt: "now" }];
const teams: Team[] = [teamA, teamB, foreignTeam];
const assignments: TeamWorkPackageAssignment[] = [];
const active = (item: TeamWorkPackageAssignment) => item.status !== "cancelled";
const readContext: ProjectAccessContext = { project, currentUserId: "owner", isOwner: true, membership: null, role: "legacy_owner", accessMode: "full", assignedWorkPackageIds: [], assignedPlanItemIds: [] };
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };

const deps: TeamWorkPackageAssignmentDependencies = {
  async assertOwned(id, uid) { if (uid !== "owner" || id !== "p") throw new Error("owner only"); return project; },
  async assertReadable() { return readContext; },
  async getTeam(id) { return teams.find((item) => item.id === id); },
  async getWorkPackage(id) { return [packageA, packageB, foreignPackage].find((item) => item.id === id); },
  async create(input) {
    const duplicate = assignments.find((item) => item.projectId === input.projectId && item.workPackageId === input.workPackageId && item.teamId === input.teamId && active(item));
    if (duplicate) return { created: false, reason: "duplicate", assignment: duplicate };
    const now = new Date().toISOString(); const assignment: TeamWorkPackageAssignment = { id: `tpa-${assignments.length + 1}`, ...input, status: "assigned", createdAt: now, updatedAt: now };
    assignments.push(assignment); return { created: true, assignment };
  },
  async list(id) { return assignments.filter((item) => item.projectId === id); },
  async remove(projectId, workPackageId, teamId) { const item = assignments.find((entry) => entry.projectId === projectId && entry.workPackageId === workPackageId && entry.teamId === teamId && active(entry)); if (!item) return undefined; item.status = "cancelled"; item.updatedAt = new Date().toISOString(); return item; },
  async teamHasMembership(projectId, teamId, projectMemberId) { return memberships.some((item) => item.projectId === projectId && item.teamId === teamId && item.projectMemberId === projectMemberId && item.status === "active"); },
  async hasActiveForTeam(projectId, teamId) { return assignments.some((item) => item.projectId === projectId && item.teamId === teamId && active(item)); },
};

async function run() {
  let denied = false;
  try { await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "ta", uid: "reader" }, deps); } catch { denied = true; }
  assert(denied, "unauthorized writer is denied");
  const first = await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "ta", uid: "owner" }, deps);
  assert(first.teamId === "ta", "owner can assign Team");
  denied = false;
  try { await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "ta", uid: "owner" }, deps); } catch (error) { denied = error instanceof TeamWorkPackageAssignmentError && error.statusCode === 409; }
  assert(denied, "duplicate active Team assignment rejected");
  await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wb", teamId: "ta", uid: "owner" }, deps);
  await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "tb", uid: "owner" }, deps);
  assert(assignments.filter((item) => item.teamId === "ta" && active(item)).length === 2, "one Team may own multiple Work Packages");
  assert(assignments.filter((item) => item.workPackageId === "wa" && active(item)).length === 2, "one Work Package may have multiple Teams");
  denied = false;
  try { await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "tx", uid: "owner" }, deps); } catch { denied = true; }
  assert(denied, "cross-project Team rejected");
  denied = false;
  try { await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wx", teamId: "ta", uid: "owner" }, deps); } catch { denied = true; }
  assert(denied, "cross-project Work Package rejected");
  teams.push({ ...teamA, id: "archived", status: "archived" });
  denied = false;
  try { await assignTeamToWorkPackage({ projectId: "p", workPackageId: "wa", teamId: "archived", uid: "owner" }, deps); } catch { denied = true; }
  assert(denied, "archived Team rejected");

  memberships.push({ id: "membership-2", projectId: "p", teamId: "ta", projectMemberId: "pm", status: "removed", createdAt: "now", updatedAt: "now" });
  assert(assignments.some((item) => item.teamId === "ta" && active(item)), "membership changes do not change Team responsibility");
  assert(memberAssignments.length === 1 && members.length === 1, "Team assignment does not create member assignment or duplicate Project Member");
  assert((await listTeamAssignmentsForReader("p", "owner", deps)).length === 3, "authorized reader lists all Team assignments");

  const teamServiceDeps = {
    async assertOwned(id: string, uid: string) { if (id !== "p" || uid !== "owner") throw new Error("owner only"); return project; },
    async getTeam(id: string) { return teams.find((item) => item.id === id); },
    async archiveTeam(input: { teamId: string; updatedAt: string }) { const item = teams.find((value) => value.id === input.teamId); if (!item) return undefined; const archived = { ...item, status: "archived" as const, updatedAt: input.updatedAt }; teams[teams.indexOf(item)] = archived; return archived; },
    async hasActiveWorkPackageAssignments(projectId: string, teamId: string) { return deps.hasActiveForTeam(projectId, teamId); },
    async deactivateMemberships(input: { teamId: string }) { for (let i = 0; i < memberships.length; i++) if (memberships[i]?.teamId === input.teamId && memberships[i]?.status === "active") memberships[i] = { ...memberships[i]!, status: "removed" }; },
  } as unknown as TeamServiceDependencies;
  denied = false;
  try { await archiveTeamForOwner({ projectId: "p", teamId: "ta", uid: "owner" }, teamServiceDeps); } catch (error) { denied = error instanceof Error && error.message.includes("Remove this Team"); }
  assert(denied && teams.find((item) => item.id === "ta")?.status === "active", "archive with active Team assignments is blocked and Team stays active");
  assert(memberships.filter((item) => item.teamId === "ta" && item.status === "active").length === 1, "blocked archive preserves active Team memberships");
  await removeTeamAssignment({ projectId: "p", workPackageId: "wa", teamId: "ta", uid: "owner" }, deps);
  await removeTeamAssignment({ projectId: "p", workPackageId: "wb", teamId: "ta", uid: "owner" }, deps);
  const archived = await archiveTeamForOwner({ projectId: "p", teamId: "ta", uid: "owner" }, teamServiceDeps);
  assert(archived.status === "archived", "Team can archive after responsibility removed");
  assert(memberAssignments.length === 1 && members.length === 1, "Team assignment removal/archive preserves individual assignment and Project Member");
  assert(assignments.filter((item) => item.teamId === "ta").every((item) => item.status === "cancelled"), "removal marks Team responsibility cancelled");
  console.log("PASS Team Work Package assignment in-memory tests");
}
void run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Team assignment tests failed"); process.exitCode = 1; });
