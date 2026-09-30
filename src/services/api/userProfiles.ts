/**
 * Cloud UserProfile API — presentation metadata only.
 */

import type { UserProfile } from "../../types/userProfile";
import { authenticatedFetch } from "./client";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }
  return fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseUserProfile(value: unknown): UserProfile | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (!isNonEmptyString(record.uid)) {
    return null;
  }

  return {
    uid: record.uid.trim(),
    displayName:
      typeof record.displayName === "string" ? record.displayName.trim() : "",
    email: typeof record.email === "string" ? record.email.trim() : "",
    createdAt:
      typeof record.createdAt === "string" ? record.createdAt.trim() : null,
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt.trim() : null,
    avatarUrl:
      typeof record.avatarUrl === "string" && record.avatarUrl.trim()
        ? record.avatarUrl.trim()
        : null,
  };
}

function mapAuthFetchError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error("Unable to reach the authenticated API.");
}

export async function getOwnUserProfile(): Promise<UserProfile> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/profile");
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await readJson(response);
  const parsed = parseUserProfile(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

export async function upsertOwnUserProfile(input: {
  displayName: string;
}): Promise<UserProfile> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName: input.displayName.trim(),
      }),
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 400) {
    throw new Error(parseErrorMessage(payload, "Invalid display name."));
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const parsed = parseUserProfile(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

export async function getUserProfilesForUids(
  uids: readonly string[],
): Promise<UserProfile[]> {
  const unique = [...new Set(uids.map((item) => item.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return [];
  }

  const query = encodeURIComponent(unique.join(","));
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/user-profiles?uids=${query}`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await readJson(response);

  if (!Array.isArray(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload
    .map((item) => parseUserProfile(item))
    .filter((item): item is UserProfile => item !== null);
}

export type UserAvatarUploadUrlResponse = {
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

function parseUserAvatarUploadUrlResponse(
  value: unknown,
): UserAvatarUploadUrlResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.uploadUrl) ||
    !isNonEmptyString(record.objectPath) ||
    !isNonEmptyString(record.contentType) ||
    !isNonEmptyString(record.expiresAt)
  ) {
    return null;
  }

  return {
    uploadUrl: record.uploadUrl.trim(),
    objectPath: record.objectPath.trim(),
    contentType: record.contentType.trim(),
    expiresAt: record.expiresAt.trim(),
  };
}

export async function requestUserAvatarUploadUrl(input: {
  contentType: string;
  signal?: AbortSignal;
}): Promise<UserAvatarUploadUrlResponse> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/profile/avatar/upload-url", {
      method: "POST",
      body: JSON.stringify({
        contentType: input.contentType.trim(),
      }),
      signal: input.signal,
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 400) {
    throw new Error(parseErrorMessage(payload, "Invalid avatar upload request."));
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const parsed = parseUserAvatarUploadUrlResponse(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

export async function commitUserAvatar(input: {
  objectPath: string;
  contentType: string;
  signal?: AbortSignal;
}): Promise<UserProfile> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/profile/avatar", {
      method: "PUT",
      body: JSON.stringify({
        objectPath: input.objectPath.trim(),
        contentType: input.contentType.trim(),
      }),
      signal: input.signal,
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 400) {
    throw new Error(parseErrorMessage(payload, "Invalid avatar upload."));
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const parsed = parseUserProfile(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

export async function removeUserAvatar(
  signal?: AbortSignal,
): Promise<UserProfile> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/profile/avatar", {
      method: "DELETE",
      signal,
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  const payload = await readJson(response);

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const parsed = parseUserProfile(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}
