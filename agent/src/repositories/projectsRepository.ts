import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Project } from "../domain/project.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getProjectById(
  projectId: string,
): Promise<Project | undefined> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.projects)
    .doc(projectId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as Project;
}
