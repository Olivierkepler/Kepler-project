/**
 * Local Plan Import store (Phase 2P.1–2P.2).
 *
 * Owner-scoped AsyncStorage: `@buildsigma/planImports/{ownerUid}`
 *
 * Initial status after createPlanImport: "draft"
 * (files selected locally; cloud upload sets uploading → uploaded | failed).
 */

import type {
  PlanImport,
  PlanImportFile,
  PlanImportFileUploadStatus,
  PlanImportStatus,
} from "../types/planImport";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

function scopedPlanImportsKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for plan import storage.");
  }

  return `${STORAGE_KEYS.planImports}/${ownerUid}`;
}

export function createLocalPlanImportId(now: number = Date.now()): string {
  return `plan-import-${now}-${Math.floor(Math.random() * 100000)}`;
}

export function createLocalPlanImportFileId(now: number = Date.now()): string {
  return `plan-import-file-${now}-${Math.floor(Math.random() * 100000)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const PLAN_IMPORT_STATUSES: readonly PlanImportStatus[] = [
  "draft",
  "uploading",
  "uploaded",
  "processing",
  "ready_for_review",
  "ready_for_approval",
  "approved",
  "failed",
];

const FILE_UPLOAD_STATUSES: readonly PlanImportFileUploadStatus[] = [
  "pending",
  "uploaded",
  "failed",
];

function isPlanImportStatus(value: unknown): value is PlanImportStatus {
  return (
    typeof value === "string" &&
    (PLAN_IMPORT_STATUSES as readonly string[]).includes(value)
  );
}

function isFileUploadStatus(
  value: unknown,
): value is PlanImportFileUploadStatus {
  return (
    typeof value === "string" &&
    (FILE_UPLOAD_STATUSES as readonly string[]).includes(value)
  );
}

function normalizePlanImportFile(value: unknown): PlanImportFile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.name) ||
    !isNonEmptyString(record.uri) ||
    (record.type !== "pdf" &&
      record.type !== "image" &&
      record.type !== "other")
  ) {
    return null;
  }

  const file: PlanImportFile = {
    id: record.id,
    name: record.name,
    uri: record.uri,
    type: record.type,
  };

  if (typeof record.mimeType === "string" && record.mimeType.trim()) {
    file.mimeType = record.mimeType;
  }

  if (typeof record.size === "number" && Number.isFinite(record.size)) {
    file.size = record.size;
  }

  if (typeof record.remoteFileId === "string" && record.remoteFileId.trim()) {
    file.remoteFileId = record.remoteFileId;
  }

  if (typeof record.storagePath === "string" && record.storagePath.trim()) {
    file.storagePath = record.storagePath;
  }

  if (isFileUploadStatus(record.uploadStatus)) {
    file.uploadStatus = record.uploadStatus;
  }

  return file;
}

function normalizePlanImport(value: unknown): PlanImport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.ownerUid) ||
    !isPlanImportStatus(record.status) ||
    !Array.isArray(record.files) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  const files = record.files
    .map(normalizePlanImportFile)
    .filter((item): item is PlanImportFile => item != null);

  if (files.length === 0) {
    return null;
  }

  const item: PlanImport = {
    id: record.id,
    projectId: record.projectId,
    ownerUid: record.ownerUid,
    status: record.status,
    files,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (
    typeof record.errorMessage === "string" &&
    record.errorMessage.trim().length > 0
  ) {
    item.errorMessage = record.errorMessage;
  }

  if (
    typeof record.remoteImportId === "string" &&
    record.remoteImportId.trim()
  ) {
    item.remoteImportId = record.remoteImportId;
  }

  if (
    typeof record.remoteProjectId === "string" &&
    record.remoteProjectId.trim()
  ) {
    item.remoteProjectId = record.remoteProjectId;
  }

  return item;
}

function copyPlanImport(item: PlanImport): PlanImport {
  return {
    ...item,
    files: item.files.map((file) => ({ ...file })),
  };
}

async function loadPlanImports(ownerUid: string): Promise<PlanImport[]> {
  const items = await readJsonArray<unknown>(scopedPlanImportsKey(ownerUid));
  return items
    .map(normalizePlanImport)
    .filter((item): item is PlanImport => item != null)
    .map(copyPlanImport);
}

async function savePlanImports(
  ownerUid: string,
  items: PlanImport[],
): Promise<void> {
  await writeJsonArray(scopedPlanImportsKey(ownerUid), items);
}

/**
 * Creates a local PlanImport with status "draft".
 * Cloud upload (2P.2) transitions draft → uploading → uploaded | failed.
 */
export async function createPlanImport(
  ownerUid: string,
  projectId: string,
  files: PlanImportFile[],
): Promise<PlanImport> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid.");
  }

  if (!projectId.trim()) {
    throw new Error("Invalid projectId.");
  }

  if (!files.length) {
    throw new Error("At least one file is required.");
  }

  const nowIso = new Date().toISOString();
  const created: PlanImport = {
    id: createLocalPlanImportId(),
    projectId: projectId.trim(),
    ownerUid: ownerUid.trim(),
    status: "draft",
    files: files.map((file) => ({
      ...file,
      uploadStatus: file.uploadStatus ?? "pending",
    })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const existing = await loadPlanImports(ownerUid);
  await savePlanImports(ownerUid, [...existing, created]);
  return copyPlanImport(created);
}

export async function getPlanImportById(
  ownerUid: string,
  importId: string,
): Promise<PlanImport | null> {
  const items = await loadPlanImports(ownerUid);
  const found = items.find((item) => item.id === importId);
  return found ? copyPlanImport(found) : null;
}

export async function getPlanImportsForProject(
  ownerUid: string,
  projectId: string,
): Promise<PlanImport[]> {
  const items = await loadPlanImports(ownerUid);
  return items
    .filter((item) => item.projectId === projectId)
    .map(copyPlanImport);
}

export async function updatePlanImportStatus(
  ownerUid: string,
  importId: string,
  status: PlanImportStatus,
  options?: { errorMessage?: string | null },
): Promise<PlanImport | null> {
  return updatePlanImport(ownerUid, importId, {
    status,
    ...(options && "errorMessage" in options
      ? { errorMessage: options.errorMessage }
      : {}),
  });
}

export type PlanImportUpdatePatch = {
  status?: PlanImportStatus;
  errorMessage?: string | null;
  remoteImportId?: string | null;
  remoteProjectId?: string | null;
  files?: PlanImportFile[];
};

/**
 * Partial update for local PlanImport (status, remote ids, files, errors).
 */
export async function updatePlanImport(
  ownerUid: string,
  importId: string,
  patch: PlanImportUpdatePatch,
): Promise<PlanImport | null> {
  const items = await loadPlanImports(ownerUid);
  const index = items.findIndex((item) => item.id === importId);

  if (index < 0) {
    return null;
  }

  const current = items[index]!;
  const updated: PlanImport = {
    ...current,
    updatedAt: new Date().toISOString(),
    files: (patch.files ?? current.files).map((file) => ({ ...file })),
  };

  if (patch.status !== undefined) {
    updated.status = patch.status;
  }

  if (patch && "errorMessage" in patch) {
    if (
      typeof patch.errorMessage === "string" &&
      patch.errorMessage.trim().length > 0
    ) {
      updated.errorMessage = patch.errorMessage.trim();
    } else {
      delete updated.errorMessage;
    }
  }

  if (patch && "remoteImportId" in patch) {
    if (
      typeof patch.remoteImportId === "string" &&
      patch.remoteImportId.trim()
    ) {
      updated.remoteImportId = patch.remoteImportId.trim();
    } else {
      delete updated.remoteImportId;
    }
  }

  if (patch && "remoteProjectId" in patch) {
    if (
      typeof patch.remoteProjectId === "string" &&
      patch.remoteProjectId.trim()
    ) {
      updated.remoteProjectId = patch.remoteProjectId.trim();
    } else {
      delete updated.remoteProjectId;
    }
  }

  const next = [...items];
  next[index] = updated;
  await savePlanImports(ownerUid, next);
  return copyPlanImport(updated);
}

export async function deletePlanImport(
  ownerUid: string,
  importId: string,
): Promise<boolean> {
  const items = await loadPlanImports(ownerUid);
  const next = items.filter((item) => item.id !== importId);

  if (next.length === items.length) {
    return false;
  }

  await savePlanImports(ownerUid, next);
  return true;
}
