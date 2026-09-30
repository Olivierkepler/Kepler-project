import { isRecord } from "./primitives.js";
import { isAllowedUserAvatarContentType } from "../storage/userAvatarStorage.js";

export function parseUserAvatarUploadUrlBody(
  body: unknown,
): { contentType: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";

  if (!contentType || !isAllowedUserAvatarContentType(contentType)) {
    return undefined;
  }

  return { contentType };
}

export function parseUserAvatarCommitBody(
  body: unknown,
): { objectPath: string; contentType: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const objectPath =
    typeof body.objectPath === "string" ? body.objectPath.trim() : "";
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";

  if (!objectPath || !contentType || !isAllowedUserAvatarContentType(contentType)) {
    return undefined;
  }

  return { objectPath, contentType };
}
