import type { FeedPost } from "../../domain/feedPost.js";
import type { FeedPostComment } from "../../domain/feedPostEngagement.js";
import type { Project } from "../../domain/project.js";
import {
  buildFeedCommentSourceEventKey,
  buildFeedPostSourceEventKey,
  buildNotificationId,
  type Notification,
  type NotificationDestination,
} from "../../domain/notification.js";
import { createNotificationIfAbsent } from "../../repositories/notificationsRepository.js";
import { listProjectMembers } from "../../repositories/projectMembersRepository.js";
import { getUserProfilesByUids } from "../../repositories/userProfilesRepository.js";
import { trySendPushForNotification } from "./pushDeliveryService.js";

function formatActorLabel(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Someone";
}

async function listFeedNotificationRecipientUids(
  project: Project,
  excludeUid?: string,
): Promise<string[]> {
  const members = await listProjectMembers(project.id);
  const recipientUids = new Set<string>([project.ownerUid]);

  for (const member of members) {
    if (member.status === "active") {
      recipientUids.add(member.userId);
    }
  }

  if (excludeUid) {
    recipientUids.delete(excludeUid);
  }

  return [...recipientUids];
}

async function createNotificationsForRecipients(input: {
  sourceEventKey: string;
  type: "project_update" | "feed_comment";
  projectId: string;
  projectName: string;
  title: string;
  body: string;
  actorUid: string;
  actorDisplayName: string | null;
  destination: NotificationDestination;
  recipientUids: string[];
  createdAt: string;
}): Promise<number> {
  let notificationsCreated = 0;

  for (const recipientUid of input.recipientUids) {
    const notification: Notification = {
      id: buildNotificationId(input.sourceEventKey, recipientUid),
      recipientUid,
      projectId: input.projectId,
      activityEventId: input.sourceEventKey,
      type: input.type,
      isRead: false,
      readAt: null,
      createdAt: input.createdAt,
      destination: input.destination,
      title: input.title,
      body: input.body,
      actorUid: input.actorUid,
      actorDisplayName: input.actorDisplayName,
      projectName: input.projectName,
    };

    const result = await createNotificationIfAbsent(notification);
    if (result.created) {
      notificationsCreated += 1;
      void trySendPushForNotification(result.notification);
    }
  }

  return notificationsCreated;
}

export async function notifyProjectFeedPostCreated(input: {
  post: FeedPost;
  project: Project;
  authorDisplayName: string | null;
}): Promise<number> {
  const actorLabel = formatActorLabel(input.authorDisplayName);
  const recipientUids = await listFeedNotificationRecipientUids(
    input.project,
    input.post.authorUserId,
  );

  if (recipientUids.length === 0) {
    return 0;
  }

  return createNotificationsForRecipients({
    sourceEventKey: buildFeedPostSourceEventKey(input.post.id),
    type: "project_update",
    projectId: input.project.id,
    projectName: input.project.name,
    title: "New project update",
    body: `${actorLabel} posted in ${input.project.name}`,
    actorUid: input.post.authorUserId,
    actorDisplayName: input.authorDisplayName,
    destination: {
      kind: "feed_post",
      projectId: input.project.id,
      postId: input.post.id,
    },
    recipientUids,
    createdAt: input.post.createdAt,
  });
}

export async function notifyFeedCommentCreated(input: {
  comment: FeedPostComment;
  post: FeedPost;
  project: Project;
  authorDisplayName: string | null;
}): Promise<number> {
  if (input.comment.authorUserId === input.post.authorUserId) {
    return 0;
  }

  const actorLabel = formatActorLabel(input.authorDisplayName);

  return createNotificationsForRecipients({
    sourceEventKey: buildFeedCommentSourceEventKey(input.comment.id),
    type: "feed_comment",
    projectId: input.project.id,
    projectName: input.project.name,
    title: "New comment",
    body: `${actorLabel} commented on your project update`,
    actorUid: input.comment.authorUserId,
    actorDisplayName: input.authorDisplayName,
    destination: {
      kind: "feed_comment",
      projectId: input.project.id,
      postId: input.post.id,
      commentId: input.comment.id,
    },
    recipientUids: [input.post.authorUserId],
    createdAt: input.comment.createdAt,
  });
}

/**
 * Best-effort feed notification fanout. Never throws to callers.
 */
export async function tryNotifyProjectFeedPostCreated(input: {
  post: FeedPost;
  project: Project;
  authorDisplayName: string | null;
}): Promise<void> {
  try {
    await notifyProjectFeedPostCreated(input);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "feed_post_notification_failed",
        projectId: input.project.id,
        postId: input.post.id,
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

export async function tryNotifyFeedCommentCreated(input: {
  comment: FeedPostComment;
  post: FeedPost;
  project: Project;
  authorDisplayName: string | null;
}): Promise<void> {
  try {
    await notifyFeedCommentCreated(input);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "feed_comment_notification_failed",
        projectId: input.project.id,
        postId: input.post.id,
        commentId: input.comment.id,
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

export async function resolveAuthorDisplayName(
  authorUserId: string,
): Promise<string | null> {
  const profiles = await getUserProfilesByUids([authorUserId]);
  return profiles[0]?.displayName?.trim() || null;
}
