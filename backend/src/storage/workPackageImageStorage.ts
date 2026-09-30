import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import {
  extensionForContentType,
  getEvidenceBucketName,
  isAllowedEvidenceContentType,
} from "./evidenceStorage.js";

export const WORK_PACKAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WORK_PACKAGE_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAllowedWorkPackageImageContentType(value: string): boolean {
  const type = value.trim().toLowerCase();
  return (WORK_PACKAGE_IMAGE_CONTENT_TYPES as readonly string[]).includes(type) &&
    isAllowedEvidenceContentType(type);
}

export function isWorkPackageImageObjectId(value: string): boolean {
  return UUID.test(value.trim());
}

export function createWorkPackageImageObjectId(): string {
  return randomUUID();
}

export function buildWorkPackageImageObjectPath(input: {
  projectId: string;
  workPackageId: string;
  objectId: string;
  contentType: string;
}): string {
  const { projectId, workPackageId } = input;
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();
  if (
    !projectId.trim() || projectId.includes("/") ||
    !workPackageId.trim() || workPackageId.includes("/") ||
    !isWorkPackageImageObjectId(objectId) ||
    !isAllowedWorkPackageImageContentType(contentType)
  ) {
    throw new Error("Invalid Work Package image path input");
  }
  return `projects/${projectId}/work-packages/${workPackageId}/image/${objectId}.${extensionForContentType(contentType)}`;
}

export function isWorkPackageImageObjectPathFor(input: {
  objectPath: string;
  projectId: string;
  workPackageId: string;
  objectId: string;
  contentType: string;
}): boolean {
  try {
    return input.objectPath === buildWorkPackageImageObjectPath(input);
  } catch {
    return false;
  }
}

export type WorkPackageImageObjectMetadata = {
  size: number;
  contentType: string | null;
};

export async function createWorkPackageImageUploadUrl(input: {
  objectPath: string;
  contentType: string;
}): Promise<{ uploadUrl: string; expiresAt: string }> {
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedWorkPackageImageContentType(contentType)) {
    throw new Error("Unsupported content type");
  }
  const expiresMs = Date.now() + 15 * 60 * 1000;
  const file = getStorage().bucket(getEvidenceBucketName()).file(input.objectPath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: expiresMs,
    contentType,
  });
  return { uploadUrl, expiresAt: new Date(expiresMs).toISOString() };
}

export async function getWorkPackageImageObjectMetadata(
  objectPath: string,
): Promise<WorkPackageImageObjectMetadata | null> {
  if (!objectPath.trim()) return null;
  const file = getStorage().bucket(getEvidenceBucketName()).file(objectPath);
  try {
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!Number.isFinite(size)) return null;
    return {
      size,
      contentType: typeof metadata.contentType === "string"
        ? metadata.contentType.trim().toLowerCase()
        : null,
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === 404 || code === "404") return null;
    throw error;
  }
}

export async function createWorkPackageImageReadUrl(input: {
  objectPath: string;
  projectId: string;
  workPackageId: string;
}): Promise<string> {
  const prefix = `projects/${input.projectId}/work-packages/${input.workPackageId}/image/`;
  const filename = input.objectPath.startsWith(prefix)
    ? input.objectPath.slice(prefix.length)
    : "";
  if (
    !UUID.test(filename.replace(/\.(jpg|png|heic|webp)$/i, "")) ||
    !/^[0-9a-f-]+\.(jpg|png|heic|webp)$/i.test(filename) ||
    input.objectPath.includes("..")
  ) {
    throw new Error("Work Package image path is invalid");
  }
  const metadata = await getWorkPackageImageObjectMetadata(input.objectPath);
  if (
    !metadata || metadata.size <= 0 || metadata.size > WORK_PACKAGE_IMAGE_MAX_BYTES ||
    !metadata.contentType || !isAllowedWorkPackageImageContentType(metadata.contentType)
  ) {
    throw new Error("Work Package image object is invalid");
  }
  const expiresMs = Date.now() + 10 * 60 * 1000;
  const file = getStorage().bucket(getEvidenceBucketName()).file(input.objectPath);
  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresMs,
  });
  return readUrl;
}

export async function deleteWorkPackageImageObject(objectPath: string): Promise<void> {
  if (!objectPath.trim()) return;
  await getStorage().bucket(getEvidenceBucketName()).file(objectPath)
    .delete({ ignoreNotFound: true });
}
