import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { WorkPackage } from "../domain/workPackage.js";
import { normalizeWorkPackageDocument } from "../validation/workPackage.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function sortWorkPackages(items: WorkPackage[]): WorkPackage[] {
  return [...items].sort((a, b) => {
    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });
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

  return normalizeWorkPackageDocument(snapshot.data());
}

/**
 * Batch-fetch WorkPackages by document IDs.
 * Missing / malformed documents are omitted.
 */
export async function getWorkPackagesByIds(
  workPackageIds: readonly string[],
): Promise<WorkPackage[]> {
  const uniqueIds = [
    ...new Set(
      workPackageIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (uniqueIds.length === 0) {
    return [];
  }

  const items: WorkPackage[] = [];
  const chunkSize = 100;

  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const refs = chunk.map((id) =>
      db.collection(COLLECTIONS.workPackages).doc(id),
    );
    const snapshots = await db.getAll(...refs);

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }

      const normalized = normalizeWorkPackageDocument(snapshot.data());
      if (normalized) {
        items.push(normalized);
      }
    }
  }

  return items;
}

export async function listWorkPackagesForProject(
  projectId: string,
): Promise<WorkPackage[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", projectId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeWorkPackageDocument(doc.data()))
    .filter((item): item is WorkPackage => item !== undefined);

  return sortWorkPackages(items);
}

/**
 * Writes a WorkPackage using document ID = workPackage.id.
 * Overwrites the full document (merge: false).
 */
export async function setWorkPackage(workPackage: WorkPackage): Promise<void> {
  const normalized = normalizeWorkPackageDocument(workPackage);

  if (!normalized) {
    throw new Error("Invalid work package.");
  }

  await db
    .collection(COLLECTIONS.workPackages)
    .doc(normalized.id)
    .set(normalized, { merge: false });
}

export type WorkPackageImagePathUpdate = {
  workPackage: WorkPackage;
  previousImageStoragePath: string | null;
};

/** Atomically changes only the private image path for the matching project package. */
export async function updateWorkPackageImageStoragePath(input: {
  projectId: string;
  workPackageId: string;
  imageStoragePath: string | null;
}): Promise<WorkPackageImagePathUpdate | undefined> {
  requireId(input.projectId, "projectId");
  requireId(input.workPackageId, "workPackageId");

  const reference = db.collection(COLLECTIONS.workPackages).doc(input.workPackageId);
  let result: WorkPackageImagePathUpdate | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;

    const existing = normalizeWorkPackageDocument(snapshot.data());
    if (!existing || existing.projectId !== input.projectId) return;

    const previousImageStoragePath = existing.imageStoragePath?.trim() || null;
    const updatedAt = new Date().toISOString();
    transaction.update(reference, {
      imageStoragePath: input.imageStoragePath,
      updatedAt,
    });
    result = {
      workPackage: { ...existing, imageStoragePath: input.imageStoragePath, updatedAt },
      previousImageStoragePath,
    };
  });

  return result;
}

/**
 * Deletes WorkPackage metadata by document ID.
 * Returns false when already absent.
 */
export async function deleteWorkPackageById(
  workPackageId: string,
): Promise<boolean> {
  requireId(workPackageId, "workPackageId");

  const ref = db.collection(COLLECTIONS.workPackages).doc(workPackageId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await ref.delete();
  return true;
}
