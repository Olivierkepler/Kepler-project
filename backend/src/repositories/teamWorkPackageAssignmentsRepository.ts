import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { TeamWorkPackageAssignment } from "../domain/teamWorkPackageAssignment.js";
import { createTeamWorkPackageAssignmentId } from "../domain/teamWorkPackageAssignmentId.js";
import { normalizeTeamWorkPackageAssignment } from "../validation/teamWorkPackageAssignment.js";
import { normalizeTeamDocument } from "../validation/team.js";
import { normalizeWorkPackageDocument } from "../validation/workPackage.js";
import { isBlockingAssignmentStatus } from "../validation/workPackageAssignment.js";

const collection = () => db.collection(COLLECTIONS.teamWorkPackageAssignments);
const requireId = (value: string, label: string) => { if (!value.trim()) throw new Error(`${label} is required`); return value.trim(); };

export async function listTeamWorkPackageAssignmentsForProject(projectId: string): Promise<TeamWorkPackageAssignment[]> {
  const snapshot = await collection().where("projectId", "==", requireId(projectId, "projectId")).get();
  return snapshot.docs.map((doc) => normalizeTeamWorkPackageAssignment(doc.data())).filter((item): item is TeamWorkPackageAssignment => !!item).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export async function listTeamWorkPackageAssignmentsForTeam(projectId: string, teamId: string): Promise<TeamWorkPackageAssignment[]> {
  return (await listTeamWorkPackageAssignmentsForProject(projectId)).filter((item) => item.teamId === teamId);
}

export async function listTeamWorkPackageAssignmentsForWorkPackage(projectId: string, workPackageId: string): Promise<TeamWorkPackageAssignment[]> {
  return (await listTeamWorkPackageAssignmentsForProject(projectId)).filter((item) => item.workPackageId === workPackageId);
}

export type CreateTeamAssignmentResult = { created: true; assignment: TeamWorkPackageAssignment } | { created: false; reason: "work_package_not_found" | "work_package_wrong_project" | "team_not_found" | "team_wrong_project" | "team_archived" | "duplicate"; assignment?: TeamWorkPackageAssignment };

export async function createTeamWorkPackageAssignment(input: { projectId: string; workPackageId: string; teamId: string }, nowIso = new Date().toISOString()): Promise<CreateTeamAssignmentResult> {
  const projectId = requireId(input.projectId, "projectId");
  const workPackageId = requireId(input.workPackageId, "workPackageId");
  const teamId = requireId(input.teamId, "teamId");
  const candidate: TeamWorkPackageAssignment = { id: createTeamWorkPackageAssignmentId(), projectId, workPackageId, teamId, status: "assigned", createdAt: nowIso, updatedAt: nowIso };
  return db.runTransaction(async (tx) => {
    const wpRef = db.collection(COLLECTIONS.workPackages).doc(workPackageId);
    const teamRef = db.collection(COLLECTIONS.teams).doc(teamId);
    const [wpSnap, teamSnap, assignmentsSnap] = await Promise.all([
      tx.get(wpRef), tx.get(teamRef), tx.get(collection().where("projectId", "==", projectId)),
    ]);
    if (!wpSnap.exists) return { created: false as const, reason: "work_package_not_found" as const };
    const wp = normalizeWorkPackageDocument(wpSnap.data());
    if (!wp) return { created: false as const, reason: "work_package_not_found" as const };
    if (wp.projectId !== projectId) return { created: false as const, reason: "work_package_wrong_project" as const };
    if (!teamSnap.exists) return { created: false as const, reason: "team_not_found" as const };
    const team = normalizeTeamDocument(teamSnap.data());
    if (!team) return { created: false as const, reason: "team_not_found" as const };
    if (team.projectId !== projectId) return { created: false as const, reason: "team_wrong_project" as const };
    if (team.status !== "active") return { created: false as const, reason: "team_archived" as const };
    for (const doc of assignmentsSnap.docs) {
      const existing = normalizeTeamWorkPackageAssignment(doc.data());
      if (existing && existing.teamId === teamId && existing.workPackageId === workPackageId && isBlockingAssignmentStatus(existing.status)) return { created: false as const, reason: "duplicate" as const, assignment: existing };
    }
    tx.create(collection().doc(candidate.id), candidate);
    return { created: true as const, assignment: candidate };
  });
}

export async function removeTeamWorkPackageAssignment(projectId: string, workPackageId: string, teamId: string, nowIso = new Date().toISOString()): Promise<TeamWorkPackageAssignment | undefined> {
  const snapshot = await collection().where("projectId", "==", requireId(projectId, "projectId")).get();
  const records = snapshot.docs.map((doc) => ({ ref: doc.ref, item: normalizeTeamWorkPackageAssignment(doc.data()) })).filter((row) => row.item && row.item.workPackageId === workPackageId && row.item.teamId === teamId && isBlockingAssignmentStatus(row.item.status));
  const row = records[0];
  if (!row?.item) return undefined;
  const next = { ...row.item, status: "cancelled" as const, updatedAt: nowIso };
  await row.ref.update({ status: next.status, updatedAt: nowIso });
  return next;
}

export async function hasActiveTeamWorkPackageAssignments(projectId: string, teamId: string): Promise<boolean> {
  return (await listTeamWorkPackageAssignmentsForTeam(projectId, teamId)).some((item) => isBlockingAssignmentStatus(item.status));
}
