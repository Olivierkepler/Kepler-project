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
