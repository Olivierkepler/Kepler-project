import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Evidence, EvidenceType } from "../domain/evidence.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return value === "photo" || value === "note";
}

function normalizeNullableId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEvidenceDocument(
  data: unknown,
): Evidence | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.ownerUid !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.localEvidenceId !== "string" ||
    !isEvidenceType(record.type) ||
    typeof record.note !== "string" ||
    (record.objectPath !== null &&
      record.objectPath !== undefined &&
      typeof record.objectPath !== "string") ||
    (record.contentType !== null &&
      record.contentType !== undefined &&
      typeof record.contentType !== "string") ||
    typeof record.createdAt !== "string"
  ) {
    return undefined;
  }

  const localMeasurementId = normalizeNullableId(record.localMeasurementId);
  const localDeltaId = normalizeNullableId(record.localDeltaId);

  if (localMeasurementId !== null && localDeltaId !== null) {
    return undefined;
  }

  return {
    id: record.id,
    ownerUid: record.ownerUid,
    projectId: record.projectId,
    localEvidenceId: record.localEvidenceId,
    type: record.type,
    note: record.note,
    objectPath:
      record.objectPath === undefined || record.objectPath === null
        ? null
        : record.objectPath,
    contentType:
      record.contentType === undefined || record.contentType === null
        ? null
        : record.contentType,
    createdAt: record.createdAt,
    localMeasurementId,
    localDeltaId,
  };
}

export async function getEvidenceForProject(
  projectId: string,
): Promise<Evidence[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.evidence)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => normalizeEvidenceDocument(doc.data()))
    .filter((item): item is Evidence => item !== undefined);
}

export async function getEvidenceById(
  evidenceId: string,
): Promise<Evidence | undefined> {
  requireId(evidenceId, "evidenceId");

  const snapshot = await db.collection(COLLECTIONS.evidence).doc(evidenceId).get();
  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeEvidenceDocument(snapshot.data());
}
