import {
  MAX_USER_DISPLAY_NAME_LENGTH,
  type UserProfile,
} from "../domain/userProfile.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_USER_DISPLAY_NAME_LENGTH) {
    return undefined;
  }

  return trimmed;
}

export function normalizeUserProfileDocument(
  uid: string,
  data: unknown,
): UserProfile | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.uid) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) {
    return undefined;
  }

  const displayName =
    typeof data.displayName === "string" ? data.displayName.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";

  return {
    uid: data.uid.trim(),
    displayName,
    email,
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
  };
}

export function parseUpsertUserProfileBody(
  body: unknown,
): { displayName: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const displayName = normalizeDisplayName(body.displayName);

  if (!displayName) {
    return undefined;
  }

  return { displayName };
}
