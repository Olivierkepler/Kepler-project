import type { FeedPost, FeedPostMedia } from "../domain/feedPost.js";
import {
  MAX_FEED_POST_MEDIA_COUNT,
  MAX_FEED_POST_TEXT_LENGTH,
} from "../domain/feedPost.js";
import {
  feedMediaObjectPathMatchesExpected,
  isAllowedFeedMediaContentType,
} from "../storage/feedMediaStorage.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export type FeedPostEditInput = {
  text: string;
  locationLabel: string | null;
  expectedUpdatedAt?: string | null;
};

function parseEngagementCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export type FeedPostMediaWriteInput = {
  localMediaId: string;
  type: "image" | "video";
  objectPath: string;
  contentType: string;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export type FeedPostWriteInput = {
  localPostId: string;
  text: string;
  locationLabel: string | null;
  media: FeedPostMediaWriteInput[];
};

export type FeedMediaUploadUrlInput = {
  localPostId: string;
  localMediaId: string;
  type: "image" | "video";
  contentType: string;
};

function parseNullableString(
  value: unknown,
): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullableLocalId(
  value: unknown,
): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.includes("/")) {
    return undefined;
  }

  return trimmed;
}

function parseNullableNumber(
  value: unknown,
): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

export function parseFeedMediaUploadUrlInput(
  body: unknown,
): FeedMediaUploadUrlInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const localPostId = parseNullableLocalId(body.localPostId);
  const localMediaId = parseNullableLocalId(body.localMediaId);

  if (
    localPostId === undefined ||
    localPostId === null ||
    localMediaId === undefined ||
    localMediaId === null
  ) {
    return null;
  }

  if (body.type !== "image" && body.type !== "video") {
    return null;
  }

  if (
    typeof body.contentType !== "string" ||
    !isAllowedFeedMediaContentType(body.type, body.contentType)
  ) {
    return null;
  }

  return {
    localPostId,
    localMediaId,
    type: body.type,
    contentType: body.contentType,
  };
}

export function parseFeedPostWriteInput(
  body: unknown,
): FeedPostWriteInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const localPostId = parseNullableLocalId(body.localPostId);

  if (localPostId === undefined || localPostId === null) {
    return null;
  }

  if (typeof body.text !== "string") {
    return null;
  }

  const text = body.text.trim();
  const locationLabel = parseNullableString(body.locationLabel);

  if (locationLabel === undefined) {
    return null;
  }

  if (!Array.isArray(body.media)) {
    return null;
  }

  if (body.media.length > MAX_FEED_POST_MEDIA_COUNT) {
    return null;
  }

  const media: FeedPostMediaWriteInput[] = [];

  for (const entry of body.media) {
    if (!isRecord(entry)) {
      return null;
    }

    const localMediaId = parseNullableLocalId(entry.localMediaId);

    if (localMediaId === undefined || localMediaId === null) {
      return null;
    }

    if (entry.type !== "image" && entry.type !== "video") {
      return null;
    }

    if (
      typeof entry.objectPath !== "string" ||
      entry.objectPath.trim().length === 0
    ) {
      return null;
    }

    if (
      typeof entry.contentType !== "string" ||
      !isAllowedFeedMediaContentType(entry.type, entry.contentType)
    ) {
      return null;
    }

    const fileName = parseNullableString(entry.fileName);
    const width = parseNullableNumber(entry.width);
    const height = parseNullableNumber(entry.height);
    const durationSeconds = parseNullableNumber(entry.durationSeconds);

    if (
      fileName === undefined ||
      width === undefined ||
      height === undefined ||
      durationSeconds === undefined
    ) {
      return null;
    }

    media.push({
      localMediaId,
      type: entry.type,
      objectPath: entry.objectPath.trim(),
      contentType: entry.contentType,
      fileName,
      width,
      height,
      durationSeconds,
    });
  }

  return {
    localPostId,
    text,
    locationLabel,
    media,
  };
}

export function validateFeedPostWriteInput(
  input: FeedPostWriteInput,
): string | null {
  if (input.text.length > MAX_FEED_POST_TEXT_LENGTH) {
    return `Text must be ${MAX_FEED_POST_TEXT_LENGTH} characters or fewer`;
  }

  if (input.text.length === 0 && input.media.length === 0) {
    return "Post must include text or at least one media attachment";
  }

  const mediaIds = new Set<string>();

  for (const item of input.media) {
    if (mediaIds.has(item.localMediaId)) {
      return "Duplicate media id";
    }

    mediaIds.add(item.localMediaId);
  }

  return null;
}

