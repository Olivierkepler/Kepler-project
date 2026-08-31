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
