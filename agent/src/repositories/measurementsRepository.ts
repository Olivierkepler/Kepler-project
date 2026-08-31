import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Measurement } from "../domain/measurement.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export async function getMeasurementById(
  measurementId: string,
): Promise<Measurement | undefined> {
  requireId(measurementId, "measurementId");

  const snapshot = await db
    .collection(COLLECTIONS.measurements)
    .doc(measurementId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return snapshot.data() as Measurement;
}
