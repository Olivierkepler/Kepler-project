import type { PlanImport, PlanImportFile } from "../domain/planImport.js";
import {
  isAllowedPlanImportMimeType,
  PLAN_IMPORT_MAX_FILE_BYTES,
  PLAN_IMPORT_MAX_FILES,
} from "../storage/planImportStorage.js";

export type PlanImportCreateFileInput = {
  localFileId: string;
  name: string;
  mimeType: string;
  size: number;
};

export type PlanImportCreateInput = {
  localImportId: string;
  files: PlanImportCreateFileInput[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeMimeType(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "image/jpg") {
    return "image/jpeg";
  }
  return trimmed;
}

/**
 * Parses create-import body. Returns null on structural failure.
 * MIME/size/count validation errors throw Error with a client-safe message.
 */
export function parsePlanImportCreateInput(
  body: unknown,
): PlanImportCreateInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;

  if (!isNonEmptyString(record.localImportId) || !Array.isArray(record.files)) {
    return null;
  }

  if (record.localImportId.includes("/")) {
    return null;
  }

  if (record.files.length === 0) {
    throw new Error("At least one file is required.");
  }

  if (record.files.length > PLAN_IMPORT_MAX_FILES) {
    throw new Error(
      `A plan import may include at most ${PLAN_IMPORT_MAX_FILES} files.`,
    );
  }

  const files: PlanImportCreateFileInput[] = [];
  const seenLocalFileIds = new Set<string>();

  for (const raw of record.files) {
    if (typeof raw !== "object" || raw === null) {
      return null;
    }

    const file = raw as Record<string, unknown>;

    if (
      !isNonEmptyString(file.localFileId) ||
      !isNonEmptyString(file.name) ||
      !isNonEmptyString(file.mimeType) ||
      typeof file.size !== "number" ||
      !Number.isFinite(file.size)
    ) {
      return null;
    }

    if (file.localFileId.includes("/")) {
      return null;
    }

    if (seenLocalFileIds.has(file.localFileId)) {
      throw new Error("Duplicate localFileId in import payload.");
    }

    seenLocalFileIds.add(file.localFileId);

    const mimeType = normalizeMimeType(file.mimeType);

    if (!isAllowedPlanImportMimeType(mimeType)) {
      throw new Error(
        "Unsupported file type. Allowed: application/pdf, image/jpeg, image/png.",
      );
    }

    if (file.size <= 0) {
      throw new Error("File size must be greater than zero.");
    }

    if (file.size > PLAN_IMPORT_MAX_FILE_BYTES) {
      throw new Error(
        `Each file must be ${PLAN_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB or smaller.`,
      );
    }

    files.push({
      localFileId: file.localFileId.trim(),
      name: file.name.trim(),
      mimeType,
      size: file.size,
    });
  }

  return {
    localImportId: record.localImportId.trim(),
    files,
  };
}

/**
 * True when an existing import's file set matches a create retry payload
 * (same localFileId, mimeType, size, name).
 */
export function planImportCreatePayloadMatches(
  existing: PlanImport,
  input: PlanImportCreateInput,
): boolean {
  if (existing.localImportId !== input.localImportId) {
    return false;
  }

  if (existing.files.length !== input.files.length) {
    return false;
  }

  const byLocalId = new Map(
    existing.files.map((file) => [file.localFileId, file]),
  );

  for (const file of input.files) {
    const match = byLocalId.get(file.localFileId);
    if (!match) {
      return false;
    }

    if (
      match.name !== file.name ||
      match.mimeType !== file.mimeType ||
      match.size !== file.size
    ) {
      return false;
    }
  }

  return true;
}

export function toPlanImportResponse(item: PlanImport) {
  return {
    id: item.id,
    projectId: item.projectId,
    ownerUid: item.ownerUid,
    createdByUid: item.createdByUid,
    localImportId: item.localImportId,
    status: item.status,
    files: item.files.map(toPlanImportFileResponse),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    ...(item.approvedAt ? { approvedAt: item.approvedAt } : {}),
    ...(item.approvedByUid ? { approvedByUid: item.approvedByUid } : {}),
    ...(item.createdPlanItemIds
      ? { createdPlanItemIds: item.createdPlanItemIds }
      : {}),
    ...(item.selectedCandidateCount !== undefined
      ? { selectedCandidateCount: item.selectedCandidateCount }
      : {}),
    ...(item.createdPlanItemCount !== undefined
      ? { createdPlanItemCount: item.createdPlanItemCount }
      : {}),
  };
}

export function toPlanImportFileResponse(file: PlanImportFile) {
  return {
    id: file.id,
    localFileId: file.localFileId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    storagePath: file.storagePath,
    uploadStatus: file.uploadStatus,
  };
}
