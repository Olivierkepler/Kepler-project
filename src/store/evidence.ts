import type { Evidence, EvidenceType } from "../types/evidence";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

function scopedEvidenceKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for evidence storage.");
  }

  return `${STORAGE_KEYS.evidence}/${ownerUid}`;
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return value === "photo" || value === "note";
}

function normalizeNullableId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Accepts Phase 49–53 records missing relationship fields.
 * Missing → null. Rejects both links non-null.
 */
function normalizeEvidence(value: unknown): Evidence | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    record.id.trim().length === 0 ||
    typeof record.projectId !== "string" ||
    record.projectId.trim().length === 0 ||
    !isEvidenceType(record.type) ||
    typeof record.note !== "string" ||
    (record.photoUri !== null && typeof record.photoUri !== "string") ||
    typeof record.createdAt !== "string" ||
    record.createdAt.trim().length === 0
  ) {
    return null;
  }

  const measurementId = normalizeNullableId(record.measurementId);
  const deltaId = normalizeNullableId(record.deltaId);

  if (measurementId === undefined || deltaId === undefined) {
    return null;
  }

  if (measurementId !== null && deltaId !== null) {
    return null;
  }

  return {
    id: record.id,
    projectId: record.projectId,
    type: record.type,
    note: record.note,
    photoUri: record.photoUri,
    createdAt: record.createdAt,
    measurementId,
    deltaId,
  };
}

function copyEvidence(item: Evidence): Evidence {
  return { ...item };
}

function isValidEvidence(item: Evidence): boolean {
  const normalized = normalizeEvidence(item);

  if (!normalized) {
    return false;
  }

  if (normalized.measurementId !== null && normalized.deltaId !== null) {
    return false;
  }

  if (item.type === "note") {
    return item.note.trim().length > 0 && item.photoUri === null;
  }

  return (
    item.photoUri !== null &&
    item.photoUri.trim().length > 0
  );
}

async function loadEvidence(ownerUid: string): Promise<Evidence[]> {
  const items = await readJsonArray<unknown>(scopedEvidenceKey(ownerUid));
  return items
    .map(normalizeEvidence)
    .filter((item): item is Evidence => item !== null)
    .map(copyEvidence);
}

export async function getEvidence(ownerUid: string): Promise<Evidence[]> {
  return loadEvidence(ownerUid);
}

export async function getEvidenceForProject(
  ownerUid: string,
  projectId: string,
): Promise<Evidence[]> {
  const items = await loadEvidence(ownerUid);
  return items
    .filter((item) => item.projectId === projectId)
    .map(copyEvidence);
}

export async function getEvidenceForMeasurement(
  ownerUid: string,
  projectId: string,
  measurementId: string,
): Promise<Evidence[]> {
  const items = await loadEvidence(ownerUid);
  return items
    .filter(
      (item) =>
        item.projectId === projectId &&
        item.measurementId === measurementId &&
        item.deltaId === null,
    )
    .map(copyEvidence);
}

export async function getEvidenceForDelta(
  ownerUid: string,
  projectId: string,
  deltaId: string,
): Promise<Evidence[]> {
  const items = await loadEvidence(ownerUid);
  return items
    .filter(
      (item) =>
        item.projectId === projectId &&
        item.deltaId === deltaId &&
        item.measurementId === null,
    )
    .map(copyEvidence);
}

export async function getEvidenceById(
  ownerUid: string,
  evidenceId: string,
): Promise<Evidence | undefined> {
  const items = await loadEvidence(ownerUid);
  const found = items.find((item) => item.id === evidenceId);
  return found ? copyEvidence(found) : undefined;
}

/**
 * Appends Evidence for this owner namespace.
 * Does not overwrite an existing id.
 */
export async function addEvidence(
  ownerUid: string,
  evidence: Evidence,
): Promise<void> {
  if (!isValidEvidence(evidence)) {
    throw new Error("Invalid evidence.");
  }

  const items = await loadEvidence(ownerUid);

  if (items.some((item) => item.id === evidence.id)) {
    return;
  }

  await writeJsonArray(scopedEvidenceKey(ownerUid), [
    ...items,
    copyEvidence({
      ...evidence,
      measurementId: evidence.measurementId,
      deltaId: evidence.deltaId,
    }),
  ]);
}

/**
 * Narrow repair for photo Evidence whose local file is missing.
 * Does not overwrite note/type/createdAt/relationship fields.
 */
export async function repairEvidencePhotoUri(
  ownerUid: string,
  evidenceId: string,
  photoUri: string,
): Promise<Evidence | undefined> {
  if (!ownerUid.trim() || !evidenceId.trim() || !photoUri.trim()) {
    throw new Error("Invalid evidence photo repair.");
  }

  const items = await loadEvidence(ownerUid);
  const index = items.findIndex((item) => item.id === evidenceId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];

  if (current.type !== "photo") {
    return copyEvidence(current);
  }

  const nextItem: Evidence = {
    ...current,
    photoUri,
  };

  const next = [...items];
  next[index] = copyEvidence(nextItem);
  await writeJsonArray(scopedEvidenceKey(ownerUid), next);
  return copyEvidence(nextItem);
}

/**
 * Removes Evidence metadata from the current owner's namespace.
 * Returns false when not found.
 */
export async function deleteEvidence(
  ownerUid: string,
  evidenceId: string,
): Promise<boolean> {
  if (!ownerUid.trim() || !evidenceId.trim()) {
    throw new Error("Invalid evidence delete.");
  }

  const items = await loadEvidence(ownerUid);
  const next = items.filter((item) => item.id !== evidenceId);

  if (next.length === items.length) {
    return false;
  }

  await writeJsonArray(scopedEvidenceKey(ownerUid), next);
  return true;
}
