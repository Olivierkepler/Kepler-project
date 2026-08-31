import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";

export type AgentPlanImportStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "failed";

export type AgentPlanImportFile = {
  id: string;
  localFileId: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadStatus: "pending" | "uploaded" | "failed";
};

export type AgentPlanImport = {
  id: string;
  projectId: string;
  ownerUid: string;
  createdByUid: string;
  localImportId: string;
  status: AgentPlanImportStatus;
  files: AgentPlanImportFile[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function normalizeFile(value: unknown): AgentPlanImportFile | undefined {
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
    typeof record.storagePath !== "string" ||
    (record.uploadStatus !== "pending" &&
      record.uploadStatus !== "uploaded" &&
      record.uploadStatus !== "failed")
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

export function normalizeAgentPlanImport(
  data: unknown,
): AgentPlanImport | undefined {
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
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !Array.isArray(record.files) ||
    (record.status !== "uploading" &&
      record.status !== "uploaded" &&
      record.status !== "processing" &&
      record.status !== "ready_for_review" &&
      record.status !== "failed")
  ) {
    return undefined;
  }

  const files = record.files
    .map(normalizeFile)
    .filter((file): file is AgentPlanImportFile => file != null);
  if (files.length === 0) {
    return undefined;
  }

  const item: AgentPlanImport = {
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

  return item;
}

export async function getPlanImportById(
  importId: string,
): Promise<AgentPlanImport | undefined> {
  requireId(importId, "importId");
  const snapshot = await db
    .collection(COLLECTIONS.planImports)
    .doc(importId)
    .get();
  if (!snapshot.exists) {
    return undefined;
  }
  return normalizeAgentPlanImport(snapshot.data());
}

export async function setPlanImport(item: AgentPlanImport): Promise<void> {
  requireId(item.id, "id");
  await db.collection(COLLECTIONS.planImports).doc(item.id).set(item);
}
