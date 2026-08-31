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

export async function getMeasurementsForProject(
  projectId: string,
): Promise<Measurement[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.measurements)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as Measurement);
}

/**
 * Writes a Measurement using document ID = measurement.id.
 * Overwrites the full document (merge: false).
 */
export async function setMeasurement(
  measurement: Measurement,
): Promise<void> {
  requireId(measurement.id, "measurement.id");
  requireId(measurement.localMeasurementId, "measurement.localMeasurementId");
  requireId(measurement.projectId, "measurement.projectId");
  requireId(measurement.planItemId, "measurement.planItemId");

  await db
    .collection(COLLECTIONS.measurements)
    .doc(measurement.id)
    .set(measurement, { merge: false });
}
