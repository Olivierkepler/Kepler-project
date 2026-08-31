/**
 * Project-scoped feed post (Phase Feed 2A).
 *
 * Human-authored updates visible only to authorized project members.
 * Media metadata is embedded on the post document for Phase 2A simplicity.
 */

export type FeedPostMediaType = "image" | "video";

export type FeedPostMedia = {
  /** Deterministic: `${postId}_${localMediaId}`. */
  id: string;
  postId: string;
  projectId: string;
  type: FeedPostMediaType;
  /** Private GCS object path (storage key). */
  storageKey: string;
  contentType: string;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
};

export type FeedPost = {
  /** Deterministic: `${projectId}_${localPostId}`. */
  id: string;
  projectId: string;
  /** Firebase Auth UID — server-derived on create. */
  authorUserId: string;
  text: string;
  locationLabel: string | null;
  createdAt: string;
  updatedAt: string;
  media: FeedPostMedia[];
  /** Denormalized engagement counts (Phase Feed 2B). */
  acknowledgementCount: number;
  commentCount: number;
  /** Soft-delete audit fields (Phase Feed 2D). */
  deletedAt?: string | null;
  deletedByUserId?: string | null;
};

export function isActiveFeedPost(post: FeedPost): boolean {
  return !post.deletedAt;
}

export const MAX_FEED_POST_TEXT_LENGTH = 2500;

export const MAX_FEED_POST_MEDIA_COUNT = 8;

export const MAX_FEED_POST_COMMENT_LENGTH = 1000;
