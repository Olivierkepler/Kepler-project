import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { WorkPackage } from "../domain/workPackage.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getWorkPackageById(
  workPackageId: string,
): Promise<WorkPackage | undefined> {
  requireId(workPackageId, "workPackageId");

  const snapshot = await db
    .collection(COLLECTIONS.workPackages)
    .doc(workPackageId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as WorkPackage;
}

export async function listWorkPackagesForProject(
  projectId: string,
): Promise<WorkPackage[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as WorkPackage);
}
