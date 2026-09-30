import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  compareProjectProgressBaselinePoints,
  compareProjectProgressSnapshots,
  createProjectProgressBaselinePointId,
  type ProjectProgressBaselinePoint,
  type ProjectProgressSnapshot,
  type ProjectProgressSnapshotSource,
} from "../domain/projectProgress.js";

function requireProjectId(projectId: string): void {
  if (!projectId.trim() || projectId.includes("/")) {
    throw new Error("A valid projectId is required");
  }
}

export async function listProjectProgressBaseline(
  projectId: string,
): Promise<ProjectProgressBaselinePoint[]> {
  requireProjectId(projectId);
  const snapshot = await db
    .collection(COLLECTIONS.projectProgressBaselines)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as ProjectProgressBaselinePoint)
    .sort(compareProjectProgressBaselinePoints);
}

export async function upsertProjectProgressBaselinePoint(input: {
  projectId: string;
  effectiveDate: string;
  plannedPercent: number;
}): Promise<ProjectProgressBaselinePoint> {
  requireProjectId(input.projectId);
  const id = createProjectProgressBaselinePointId(
    input.projectId,
    input.effectiveDate,
  );
  const reference = db.collection(COLLECTIONS.projectProgressBaselines).doc(id);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(reference);
    const existing = existingSnapshot.exists
      ? (existingSnapshot.data() as ProjectProgressBaselinePoint)
      : undefined;
    const point: ProjectProgressBaselinePoint = {
      id,
      projectId: input.projectId,
      effectiveDate: input.effectiveDate,
      plannedPercent: input.plannedPercent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    transaction.set(reference, point);
    return point;
  });
}

export async function listProjectProgressSnapshots(
  projectId: string,
): Promise<ProjectProgressSnapshot[]> {
  requireProjectId(projectId);
  const snapshot = await db
    .collection(COLLECTIONS.projectProgressSnapshots)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as ProjectProgressSnapshot)
    .sort(compareProjectProgressSnapshots);
}

export async function appendProjectProgressSnapshot(input: {
  projectId: string;
  capturedAt: string;
  actualPercent: number;
  source: ProjectProgressSnapshotSource;
}): Promise<ProjectProgressSnapshot> {
  requireProjectId(input.projectId);
  const reference = db.collection(COLLECTIONS.projectProgressSnapshots).doc();
  const snapshot: ProjectProgressSnapshot = {
    id: reference.id,
    projectId: input.projectId,
    capturedAt: input.capturedAt,
    actualPercent: input.actualPercent,
    source: input.source,
    createdAt: new Date().toISOString(),
  };

  await reference.create(snapshot);
  return snapshot;
}
