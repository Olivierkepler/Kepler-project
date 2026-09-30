import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Team } from "../domain/team.js";
import { normalizeTeamDocument } from "../validation/team.js";
import { normalizeTeamWorkPackageAssignment } from "../validation/teamWorkPackageAssignment.js";
import { isBlockingAssignmentStatus } from "../validation/workPackageAssignment.js";

function requireId(id: string, label: string): string {
  const value = id.trim();
  if (!value) throw new Error(`${label} is required`);
  return value;
}

export async function getTeamById(teamId: string): Promise<Team | undefined> {
  const id = requireId(teamId, "teamId");
  const snapshot = await db.collection(COLLECTIONS.teams).doc(id).get();
  return snapshot.exists ? normalizeTeamDocument(snapshot.data()) : undefined;
}

export async function listTeamsForProject(projectId: string): Promise<Team[]> {
  const id = requireId(projectId, "projectId");
  const snapshot = await db.collection(COLLECTIONS.teams)
    .where("projectId", "==", id).get();
  return snapshot.docs
    .map((doc) => normalizeTeamDocument(doc.data()))
    .filter((team): team is Team => team !== undefined && team.status === "active")
    .sort((a, b) => {
      const nameOrder = a.name.localeCompare(b.name);
      return nameOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
}

export async function createTeam(team: Team): Promise<void> {
  const normalized = normalizeTeamDocument(team);
  if (!normalized) throw new Error("Invalid Team.");
  await db.collection(COLLECTIONS.teams).doc(normalized.id).create(normalized);
}

export async function updateTeamName(input: {
  projectId: string;
  teamId: string;
  name: string;
  updatedAt: string;
}): Promise<Team | undefined> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const reference = db.collection(COLLECTIONS.teams).doc(teamId);
  let result: Team | undefined;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists ? normalizeTeamDocument(snapshot.data()) : undefined;
    if (!existing || existing.projectId !== projectId || existing.status !== "active") return;
    result = { ...existing, name: input.name, updatedAt: input.updatedAt };
    transaction.update(reference, { name: input.name, updatedAt: input.updatedAt });
  });
  return result;
}

/** Soft deletion blocks new membership writes before memberships are deactivated. */
export async function archiveTeam(input: {
  projectId: string;
  teamId: string;
  updatedAt: string;
}): Promise<Team | undefined> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const reference = db.collection(COLLECTIONS.teams).doc(teamId);
  let result: Team | undefined;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists ? normalizeTeamDocument(snapshot.data()) : undefined;
    if (!existing || existing.projectId !== projectId) return;
    const assignments = await transaction.get(
      db.collection(COLLECTIONS.teamWorkPackageAssignments).where("projectId", "==", projectId),
    );
    if (assignments.docs.some((doc) => {
      const assignment = normalizeTeamWorkPackageAssignment(doc.data());
      return assignment?.teamId === teamId && isBlockingAssignmentStatus(assignment.status);
    })) return;
    if (existing.status === "archived") {
      result = existing;
      return;
    }
    result = { ...existing, status: "archived", updatedAt: input.updatedAt };
    transaction.update(reference, { status: "archived", updatedAt: input.updatedAt });
  });
  return result;
}
