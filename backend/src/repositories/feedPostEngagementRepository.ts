import { FieldValue } from "firebase-admin/firestore";

import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type {
  FeedPostAcknowledgement,
  FeedPostComment,
} from "../domain/feedPostEngagement.js";
import {
  createFeedPostAcknowledgementId,
  createFeedPostCommentId,
} from "../domain/feedPostEngagement.js";
import type { FeedPost } from "../domain/feedPost.js";
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from "./activityEventsRepository.js";
import { feedPostsCollection } from "./feedPostsRepository.js";
import {
  normalizeFeedPostAcknowledgementDocument,
  normalizeFeedPostCommentDocument,
} from "../validation/feedPostComment.js";

function feedPostAcknowledgementsCollection() {
  return db.collection(COLLECTIONS.feedPostAcknowledgements);
}

function feedPostCommentsCollection() {
  return db.collection(COLLECTIONS.feedPostComments);
}

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

export type FeedAcknowledgementState = {
  acknowledgedByCurrentUser: boolean;
  acknowledgementCount: number;
};

export async function acknowledgeFeedPostForUser(input: {
  postId: string;
  projectId: string;
  userId: string;
}): Promise<FeedAcknowledgementState> {
  requireId(input.postId, "postId");
  requireId(input.projectId, "projectId");
  requireId(input.userId, "userId");

  const postRef = feedPostsCollection().doc(input.postId);
  const acknowledgementId = createFeedPostAcknowledgementId(
    input.postId,
    input.userId,
  );
  const acknowledgementRef =
    feedPostAcknowledgementsCollection().doc(acknowledgementId);

  return db.runTransaction(async (tx) => {
    const postSnap = await tx.get(postRef);

    if (!postSnap.exists) {
      throw new Error("Post not found");
    }

    const post = postSnap.data() as FeedPost;

    if (post.projectId !== input.projectId) {
      throw new Error("Post not found");
    }

    const acknowledgementSnap = await tx.get(acknowledgementRef);
    const currentCount = Math.max(0, post.acknowledgementCount ?? 0);

    if (acknowledgementSnap.exists) {
      return {
        acknowledgedByCurrentUser: true,
        acknowledgementCount: currentCount,
      };
    }

    const createdAt = new Date().toISOString();
    const acknowledgement: FeedPostAcknowledgement = {
      id: acknowledgementId,
      postId: input.postId,
      projectId: input.projectId,
      userId: input.userId,
      createdAt,
    };

    tx.set(acknowledgementRef, acknowledgement);
    tx.update(postRef, {
      acknowledgementCount: FieldValue.increment(1),
    });

    return {
      acknowledgedByCurrentUser: true,
      acknowledgementCount: currentCount + 1,
    };
  });
}

export async function removeFeedPostAcknowledgementForUser(input: {
  postId: string;
  projectId: string;
  userId: string;
}): Promise<FeedAcknowledgementState> {
  requireId(input.postId, "postId");
  requireId(input.projectId, "projectId");
  requireId(input.userId, "userId");

  const postRef = feedPostsCollection().doc(input.postId);
  const acknowledgementId = createFeedPostAcknowledgementId(
    input.postId,
    input.userId,
  );
  const acknowledgementRef =
    feedPostAcknowledgementsCollection().doc(acknowledgementId);

  return db.runTransaction(async (tx) => {
    const postSnap = await tx.get(postRef);

    if (!postSnap.exists) {
      throw new Error("Post not found");
    }

    const post = postSnap.data() as FeedPost;

    if (post.projectId !== input.projectId) {
      throw new Error("Post not found");
    }

    const acknowledgementSnap = await tx.get(acknowledgementRef);
    const currentCount = Math.max(0, post.acknowledgementCount ?? 0);

    if (!acknowledgementSnap.exists) {
      return {
        acknowledgedByCurrentUser: false,
        acknowledgementCount: currentCount,
      };
    }

    tx.delete(acknowledgementRef);

    const nextCount = Math.max(0, currentCount - 1);

    tx.update(postRef, {
      acknowledgementCount: nextCount,
    });

    return {
      acknowledgedByCurrentUser: false,
      acknowledgementCount: nextCount,
    };
  });
}

export async function createFeedPostCommentRecord(input: {
  postId: string;
  projectId: string;
  authorUserId: string;
  text: string;
}): Promise<FeedPostComment> {
  requireId(input.postId, "postId");
  requireId(input.projectId, "projectId");
  requireId(input.authorUserId, "authorUserId");

  const postRef = feedPostsCollection().doc(input.postId);
  const commentId = createFeedPostCommentId();
  const commentRef = feedPostCommentsCollection().doc(commentId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const postSnap = await tx.get(postRef);

    if (!postSnap.exists) {
      throw new Error("Post not found");
    }

    const post = postSnap.data() as FeedPost;

    if (post.projectId !== input.projectId) {
      throw new Error("Post not found");
    }

    const comment: FeedPostComment = {
      id: commentId,
      postId: input.postId,
      projectId: input.projectId,
      authorUserId: input.authorUserId,
      text: input.text,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(commentRef, comment);
    tx.update(postRef, {
      commentCount: FieldValue.increment(1),
    });

    return comment;
  });
}

export type ListFeedPostCommentsPage = {
  items: FeedPostComment[];
  nextCursor: string | null;
};

function sortCommentsOldestFirst(
  items: FeedPostComment[],
): FeedPostComment[] {
  return [...items].sort((a, b) => {
    const timeCmp = a.createdAt.localeCompare(b.createdAt);

    if (timeCmp !== 0) {
      return timeCmp;
    }

    return a.id.localeCompare(b.id);
  });
}

export async function listFeedPostCommentsForPost(
  postId: string,
  options: { limit: number; cursor?: string | null } = { limit: 30 },
): Promise<ListFeedPostCommentsPage> {
  requireId(postId, "postId");

  const limit = Math.min(Math.max(1, options.limit), 100);

  const snapshot = await feedPostCommentsCollection()
    .where("postId", "==", postId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeFeedPostCommentDocument(doc.data()))
    .filter((item): item is FeedPostComment => item !== undefined);

  const sorted = sortCommentsOldestFirst(items);

  let startIndex = 0;

  if (options.cursor) {
    const decoded = decodeActivityCursor(options.cursor);

    if (decoded) {
      const cursorIndex = sorted.findIndex(
        (item) =>
          item.createdAt === decoded.createdAt &&
          item.id === decoded.id,
      );

      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const last = page[page.length - 1];

  return {
    items: page,
    nextCursor:
      startIndex + limit < sorted.length && last
        ? encodeActivityCursor(last.createdAt, last.id)
        : null,
  };
}

export async function getAcknowledgedPostIdsForUser(
  postIds: readonly string[],
  userId: string,
): Promise<Set<string>> {
  if (postIds.length === 0) {
    return new Set();
  }

  requireId(userId, "userId");

  const refs = postIds.map((postId) =>
    feedPostAcknowledgementsCollection().doc(
      createFeedPostAcknowledgementId(postId, userId),
    ),
  );

  const snapshots = await db.getAll(...refs);
  const acknowledged = new Set<string>();

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    const normalized = normalizeFeedPostAcknowledgementDocument(
      snapshot.data(),
    );

    if (normalized) {
      acknowledged.add(normalized.postId);
    }
  }

  return acknowledged;
}
