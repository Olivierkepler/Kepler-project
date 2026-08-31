import type { ActivityEvent } from "../../domain/activityEvent.js";
import {
  buildNotificationId,
  type Notification,
} from "../../domain/notification.js";
import {
  createActivityEventIfAbsent,
} from "../../repositories/activityEventsRepository.js";
import {
  createNotificationIfAbsent,
} from "../../repositories/notificationsRepository.js";
import {
  resolveNotificationRecipients,
  type ActivityNotificationPolicyContext,
} from "./activityNotificationPolicy.js";
import { trySendPushForNotification } from "../notifications/pushDeliveryService.js";

export type RecordActivityAndNotificationsResult = {
  activityEvent: ActivityEvent;
  activityCreated: boolean;
  notificationsCreated: number;
};

/**
 * Creates Activity if absent. On newly created Activity only, derives and
 * creates Notifications. Failures should be caught by callers — domain
 * mutations must not roll back.
 */
export async function recordActivityAndNotifications(
  candidate: ActivityEvent,
  policyContext: ActivityNotificationPolicyContext,
): Promise<RecordActivityAndNotificationsResult> {
  const { created, activityEvent } =
    await createActivityEventIfAbsent(candidate);

  if (!created) {
    return {
      activityEvent,
      activityCreated: false,
      notificationsCreated: 0,
    };
  }

  const instructions = resolveNotificationRecipients(
    activityEvent,
    policyContext,
  );

  let notificationsCreated = 0;

  for (const instruction of instructions) {
    const notification: Notification = {
      id: buildNotificationId(
        activityEvent.id,
        instruction.recipientUid,
      ),
      recipientUid: instruction.recipientUid,
      projectId: activityEvent.projectId,
      activityEventId: activityEvent.id,
      type: activityEvent.type,
      isRead: false,
      readAt: null,
      createdAt: activityEvent.createdAt,
      destination: instruction.destination,
    };

    const result = await createNotificationIfAbsent(notification);
    if (result.created) {
      notificationsCreated += 1;
      void trySendPushForNotification(result.notification);
    }
  }

  return {
    activityEvent,
    activityCreated: true,
    notificationsCreated,
  };
}

/**
 * Best-effort wrapper: logs and swallows Activity/Notification failures.
 */
export async function tryRecordActivityAndNotifications(
  candidate: ActivityEvent,
  policyContext: ActivityNotificationPolicyContext,
): Promise<RecordActivityAndNotificationsResult | null> {
  try {
    return await recordActivityAndNotifications(candidate, policyContext);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "activity_projection_failed",
        projectId: candidate.projectId,
        activityType: candidate.type,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }
}