export function parseFeedPostEditInput(
  body: unknown,
): FeedPostEditInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (typeof body.text !== "string") {
    return null;
  }

  const locationLabel = parseNullableString(body.locationLabel);

  if (locationLabel === undefined) {
    return null;
  }

  let expectedUpdatedAt: string | null | undefined;

  if (Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt")) {
    if (
      body.expectedUpdatedAt !== null &&
      typeof body.expectedUpdatedAt !== "string"
    ) {
      return null;
    }

    expectedUpdatedAt =
      body.expectedUpdatedAt === null
        ? null
        : body.expectedUpdatedAt.trim() || null;
  }

  return {
    text: body.text.trim(),
    locationLabel,
    ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
  };
}

export function validateFeedPostEditInput(
  input: FeedPostEditInput,
  existingMediaCount: number,
): string | null {
  if (input.text.length > MAX_FEED_POST_TEXT_LENGTH) {
    return `Text must be ${MAX_FEED_POST_TEXT_LENGTH} characters or fewer`;
  }

  if (input.text.length === 0 && existingMediaCount === 0) {
    return "Post must include text or at least one media attachment";
  }

  return null;
}

export function normalizeFeedPostDocument(
  value: unknown,
): FeedPost | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.authorUserId) ||
    typeof value.text !== "string" ||
    (value.locationLabel !== null &&
      typeof value.locationLabel !== "string") ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt) ||
    !Array.isArray(value.media)
  ) {
    return undefined;
  }

  const media: FeedPostMedia[] = [];

  for (const entry of value.media) {
    if (!isRecord(entry)) {
      return undefined;
    }

    if (
      !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.postId) ||
      !isNonEmptyString(entry.projectId) ||
      (entry.type !== "image" && entry.type !== "video") ||
      !isNonEmptyString(entry.storageKey) ||
      !isNonEmptyString(entry.contentType) ||
      (entry.fileName !== null && typeof entry.fileName !== "string") ||
      (entry.width !== null &&
        (typeof entry.width !== "number" || !Number.isFinite(entry.width))) ||
      (entry.height !== null &&
        (typeof entry.height !== "number" || !Number.isFinite(entry.height))) ||
      (entry.durationSeconds !== null &&
        (typeof entry.durationSeconds !== "number" ||
          !Number.isFinite(entry.durationSeconds))) ||
      !isNonEmptyString(entry.createdAt)
    ) {
      return undefined;
    }

    media.push({
      id: entry.id.trim(),
      postId: entry.postId.trim(),
      projectId: entry.projectId.trim(),
      type: entry.type,
      storageKey: entry.storageKey.trim(),
      contentType: entry.contentType.trim(),
      fileName:
        entry.fileName === null ? null : entry.fileName.trim() || null,
      width: entry.width,
      height: entry.height,
      durationSeconds: entry.durationSeconds,
      createdAt: entry.createdAt.trim(),
    });
  }

  return {
    id: value.id.trim(),
    projectId: value.projectId.trim(),
    authorUserId: value.authorUserId.trim(),
    text: value.text,
    locationLabel:
      value.locationLabel === null
        ? null
        : value.locationLabel.trim() || null,
    createdAt: value.createdAt.trim(),
    updatedAt: value.updatedAt.trim(),
    media,
    acknowledgementCount: parseEngagementCount(
      value.acknowledgementCount,
    ),
    commentCount: parseEngagementCount(value.commentCount),
    ...(typeof value.deletedAt === "string" && value.deletedAt.trim()
      ? {
          deletedAt: value.deletedAt.trim(),
          deletedByUserId:
            typeof value.deletedByUserId === "string" &&
            value.deletedByUserId.trim()
              ? value.deletedByUserId.trim()
              : null,
        }
      : {}),
  };
}

export function assertFeedMediaPathsForPost(input: {
  ownerUid: string;
  projectId: string;
  localPostId: string;
  media: FeedPostMediaWriteInput[];
}): boolean {
  for (const item of input.media) {
    if (
      !feedMediaObjectPathMatchesExpected({
        objectPath: item.objectPath,
        ownerUid: input.ownerUid,
        projectId: input.projectId,
        localPostId: input.localPostId,
        localMediaId: item.localMediaId,
      })
    ) {
      return false;
    }
  }

  return true;
}
