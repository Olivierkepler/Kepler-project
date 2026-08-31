import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export function getEvidenceBucketName(): string {
  const fromEnv = process.env.EVIDENCE_STORAGE_BUCKET?.trim();
  if (!fromEnv) {
    throw new Error(
      "EVIDENCE_STORAGE_BUCKET is required. Set it to the Evidence GCS bucket name.",
    );
  }
  return fromEnv;
}

export function isAllowedEvidenceContentType(value: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(value);
}

export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/heic":
      return "heic";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

export function buildEvidenceObjectPath(
  ownerUid: string,
  remoteProjectId: string,
  remoteEvidenceId: string,
  contentType: string,
): string {
  const ext = extensionForContentType(contentType);
  return `users/${ownerUid}/projects/${remoteProjectId}/evidence/${remoteEvidenceId}/photo.${ext}`;
}

export type SignedEvidenceUpload = {
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

export type SignedEvidenceRead = {
  readUrl: string;
  objectPath: string;
  expiresAt: string;
};

/**
 * Creates a short-lived V4 signed PUT URL for a private evidence object.
 */
export async function createEvidenceUploadUrl(
  objectPath: string,
  contentType: string,
): Promise<SignedEvidenceUpload> {
  if (!isAllowedEvidenceContentType(contentType)) {
    throw new Error("Unsupported content type");
  }

  const expiresMs = Date.now() + 15 * 60 * 1000;
  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(objectPath);

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresMs,
    contentType,
  });

  return {
    uploadUrl,
    objectPath,
    contentType,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/**
 * Creates a short-lived V4 signed GET URL for a private evidence object.
 */
export async function createEvidenceReadUrl(
  objectPath: string,
): Promise<SignedEvidenceRead> {
  if (!objectPath.trim()) {
    throw new Error("objectPath is required");
  }

  const expiresMs = Date.now() + 10 * 60 * 1000;
  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(objectPath);

  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresMs,
  });

  return {
    readUrl,
    objectPath,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/**
 * Deletes a private evidence object from the configured Evidence bucket only.
 * Missing objects are treated as already deleted (safe/continuable).
 */
export async function deleteEvidenceObject(objectPath: string): Promise<void> {
  if (!objectPath.trim()) {
    throw new Error("objectPath is required");
  }

  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(objectPath);

  try {
    await file.delete({ ignoreNotFound: true });
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "number"
        ? (error as { code: number }).code
        : null;

    if (code === 404) {
      return;
    }

    throw error;
  }
}
