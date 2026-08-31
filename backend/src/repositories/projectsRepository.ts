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

export async function getProjects(): Promise<Project[]> {
  const snapshot = await db.collection(COLLECTIONS.projects).get();

  return snapshot.docs.map((doc) => doc.data() as Project);
}

export async function getProjectsForOwner(
  ownerUid: string,
): Promise<Project[]> {
  requireId(ownerUid, "ownerUid");

  const snapshot = await db
    .collection(COLLECTIONS.projects)
    .where("ownerUid", "==", ownerUid)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Project);
}

/**
 * Batch-fetch projects by remote document IDs.
 * Missing documents are omitted (caller handles orphans).
 */
export async function getProjectsByIds(
  projectIds: readonly string[],
): Promise<Project[]> {
  const uniqueIds = [
    ...new Set(
      projectIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (uniqueIds.length === 0) {
    return [];
  }

  const projects: Project[] = [];
  const chunkSize = 100;

  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const refs = chunk.map((id) =>
      db.collection(COLLECTIONS.projects).doc(id),
    );
    const snapshots = await db.getAll(...refs);

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }

      projects.push(snapshot.data() as Project);
    }
  }

  return projects;
}

/**
 * Writes a Project using document ID = project.id.
 * Overwrites the full document (merge: false).
 */
export async function setProject(project: Project): Promise<void> {
  requireId(project.id, "project.id");
  requireId(project.ownerUid, "project.ownerUid");
  requireId(project.localProjectId, "project.localProjectId");

  await db
    .collection(COLLECTIONS.projects)
    .doc(project.id)
    .set(project, { merge: false });
}
