import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import {
  extensionForContentType,
  getEvidenceBucketName,
  isAllowedEvidenceContentType,
} from "./evidenceStorage.js";

export const USER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function isAllowedUserAvatarContentType(value: string): boolean {
  return isAllowedEvidenceContentType(value);
}

export function buildUserAvatarObjectPath(
  uid: string,
  contentType: string,
): string {
  const trimmedUid = uid.trim();
  if (!trimmedUid) {
    throw new Error("uid is required");
  }

  const ext = extensionForContentType(contentType);
  return `users/${trimmedUid}/profile/avatar.${ext}`;
}

export function isUserAvatarObjectPathForUid(
  uid: string,
  objectPath: string,
): boolean {
  const trimmedUid = uid.trim();
  const trimmedPath = objectPath.trim();

  if (!trimmedUid || !trimmedPath) {
    return false;
  }

  return trimmedPath.startsWith(`users/${trimmedUid}/profile/avatar.`);
}

export type SignedUserAvatarUpload = {
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

export type SignedUserAvatarRead = {
  readUrl: string;
  objectPath: string;
  expiresAt: string;
};

export async function createUserAvatarUploadUrl(
  objectPath: string,
  contentType: string,
): Promise<SignedUserAvatarUpload> {
  if (!isAllowedUserAvatarContentType(contentType)) {
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

export async function createUserAvatarReadUrl(
  objectPath: string,
): Promise<SignedUserAvatarRead> {
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

export async function userAvatarObjectExists(
  objectPath: string,
): Promise<boolean> {
  if (!objectPath.trim()) {
    return false;
  }

  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  return exists;
}

export async function getUserAvatarObjectSize(
  objectPath: string,
): Promise<number | null> {
  if (!objectPath.trim()) {
    return null;
  }

  const bucket = getStorage().bucket(getEvidenceBucketName());
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();

  if (!exists) {
    return null;
  }

  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  return Number.isFinite(size) ? size : null;
}

export async function deleteUserAvatarObject(objectPath: string): Promise<void> {
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
