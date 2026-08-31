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

/**
 * Normalizes Firestore Evidence docs.
 * Pre–Phase-54 documents missing relationship fields → null.
 * Does not rewrite storage.
 */
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
    ...(typeof record.capturedByUid === "string" &&
    record.capturedByUid.trim().length > 0
      ? { capturedByUid: record.capturedByUid.trim() }
      : {}),
  };
}

export async function getEvidenceById(
  evidenceId: string,
): Promise<Evidence | undefined> {
  requireId(evidenceId, "evidenceId");

  const snapshot = await db
    .collection(COLLECTIONS.evidence)
    .doc(evidenceId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeEvidenceDocument(snapshot.data());
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

/**
 * Writes Evidence using document ID = evidence.id.
 * Overwrites the full document (merge: false).
 */
export async function setEvidence(evidence: Evidence): Promise<void> {
  requireId(evidence.id, "evidence.id");
  requireId(evidence.ownerUid, "evidence.ownerUid");
  requireId(evidence.projectId, "evidence.projectId");
  requireId(evidence.localEvidenceId, "evidence.localEvidenceId");

  if (
    evidence.localMeasurementId !== null &&
    evidence.localDeltaId !== null
  ) {
    throw new Error("Evidence cannot link to both Measurement and Delta");
  }

  await db
    .collection(COLLECTIONS.evidence)
    .doc(evidence.id)
    .set(evidence, { merge: false });
}

/**
 * Deletes Evidence metadata by document ID.
 * No-op if already absent.
 */
export async function deleteEvidenceById(evidenceId: string): Promise<boolean> {
  requireId(evidenceId, "evidenceId");

  const ref = db.collection(COLLECTIONS.evidence).doc(evidenceId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await ref.delete();
  return true;
}
