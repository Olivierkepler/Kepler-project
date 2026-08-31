import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type {
  PlanImport,
  PlanImportFile,
  PlanImportFileUploadStatus,
  PlanImportStatus,
} from "../domain/planImport.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

const PLAN_IMPORT_STATUSES: readonly PlanImportStatus[] = [
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

function normalizePlanImportFile(value: unknown): PlanImportFile | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.localFileId !== "string" ||
    typeof record.name !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.size !== "number" ||
    !Number.isFinite(record.size) ||
    typeof record.storagePath !== "string" ||
    !isFileUploadStatus(record.uploadStatus)
  ) {
    return undefined;
  }

  return {
    id: record.id,
    localFileId: record.localFileId,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    storagePath: record.storagePath,
    uploadStatus: record.uploadStatus,
  };
}

export function normalizePlanImportDocument(
  data: unknown,
): PlanImport | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.ownerUid !== "string" ||
    typeof record.createdByUid !== "string" ||
    typeof record.localImportId !== "string" ||
    !isPlanImportStatus(record.status) ||
    !Array.isArray(record.files) ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }

  const files = record.files
    .map(normalizePlanImportFile)
    .filter((file): file is PlanImportFile => file != null);

  if (files.length === 0) {
    return undefined;
  }

  const item: PlanImport = {
    id: record.id,
    projectId: record.projectId,
    ownerUid: record.ownerUid,
    createdByUid: record.createdByUid,
    localImportId: record.localImportId,
    status: record.status,
    files,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (
    typeof record.errorMessage === "string" &&
    record.errorMessage.trim().length > 0
  ) {
    item.errorMessage = record.errorMessage.trim();
  }

  if (typeof record.approvedAt === "string" && record.approvedAt.trim()) {
    item.approvedAt = record.approvedAt.trim();
  }
  if (typeof record.approvedByUid === "string" && record.approvedByUid.trim()) {
    item.approvedByUid = record.approvedByUid.trim();
  }
  if (Array.isArray(record.createdPlanItemIds)) {
    const ids = record.createdPlanItemIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    if (ids.length > 0) {
      item.createdPlanItemIds = ids;
    }
  }
  if (
    typeof record.selectedCandidateCount === "number" &&
    Number.isFinite(record.selectedCandidateCount)
  ) {
    item.selectedCandidateCount = record.selectedCandidateCount;
  }
  if (
    typeof record.createdPlanItemCount === "number" &&
    Number.isFinite(record.createdPlanItemCount)
  ) {
    item.createdPlanItemCount = record.createdPlanItemCount;
  }

  return item;
}

export async function getPlanImportById(
  importId: string,
): Promise<PlanImport | undefined> {
  requireId(importId, "importId");

  const snapshot = await db
    .collection(COLLECTIONS.planImports)
    .doc(importId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizePlanImportDocument(snapshot.data());
}

export async function getPlanImportsForProject(
  projectId: string,
): Promise<PlanImport[]> {
  requireId(projectId, "projectId");

  const snapshot = await db
    .collection(COLLECTIONS.planImports)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs
    .map((doc) => normalizePlanImportDocument(doc.data()))
    .filter((item): item is PlanImport => item != null);
}

export async function setPlanImport(item: PlanImport): Promise<void> {
  requireId(item.id, "id");
  requireId(item.projectId, "projectId");
  requireId(item.ownerUid, "ownerUid");

  await db.collection(COLLECTIONS.planImports).doc(item.id).set(item);
}
