import type { Evidence, EvidenceType } from "../domain/evidence.js";
import { isNonEmptyString, isRecord } from "./primitives.js";
import { isAllowedEvidenceContentType } from "../storage/evidenceStorage.js";

function isEvidenceType(value: unknown): value is EvidenceType {
  return value === "photo" || value === "note";
}

function parseNullableLocalId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.includes("/")) {
    return undefined;
  }

  return trimmed;
}

export type EvidenceWriteInput = {
  localEvidenceId: string;
  type: EvidenceType;
  note: string;
  createdAt: string;
  objectPath: string | null;
  contentType: string | null;
  localMeasurementId: string | null;
  localDeltaId: string | null;
};

export type EvidenceUploadUrlInput = {
  localEvidenceId: string;
  contentType: string;
  /** Measurement-linked collaborator uploads (Phase 2I.1). */
  localMeasurementId: string | null;
  /** Delta-linked collaborator uploads (evidence request fulfillment). */
  localDeltaId: string | null;
};

/**
 * Parses note/photo Evidence metadata create body.
 * Missing relationship fields → null.
 * Both non-null → invalid.
 *
 * Does not require remote Measurement/Delta existence for owners:
 * project ownership is the cloud auth boundary; the mobile client
 * validates local relationships, and domain sync may still be converging.
 * Collaborators require a resolvable Measurement (enforced in routes).
 */
export function parseEvidenceWriteInput(
  body: unknown,
): EvidenceWriteInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.localEvidenceId) ||
    body.localEvidenceId.includes("/") ||
    !isEvidenceType(body.type) ||
    typeof body.note !== "string" ||
    !isNonEmptyString(body.createdAt)
  ) {
    return null;
  }

  const localMeasurementId = parseNullableLocalId(body.localMeasurementId);
  const localDeltaId = parseNullableLocalId(body.localDeltaId);

  if (localMeasurementId === undefined || localDeltaId === undefined) {
    return null;
  }

  if (localMeasurementId !== null && localDeltaId !== null) {
    return null;
  }

  if (body.type === "note") {
    if (body.note.trim().length === 0) {
      return null;
    }

    if (body.objectPath != null || body.contentType != null) {
      return null;
    }

    return {
      localEvidenceId: body.localEvidenceId,
      type: "note",
      note: body.note.trim(),
      createdAt: body.createdAt,
      objectPath: null,
      contentType: null,
      localMeasurementId,
      localDeltaId,
    };
  }

  if (
    !isNonEmptyString(body.objectPath) ||
    !isNonEmptyString(body.contentType) ||
    !isAllowedEvidenceContentType(body.contentType)
  ) {
    return null;
  }

  return {
    localEvidenceId: body.localEvidenceId,
    type: "photo",
    note: body.note.trim(),
    createdAt: body.createdAt,
    objectPath: body.objectPath,
    contentType: body.contentType,
    localMeasurementId,
    localDeltaId,
  };
}

export function parseEvidenceUploadUrlInput(
  body: unknown,
): EvidenceUploadUrlInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.localEvidenceId) ||
    body.localEvidenceId.includes("/") ||
    !isNonEmptyString(body.contentType) ||
    !isAllowedEvidenceContentType(body.contentType)
  ) {
    return null;
  }

  const localMeasurementId = parseNullableLocalId(body.localMeasurementId);
  const localDeltaId = parseNullableLocalId(body.localDeltaId);

  if (localMeasurementId === undefined || localDeltaId === undefined) {
    return null;
  }

  if (localMeasurementId !== null && localDeltaId !== null) {
    return null;
  }

  const hasMeasurementKey = Object.prototype.hasOwnProperty.call(
    body,
    "localMeasurementId",
  );
  const hasDeltaKey = Object.prototype.hasOwnProperty.call(body, "localDeltaId");

  return {
    localEvidenceId: body.localEvidenceId,
    contentType: body.contentType,
    localMeasurementId: hasMeasurementKey ? localMeasurementId : null,
    localDeltaId: hasDeltaKey ? localDeltaId : null,
  };
}

export function evidenceMetadataMatches(
  existing: Evidence,
  input: EvidenceWriteInput,
  storageOwnerUid: string,
  projectId: string,
): boolean {
  return (
    existing.ownerUid === storageOwnerUid &&
    existing.projectId === projectId &&
    existing.localEvidenceId === input.localEvidenceId &&
    existing.type === input.type &&
    existing.note === input.note &&
    existing.objectPath === input.objectPath &&
    existing.contentType === input.contentType &&
    existing.createdAt === input.createdAt &&
    (existing.localMeasurementId ?? null) === input.localMeasurementId &&
    (existing.localDeltaId ?? null) === input.localDeltaId
  );
}
