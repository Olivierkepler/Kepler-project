import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";

import {
  createEvidenceReadUrl,
  extensionForContentType,
  getEvidenceBucketName,
} from "./evidenceStorage.js";

export {
  createEvidenceReadUrl as createFeedMediaReadUrl,
  getEvidenceBucketName,
};

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);

export type SignedFeedMediaUpload = {
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

export function isAllowedFeedImageContentType(
  value: string,
): boolean {
  return ALLOWED_IMAGE_CONTENT_TYPES.has(value);
}

export function isAllowedFeedVideoContentType(
  value: string,
): boolean {
  return ALLOWED_VIDEO_CONTENT_TYPES.has(value);
}

export function isAllowedFeedMediaContentType(
  mediaType: "image" | "video",
  contentType: string,
): boolean {
  if (mediaType === "image") {
    return isAllowedFeedImageContentType(contentType);
  }

  return isAllowedFeedVideoContentType(contentType);
}

export function extensionForFeedMediaContentType(
  contentType: string,
): string {
  switch (contentType) {
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    default:
      return extensionForContentType(contentType);
  }
}

export async function createFeedMediaUploadUrl(
  objectPath: string,
  contentType: string,
): Promise<SignedFeedMediaUpload> {
  const allowed =
    isAllowedFeedImageContentType(contentType) ||
    isAllowedFeedVideoContentType(contentType);

  if (!allowed) {
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
 * Private object path under project owner tenancy (same bucket as evidence).
 */
export function buildFeedMediaObjectPath(input: {
  ownerUid: string;
  projectId: string;
  localPostId: string;
  localMediaId: string;
  contentType: string;
}): string {
  const ext = extensionForFeedMediaContentType(input.contentType);

  return `users/${input.ownerUid}/projects/${input.projectId}/feed/${input.localPostId}/${input.localMediaId}.${ext}`;
}

export function feedMediaObjectPathMatchesExpected(input: {
  objectPath: string;
  ownerUid: string;
  projectId: string;
  localPostId: string;
  localMediaId: string;
}): boolean {
  const prefix = `users/${input.ownerUid}/projects/${input.projectId}/feed/${input.localPostId}/${input.localMediaId}.`;

  return input.objectPath.startsWith(prefix);
}
