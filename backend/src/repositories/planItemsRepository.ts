import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { PlanItem } from "../domain/planItem.js";

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

  return snapshot.data() as PlanItem;
}

export async function getPlanItemsForProject(
  projectId: string,
): Promise<PlanItem[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.planItems)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as PlanItem);
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
