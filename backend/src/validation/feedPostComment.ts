import type {
  FeedPostAcknowledgement,
  FeedPostComment,
} from "../domain/feedPostEngagement.js";
import { MAX_FEED_POST_COMMENT_LENGTH } from "../domain/feedPost.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export type FeedPostCommentWriteInput = {
  text: string;
};

export function parseFeedPostCommentWriteInput(
  body: unknown,
): FeedPostCommentWriteInput | null {
  if (!isRecord(body) || typeof body.text !== "string") {
    return null;
  }

  return { text: body.text };
}

export function validateFeedPostCommentWriteInput(
  input: FeedPostCommentWriteInput,
): string | null {
  const text = input.text.trim();

  if (text.length === 0) {
    return "Comment cannot be empty";
  }

  if (text.length > MAX_FEED_POST_COMMENT_LENGTH) {
    return `Comment must be ${MAX_FEED_POST_COMMENT_LENGTH} characters or fewer`;
  }

  return null;
}

export function normalizeFeedPostAcknowledgementDocument(
  value: unknown,
): FeedPostAcknowledgement | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.postId) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.userId) ||
    !isNonEmptyString(value.createdAt)
  ) {
    return undefined;
  }

  return {
    id: value.id.trim(),
    postId: value.postId.trim(),
    projectId: value.projectId.trim(),
    userId: value.userId.trim(),
    createdAt: value.createdAt.trim(),
  };
}

export function normalizeFeedPostCommentDocument(
  value: unknown,
): FeedPostComment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.postId) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.authorUserId) ||
    typeof value.text !== "string" ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: value.id.trim(),
    postId: value.postId.trim(),
    projectId: value.projectId.trim(),
    authorUserId: value.authorUserId.trim(),
    text: value.text,
    createdAt: value.createdAt.trim(),
    updatedAt: value.updatedAt.trim(),
  };
}
