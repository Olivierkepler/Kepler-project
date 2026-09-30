import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { PlanItem } from "../domain/planItem.js";
import { parsePlanItemDocument } from "../validation/planItem.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getPlanItemById(
  planItemId: string,
): Promise<PlanItem | undefined> {
  requireId(planItemId, "planItemId");

  const snapshot = await db
    .collection(COLLECTIONS.planItems)
    .doc(planItemId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return parsePlanItemDocument(snapshot.data()) ?? undefined;
}

export async function getPlanItemsForProject(
  projectId: string,
): Promise<PlanItem[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.planItems)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => parsePlanItemDocument(doc.data()))
    .filter((item): item is PlanItem => item !== null);
}

export type PlanItemImagePathUpdate = {
  planItem: PlanItem;
  previousImageStoragePath: string | null;
};

/** Atomically changes only the private image path for the matching project item. */
export async function updatePlanItemImageStoragePath(input: {
  projectId: string;
  planItemId: string;
  imageStoragePath: string | null;
}): Promise<PlanItemImagePathUpdate | undefined> {
  requireId(input.projectId, "projectId");
  requireId(input.planItemId, "planItemId");

  const reference = db
    .collection(COLLECTIONS.planItems)
    .doc(input.planItemId);
  let result: PlanItemImagePathUpdate | undefined;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      return;
    }

    const existing = parsePlanItemDocument(snapshot.data());
    if (!existing || existing.projectId !== input.projectId) {
      return;
    }

    const previousImageStoragePath =
      existing.imageStoragePath?.trim() || null;
    transaction.update(reference, {
      imageStoragePath: input.imageStoragePath,
    });

    result = {
      planItem: {
        ...existing,
        imageStoragePath: input.imageStoragePath,
      },
      previousImageStoragePath,
    };
  });

  return result;
}

/**
 * Writes a PlanItem using document ID = planItem.id.
 * Overwrites the full document (merge: false).
 */
export async function setPlanItem(planItem: PlanItem): Promise<void> {
  requireId(planItem.id, "planItem.id");
  requireId(planItem.localPlanItemId, "planItem.localPlanItemId");
  requireId(planItem.projectId, "planItem.projectId");

  await db
    .collection(COLLECTIONS.planItems)
    .doc(planItem.id)
    .set(planItem, { merge: false });
}
