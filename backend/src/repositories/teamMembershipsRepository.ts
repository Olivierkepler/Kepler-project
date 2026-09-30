import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createTeamMembershipId } from "../domain/teamId.js";
import type { TeamMembership } from "../domain/teamMembership.js";
import { normalizeProjectMemberDocument } from "../validation/projectMember.js";
import {
  normalizeTeamDocument,
  normalizeTeamMembershipDocument,
} from "../validation/team.js";

function requireId(id: string, label: string): string {
  const value = id.trim();
  if (!value) throw new Error(`${label} is required`);
  return value;
}

export async function listTeamMembershipsForTeam(input: {
  projectId: string;
  teamId: string;
}): Promise<TeamMembership[]> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const snapshot = await db.collection(COLLECTIONS.teamMemberships)
    .where("teamId", "==", teamId).get();
  return snapshot.docs
    .map((doc) => normalizeTeamMembershipDocument(doc.data()))
    .filter((membership): membership is TeamMembership =>
      !!membership && membership.projectId === projectId && membership.status === "active")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function listTeamMembershipsForProjectMember(input: {
  projectId: string;
  projectMemberId: string;
}): Promise<TeamMembership[]> {
  const projectId = requireId(input.projectId, "projectId");
  const projectMemberId = requireId(input.projectMemberId, "projectMemberId");
  const snapshot = await db.collection(COLLECTIONS.teamMemberships)
    .where("projectMemberId", "==", projectMemberId).get();
  return snapshot.docs
    .map((doc) => normalizeTeamMembershipDocument(doc.data()))
    .filter((membership): membership is TeamMembership =>
      !!membership && membership.projectId === projectId && membership.status === "active");
}

export type CreateTeamMembershipResult =
  | { kind: "created" | "reactivated" | "existing"; membership: TeamMembership }
  | { kind: "team_not_found" | "member_not_found" | "wrong_project" | "team_archived" };

/** Relationship checks and duplicate handling happen transactionally. */
export async function createTeamMembership(input: {
  projectId: string;
  teamId: string;
  projectMemberId: string;
  nowIso?: string;
}): Promise<CreateTeamMembershipResult> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const projectMemberId = requireId(input.projectMemberId, "projectMemberId");
  const nowIso = input.nowIso ?? new Date().toISOString();
  const teamRef = db.collection(COLLECTIONS.teams).doc(teamId);
  const memberRef = db.collection(COLLECTIONS.projectMembers).doc(projectMemberId);
  const memberships = db.collection(COLLECTIONS.teamMemberships);
  const newId = createTeamMembershipId();
  const newRef = memberships.doc(newId);

  return db.runTransaction(async (transaction) => {
    const [teamSnapshot, memberSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(memberRef),
      transaction.get(memberships.where("teamId", "==", teamId)),
    ]);
    const team = teamSnapshot.exists ? normalizeTeamDocument(teamSnapshot.data()) : undefined;
    if (!team || team.id !== teamId) return { kind: "team_not_found" as const };
    if (team.projectId !== projectId) return { kind: "wrong_project" as const };
    if (team.status !== "active") return { kind: "team_archived" as const };
    const member = memberSnapshot.exists
      ? normalizeProjectMemberDocument(memberSnapshot.data())
      : undefined;
    if (!member || member.id !== projectMemberId || member.status !== "active") {
      return { kind: "member_not_found" as const };
    }
    if (member.projectId !== projectId) return { kind: "wrong_project" as const };

    for (const doc of membershipSnapshot.docs) {
      const existing = normalizeTeamMembershipDocument(doc.data());
      if (!existing || existing.projectMemberId !== projectMemberId || existing.projectId !== projectId) continue;
      if (existing.status === "active") return { kind: "existing" as const, membership: existing };
      const reactivated: TeamMembership = { ...existing, status: "active", updatedAt: nowIso };
      transaction.update(doc.ref, { status: "active", updatedAt: nowIso });
      return { kind: "reactivated" as const, membership: reactivated };
    }

    const membership: TeamMembership = {
      id: newId,
      projectId,
      teamId,
      projectMemberId,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    transaction.create(newRef, membership);
    return { kind: "created" as const, membership };
  });
}

export async function removeTeamMembership(input: {
  projectId: string;
  teamId: string;
  projectMemberId: string;
  updatedAt?: string;
}): Promise<TeamMembership | undefined> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const projectMemberId = requireId(input.projectMemberId, "projectMemberId");
  const snapshot = await db.collection(COLLECTIONS.teamMemberships)
    .where("teamId", "==", teamId).get();
  const found = snapshot.docs
    .map((doc) => ({ ref: doc.ref, item: normalizeTeamMembershipDocument(doc.data()) }))
    .find(({ item }) => item?.projectId === projectId && item.projectMemberId === projectMemberId && item.status === "active");
  if (!found?.item) return undefined;
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  await found.ref.update({ status: "removed", updatedAt });
  return { ...found.item, status: "removed", updatedAt };
}

/** Deactivates members in bounded batches; safe to retry after an archive. */
export async function deactivateTeamMembershipsForTeam(input: {
  projectId: string;
  teamId: string;
  updatedAt: string;
}): Promise<void> {
  const projectId = requireId(input.projectId, "projectId");
  const teamId = requireId(input.teamId, "teamId");
  const snapshot = await db.collection(COLLECTIONS.teamMemberships)
    .where("teamId", "==", teamId).get();
  const refs = snapshot.docs.filter((doc) => {
    const item = normalizeTeamMembershipDocument(doc.data());
    return item?.projectId === projectId && item.status === "active";
  }).map((doc) => doc.ref);
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(offset, offset + 400)) {
      batch.update(ref, { status: "removed", updatedAt: input.updatedAt });
    }
    await batch.commit();
  }
}
