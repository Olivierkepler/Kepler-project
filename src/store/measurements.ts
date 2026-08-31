import type { Measurement } from "../types/measurement";
import {
  resolveScopedOperationalArray,
  scopedOperationalKey,
} from "./localDataScope";
import { writeJsonArray } from "./storage";

function copyMeasurement(measurement: Measurement): Measurement {
  return { ...measurement };
}

function isMeasurement(value: unknown): value is Measurement {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.projectId === "string" &&
    typeof record.planItemId === "string" &&
    record.type === "length" &&
    typeof record.label === "string" &&
    typeof record.value === "number" &&
    typeof record.unit === "string" &&
    typeof record.createdAt === "string"
  );
}

async function loadMeasurements(ownerUid: string): Promise<Measurement[]> {
  const items = await resolveScopedOperationalArray(
    "measurements",
    ownerUid,
    () => [],
  );

  return items.filter(isMeasurement).map(copyMeasurement);
}

export async function getMeasurements(
  ownerUid: string,
): Promise<Measurement[]> {
  return loadMeasurements(ownerUid);
}

export async function getMeasurementsForProject(
  ownerUid: string,
  projectId: string,
): Promise<Measurement[]> {
  const measurements = await loadMeasurements(ownerUid);

  return measurements
    .filter((measurement) => measurement.projectId === projectId)
    .map(copyMeasurement);
}

export async function getMeasurementById(
  ownerUid: string,
  measurementId: string,
): Promise<Measurement | undefined> {
  const measurements = await loadMeasurements(ownerUid);
  const found = measurements.find(
    (measurement) => measurement.id === measurementId,
  );

  return found ? copyMeasurement(found) : undefined;
}

export async function addMeasurement(
  ownerUid: string,
  measurement: Measurement,
): Promise<void> {
  const measurements = await loadMeasurements(ownerUid);

  if (measurements.some((item) => item.id === measurement.id)) {
    return;
  }

  await writeJsonArray(scopedOperationalKey("measurements", ownerUid), [
    ...measurements,
    copyMeasurement(measurement),
  ]);
}
