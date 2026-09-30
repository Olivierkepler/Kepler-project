import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import {
  extensionForContentType,
  getEvidenceBucketName,
  isAllowedEvidenceContentType,
} from "./evidenceStorage.js";

export const PLAN_ITEM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PLAN_ITEM_IMAGE_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

const OBJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|heic|webp)$/i;

export function isAllowedPlanItemImageContentType(value: string): boolean {
  const contentType = value.trim().toLowerCase();
  return (
    (PLAN_ITEM_IMAGE_ALLOWED_CONTENT_TYPES as readonly string[]).includes(
      contentType,
    ) && isAllowedEvidenceContentType(contentType)
  );
}

export function isPlanItemImageObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value.trim());
}

export function buildPlanItemImageObjectPath(input: {
  projectId: string;
  planItemId: string;
  objectId: string;
  contentType: string;
}): string {
  const projectId = input.projectId.trim();
  const planItemId = input.planItemId.trim();
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();

  if (
    !projectId ||
    projectId.includes("/") ||
    !planItemId ||
    planItemId.includes("/") ||
    !isPlanItemImageObjectId(objectId) ||
    !isAllowedPlanItemImageContentType(contentType)
  ) {
    throw new Error("Invalid Plan Item image path input");
  }

  const extension = extensionForContentType(contentType);
  return `projects/${projectId}/plan-items/${planItemId}/image/${objectId}.${extension}`;
}

export function isPlanItemImageObjectPathFor(input: {
  objectPath: string;
  projectId: string;
  planItemId: string;
  objectId: string;
  contentType: string;
}): boolean {
  try {
    return (
      input.objectPath ===
      buildPlanItemImageObjectPath({
        projectId: input.projectId,
        planItemId: input.planItemId,
        objectId: input.objectId,
        contentType: input.contentType,
      })
    );
  } catch {
    return false;
  }
}

function isPlanItemImagePathForItem(
  objectPath: string,
  projectId: string,
  planItemId: string,
): boolean {
  const prefix = `projects/${projectId}/plan-items/${planItemId}/image/`;
  return (
    !!projectId.trim() &&
    !projectId.includes("/") &&
    !!planItemId.trim() &&
    !planItemId.includes("/") &&
    objectPath.startsWith(prefix) &&
    IMAGE_FILENAME_PATTERN.test(objectPath.slice(prefix.length))
  );
}

export type SignedPlanItemImageUpload = {
  uploadUrl: string;
  expiresAt: string;
};

export async function createPlanItemImageUploadUrl(input: {
  objectPath: string;
  contentType: string;
}): Promise<SignedPlanItemImageUpload> {
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedPlanItemImageContentType(contentType)) {
    throw new Error("Unsupported content type");
  }

  const expiresMs = Date.now() + 15 * 60 * 1000;
  const file = getStorage()
    .bucket(getEvidenceBucketName())
    .file(input.objectPath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresMs,
    contentType,
  });

  return { uploadUrl, expiresAt: new Date(expiresMs).toISOString() };
}

export type PlanItemImageObjectMetadata = {
  size: number;
  contentType: string | null;
};

export async function getPlanItemImageObjectMetadata(
  objectPath: string,
): Promise<PlanItemImageObjectMetadata | null> {
  if (!objectPath.trim()) {
    return null;
  }

  const file = getStorage()
    .bucket(getEvidenceBucketName())
    .file(objectPath);
  try {
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!Number.isFinite(size)) {
      return null;
    }
    return {
      size,
      contentType:
        typeof metadata.contentType === "string"
          ? metadata.contentType.trim().toLowerCase()
          : null,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === 404 || code === "404") {
      return null;
    }
    throw error;
  }
}

export async function createPlanItemImageReadUrl(input: {
  objectPath: string;
  projectId: string;
  planItemId: string;
}): Promise<string> {
  if (
    !isPlanItemImagePathForItem(
      input.objectPath,
      input.projectId,
      input.planItemId,
    )
  ) {
    throw new Error("Plan Item image path is invalid");
  }

  const metadata = await getPlanItemImageObjectMetadata(input.objectPath);
  if (
    !metadata ||
    metadata.size <= 0 ||
    metadata.size > PLAN_ITEM_IMAGE_MAX_BYTES ||
    !metadata.contentType ||
    !isAllowedPlanItemImageContentType(metadata.contentType)
  ) {
    throw new Error("Plan Item image object is invalid");
  }

  const expiresMs = Date.now() + 10 * 60 * 1000;
  const file = getStorage()
    .bucket(getEvidenceBucketName())
    .file(input.objectPath);
  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresMs,
  });
  return readUrl;
}

export async function deletePlanItemImageObject(
  objectPath: string,
): Promise<void> {
  if (!objectPath.trim()) {
    return;
  }
  await getStorage()
    .bucket(getEvidenceBucketName())
    .file(objectPath)
    .delete({ ignoreNotFound: true });
}

export function createPlanItemImageObjectId(): string {
  return randomUUID();
}
