import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { FeedPost } from "../../domain/feedPost.js";
import { isActiveFeedPost } from "../../domain/feedPost.js";
import { MAX_FEED_POST_COMMENT_LENGTH } from "../../domain/feedPost.js";
import { getFeedPostById } from "../../repositories/feedPostsRepository.js";
import { getProjectById } from "../../repositories/projectsRepository.js";
import {
  tryNotifyFeedCommentCreated,
} from "../notifications/feedNotificationService.js";
import {
  acknowledgeFeedPostForUser,
  createFeedPostCommentRecord,
  getAcknowledgedPostIdsForUser,
  listFeedPostCommentsForPost,
  removeFeedPostAcknowledgementForUser,
  type FeedAcknowledgementState,
} from "../../repositories/feedPostEngagementRepository.js";
import { getUserProfilesByUids } from "../../repositories/userProfilesRepository.js";
import { assertFeedReadable } from "./feedAccess.js";
import { FeedValidationError } from "./feedService.js";
import {
  parseFeedPostCommentWriteInput,
  validateFeedPostCommentWriteInput,
} from "../../validation/feedPostComment.js";

export type FeedPostCommentListItem = {
  id: string;
  postId: string;
  projectId: string;
  author: {
    userId: string;
    displayName: string | null;
  };
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedPostCommentPage = {
  items: FeedPostCommentListItem[];
  nextCursor: string | null;
};

async function requireReadableFeedPost(
  projectId: string,
  postId: string,
  uid: string,
): Promise<FeedPost> {
  await assertFeedReadable(projectId, uid);

  const post = await getFeedPostById(postId);

  if (!post || post.projectId !== projectId || !isActiveFeedPost(post)) {
    throw new ProjectAccessError("Post not found", 404);
  }

  return post;
}

export async function acknowledgeProjectFeedPost(input: {
  projectId: string;
  postId: string;
  uid: string;
}): Promise<FeedAcknowledgementState> {
  await requireReadableFeedPost(
    input.projectId,
    input.postId,
    input.uid,
  );

  try {
    return await acknowledgeFeedPostForUser({
      postId: input.postId,
      projectId: input.projectId,
      userId: input.uid,
    });
  } catch {
    throw new ProjectAccessError("Post not found", 404);
  }
}

export async function removeProjectFeedPostAcknowledgement(input: {
  projectId: string;
  postId: string;
  uid: string;
}): Promise<FeedAcknowledgementState> {
  await requireReadableFeedPost(
    input.projectId,
    input.postId,
    input.uid,
  );

  try {
    return await removeFeedPostAcknowledgementForUser({
      postId: input.postId,
      projectId: input.projectId,
      userId: input.uid,
    });
  } catch {
    throw new ProjectAccessError("Post not found", 404);
  }
}

export async function createProjectFeedPostComment(input: {
  projectId: string;
  postId: string;
  uid: string;
  body: unknown;
}): Promise<FeedPostCommentListItem> {
  await requireReadableFeedPost(
    input.projectId,
    input.postId,
    input.uid,
  );

  const parsed = parseFeedPostCommentWriteInput(input.body);

  if (!parsed) {
    throw new FeedValidationError("Invalid comment payload");
  }

  const validationError = validateFeedPostCommentWriteInput(parsed);

  if (validationError) {
    throw new FeedValidationError(validationError);
  }

  const text = parsed.text.trim();

  let created;

  try {
    created = await createFeedPostCommentRecord({
      postId: input.postId,
      projectId: input.projectId,
      authorUserId: input.uid,
      text,
    });
  } catch {
    throw new ProjectAccessError("Post not found", 404);
  }

  const profiles = await getUserProfilesByUids([created.authorUserId]);
  const profile = profiles[0];

  const post = await getFeedPostById(input.postId);
  const project = post
    ? await getProjectById(input.projectId)
    : undefined;

  if (post && project) {
    await tryNotifyFeedCommentCreated({
      comment: created,
      post,
      project,
      authorDisplayName: profile?.displayName?.trim() || null,
    });
  }

  return {
    id: created.id,
    postId: created.postId,
    projectId: created.projectId,
    author: {
      userId: created.authorUserId,
      displayName: profile?.displayName?.trim() || null,
    },
    text: created.text,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function listProjectFeedPostComments(input: {
  projectId: string;
  postId: string;
  uid: string;
  limit: number;
  cursor?: string | null;
}): Promise<FeedPostCommentPage> {
  await requireReadableFeedPost(
    input.projectId,
    input.postId,
    input.uid,
  );

  const page = await listFeedPostCommentsForPost(input.postId, {
    limit: input.limit,
    cursor: input.cursor,
  });

  const authorUids = [
    ...new Set(page.items.map((comment) => comment.authorUserId)),
  ];
  const profiles = await getUserProfilesByUids(authorUids);
  const profileByUid = new Map(
    profiles.map((profile) => [profile.uid, profile] as const),
  );

  return {
    items: page.items.map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      projectId: comment.projectId,
      author: {
        userId: comment.authorUserId,
        displayName:
          profileByUid.get(comment.authorUserId)?.displayName?.trim() ||
          null,
      },
      text: comment.text,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

export async function getAcknowledgedByCurrentUserForPosts(
  postIds: readonly string[],
  uid: string,
): Promise<Set<string>> {
  if (!uid || postIds.length === 0) {
    return new Set();
  }

  return getAcknowledgedPostIdsForUser(postIds, uid);
}

export { MAX_FEED_POST_COMMENT_LENGTH };
