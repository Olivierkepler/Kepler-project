import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import { getEvidenceBucketName } from "./evidenceStorage.js";

/**
 * Plan import documents reuse the protected Evidence bucket with a
 * namespaced object path. Fail closed via getEvidenceBucketName().
 */

export const PLAN_IMPORT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type PlanImportAllowedMimeType =
  (typeof PLAN_IMPORT_ALLOWED_MIME_TYPES)[number];

/** Conservative per-file limit for Phase 2P.2 (bytes). */
export const PLAN_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Conservative files-per-import limit for Phase 2P.2. */
export const PLAN_IMPORT_MAX_FILES = 10;

const ALLOWED = new Set<string>(PLAN_IMPORT_ALLOWED_MIME_TYPES);

export function isAllowedPlanImportMimeType(
  value: string,
): value is PlanImportAllowedMimeType {
  return ALLOWED.has(value);
}

export function extensionForPlanImportMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

/**
 * Tenant-scoped object path (server-authored only).
 * users/{ownerUid}/projects/{remoteProjectId}/plan-imports/{importId}/{fileId}.{ext}
 */
export function buildPlanImportObjectPath(
  ownerUid: string,
  remoteProjectId: string,
  remoteImportId: string,
  remoteFileId: string,
  mimeType: string,
): string {
  const ext = extensionForPlanImportMimeType(mimeType);
  return `users/${ownerUid}/projects/${remoteProjectId}/plan-imports/${remoteImportId}/${remoteFileId}.${ext}`;
}

export type SignedPlanImportUpload = {
  uploadUrl: string;
  storagePath: string;
  contentType: string;
  expiresAt: string;
};

/**
 * Short-lived V4 signed PUT URL for a private plan-import object.
 * Write-only, object-scoped, content-type locked.
 */
export async function createPlanImportUploadUrl(
  storagePath: string,
  contentType: string,
): Promise<SignedPlanImportUpload> {
  if (!isAllowedPlanImportMimeType(contentType)) {
    throw new Error("Unsupported content type");
  }

  const expiresMs = Date.now() + 15 * 60 * 1000;
  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(storagePath);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresMs,
    contentType,
  });

  return {
    uploadUrl,
    storagePath,
    contentType,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/**
 * Returns true when the object exists in the configured private bucket.
 */
export async function planImportObjectExists(
  storagePath: string,
): Promise<boolean> {
  if (!storagePath.trim()) {
    return false;
  }

  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  return exists;
}
