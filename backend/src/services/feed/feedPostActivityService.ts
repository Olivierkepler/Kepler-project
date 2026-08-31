import type { ActivityEvent } from "../../domain/activityEvent.js";
import { buildActivityEventId } from "../../domain/activityEvent.js";
import { createActivityEventIfAbsent } from "../../repositories/activityEventsRepository.js";

async function tryRecordFeedPostActivity(
  activity: ActivityEvent,
  label: string,
): Promise<void> {
  try {
    await createActivityEventIfAbsent(activity);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: label,
        projectId: activity.projectId,
        subjectId: activity.subjectId,
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

export async function tryRecordFeedPostEditedActivity(input: {
  projectId: string;
  postId: string;
  actorUid: string;
  updatedAt: string;
}): Promise<void> {
  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "feed-post-edit",
      sourceId: input.postId,
      suffix: input.updatedAt,
    }),
    projectId: input.projectId,
    type: "feed_post_edited",
    actorType: "human",
    actorUid: input.actorUid,
    subjectType: "feed_post",
    subjectId: input.postId,
    sourceType: "feed_post_edit",
    sourceId: input.postId,
    related: {},
    createdAt: input.updatedAt,
  };

  await tryRecordFeedPostActivity(activity, "feed_post_edited_activity_failed");
}

export async function tryRecordFeedPostDeletedActivity(input: {
  projectId: string;
  postId: string;
  actorUid: string;
  deletedAt: string;
}): Promise<void> {
  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "feed-post-delete",
      sourceId: input.postId,
    }),
    projectId: input.projectId,
    type: "feed_post_deleted",
    actorType: "human",
    actorUid: input.actorUid,
    subjectType: "feed_post",
    subjectId: input.postId,
    sourceType: "feed_post_delete",
    sourceId: input.postId,
    related: {},
    createdAt: input.deletedAt,
  };

  await tryRecordFeedPostActivity(activity, "feed_post_deleted_activity_failed");
}
