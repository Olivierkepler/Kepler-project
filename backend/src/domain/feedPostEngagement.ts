/**
 * Feed post acknowledgement + comment records (Phase Feed 2B).
 */

export type FeedPostAcknowledgement = {
  /** `${postId}_${userId}` */
  id: string;
  postId: string;
  projectId: string;
  userId: string;
  createdAt: string;
};

export type FeedPostComment = {
  id: string;
  postId: string;
  projectId: string;
  authorUserId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export function createFeedPostAcknowledgementId(
  postId: string,
  userId: string,
): string {
  const post = postId.trim();
  const user = userId.trim();

  if (!post || !user) {
    throw new Error("Invalid feed acknowledgement id inputs");
  }

  return `${post}_${user}`;
}

/**
 * Format: `feed-comment-${now}-${random}`
 */
export function createFeedPostCommentId(
  now: number = Date.now(),
): string {
  return `feed-comment-${now}-${Math.floor(Math.random() * 100000)}`;
}
