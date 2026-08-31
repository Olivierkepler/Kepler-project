import type { ActivityEventType } from "./activityEvent";

export const FEED_NOTIFICATION_TYPES = [
  "project_update",
  "feed_comment",
] as const;

export type FeedNotificationType =
  (typeof FEED_NOTIFICATION_TYPES)[number];

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

export type NotificationType =
  | ActivityEventType
  | FeedNotificationType
  | string;

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

export type RemoteNotification = {
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

export type RemoteNotificationPage = {
  items: RemoteNotification[];
  nextCursor: string | null;
};
