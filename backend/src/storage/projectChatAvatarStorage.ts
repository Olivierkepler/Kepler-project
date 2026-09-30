import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import {
  extensionForContentType,
  getEvidenceBucketName,
  isAllowedEvidenceContentType,
} from "./evidenceStorage.js";

export const PROJECT_CHAT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROJECT_CHAT_AVATAR_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

const OBJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAllowedProjectChatAvatarContentType(
  value: string,
): boolean {
  return (
    (PROJECT_CHAT_AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(
      value.trim().toLowerCase(),
    ) && isAllowedEvidenceContentType(value.trim().toLowerCase())
  );
}

export function isProjectChatAvatarObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value.trim());
}

export function buildProjectChatAvatarObjectPath(input: {
  projectId: string;
  conversationId: string;
  objectId: string;
  contentType: string;
}): string {
  const projectId = input.projectId.trim();
  const conversationId = input.conversationId.trim();
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();

  if (
    !projectId ||
    projectId.includes("/") ||
    !conversationId ||
    conversationId.includes("/") ||
    !isProjectChatAvatarObjectId(objectId) ||
    !isAllowedProjectChatAvatarContentType(contentType)
  ) {
    throw new Error("Invalid Project Chat avatar path input");
  }

  const extension = extensionForContentType(contentType);
  return `projects/${projectId}/conversations/${conversationId}/avatar/${objectId}.${extension}`;
}

export function isProjectChatAvatarObjectPathFor(input: {
  objectPath: string;
  projectId: string;
  conversationId: string;
  objectId: string;
  contentType: string;
}): boolean {
  try {
    return (
      input.objectPath ===
      buildProjectChatAvatarObjectPath({
        projectId: input.projectId,
        conversationId: input.conversationId,
        objectId: input.objectId,
        contentType: input.contentType,
      })
    );
  } catch {
    return false;
  }
}

export type SignedProjectChatAvatarUpload = {
  uploadUrl: string;
  expiresAt: string;
};

export async function createProjectChatAvatarUploadUrl(input: {
  objectPath: string;
  contentType: string;
}): Promise<SignedProjectChatAvatarUpload> {
  if (!isAllowedProjectChatAvatarContentType(input.contentType)) {
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
    contentType: input.contentType.trim().toLowerCase(),
  });

  return { uploadUrl, expiresAt: new Date(expiresMs).toISOString() };
}

export type ProjectChatAvatarObjectMetadata = {
  size: number;
  contentType: string | null;
};

export async function getProjectChatAvatarObjectMetadata(
  objectPath: string,
): Promise<ProjectChatAvatarObjectMetadata | null> {
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

export async function createProjectChatAvatarReadUrl(
  objectPath: string,
): Promise<string> {
  if (!objectPath.trim()) {
    throw new Error("objectPath is required");
  }

  const metadata = await getProjectChatAvatarObjectMetadata(objectPath);
  if (
    !metadata ||
    metadata.size <= 0 ||
    !metadata.contentType ||
    !isAllowedProjectChatAvatarContentType(metadata.contentType)
  ) {
    throw new Error("Project Chat avatar object was not found");
  }

  const expiresMs = Date.now() + 10 * 60 * 1000;
  const file = getStorage()
    .bucket(getEvidenceBucketName())
    .file(objectPath);
  const [readUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresMs,
  });
  return readUrl;
}

export async function deleteProjectChatAvatarObject(
  objectPath: string,
): Promise<void> {
  if (!objectPath.trim()) {
    return;
  }

  const file = getStorage()
    .bucket(getEvidenceBucketName())
    .file(objectPath);
  await file.delete({ ignoreNotFound: true });
}

export function createProjectChatAvatarObjectId(): string {
  return randomUUID();
}
