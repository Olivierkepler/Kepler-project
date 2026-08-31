import {
  ACTIVITY_EVENT_TYPES,
  type ActivityEventType,
} from "./activityEvent.js";

/**
 * Feed-driven in-app notification types (Phase 2C).
 */
export const FEED_NOTIFICATION_TYPES = [
  "project_update",
  "feed_comment",
] as const;

export type FeedNotificationType =
  (typeof FEED_NOTIFICATION_TYPES)[number];

/**
 * Canonical product notification categories. Additional types may be
 * emitted later without redesigning storage.
 */
export const CANONICAL_NOTIFICATION_TYPES = [
  "project_update",
  "feed_comment",
  "work_assignment",
  "delta_attention",
  "review_required",
  "project_membership",
] as const;

export type CanonicalNotificationType =
  (typeof CANONICAL_NOTIFICATION_TYPES)[number];

/**
 * Stored notification type: legacy activity projections + feed events.
 */
export type NotificationType =
  | ActivityEventType
  | FeedNotificationType;

export const NOTIFICATION_TYPES = [
  ...ACTIVITY_EVENT_TYPES,
  ...FEED_NOTIFICATION_TYPES,
] as const;

export type NotificationDestination =
  | { kind: "project"; projectId: string }
  | {
      kind: "work_progress";
      projectId: string;
      workPackageId: string;
    }
  | {
      kind: "contribution_review";
      projectId: string;
      measurementId: string;
    }
  | { kind: "delta"; projectId: string; deltaId: string }
  | { kind: "agent_run"; projectId: string; agentRunId: string }
  | { kind: "team"; projectId: string }
  | {
      kind: "feed_post";
      projectId: string;
      postId: string;
    }
  | {
      kind: "feed_comment";
      projectId: string;
      postId: string;
      commentId: string;
    };

/**
 * Per-user inbox item. Read state lives here — never on Activity.
 * activityEventId doubles as a deterministic source/dedupe key for feed events.
 */
export type Notification = {
  id: string;
  recipientUid: string;
  projectId: string;
  activityEventId: string;
  type: NotificationType;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  destination: NotificationDestination;
  title?: string;
  body?: string;
  actorUid?: string;
  actorDisplayName?: string | null;
  projectName?: string;
};

export function buildFeedPostSourceEventKey(postId: string): string {
  const post = postId.trim();
  if (!post) {
    throw new Error("postId is required");
  }
  return `feed-post:${post}`;
}

export function buildFeedCommentSourceEventKey(commentId: string): string {
  const comment = commentId.trim();
  if (!comment) {
    throw new Error("commentId is required");
  }
  return `feed-comment:${comment}`;
}

export function buildNotificationId(
  activityEventId: string,
  recipientUid: string,
): string {
  const activity = activityEventId.trim();
  const recipient = recipientUid.trim();

  if (!activity) {
    throw new Error("activityEventId is required");
  }

  if (!recipient) {
    throw new Error("recipientUid is required");
  }

  return `notif:${activity}:${recipient}`;
}
