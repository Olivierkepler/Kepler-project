import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getWorkPackageAssignmentById(
  assignmentId: string,
): Promise<WorkPackageAssignment | undefined> {
  requireId(assignmentId, "assignmentId");

  const snapshot = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignmentId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as WorkPackageAssignment;
}

export async function listWorkPackageAssignmentsForProject(
  projectId: string,
): Promise<WorkPackageAssignment[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as WorkPackageAssignment);
}
