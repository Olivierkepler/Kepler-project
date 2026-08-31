import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { ProjectMember } from "../domain/projectMember.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getProjectMemberById(
  memberId: string,
): Promise<ProjectMember | undefined> {
  requireId(memberId, "memberId");

  const snapshot = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(memberId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as ProjectMember;
}

export async function listProjectMembersForProject(
  projectId: string,
): Promise<ProjectMember[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.projectMembers)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as ProjectMember);
}
