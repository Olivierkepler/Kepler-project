/**
 * Phase Feed 2E — push device registration + Expo push delivery.
 *
 * Run: npx tsx src/scripts/phaseFeed2EPushNotificationTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Notification } from "../domain/notification.js";
import { buildNotificationId } from "../domain/notification.js";
import { buildPushDeviceId } from "../domain/pushDevice.js";
import {
  createNotificationIfAbsent,
} from "../repositories/notificationsRepository.js";
import {
  disablePushDeviceForUser,
  listActivePushDevicesForUser,
  upsertPushDeviceForUser,
} from "../repositories/pushDevicesRepository.js";
import {
  buildExpoPushMessages,
  chunkMessages,
  isInvalidExpoTokenError,
  sendPushForNotification,
  trySendPushForNotification,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "../services/notifications/pushDeliveryService.js";
import { notifyProjectFeedPostCreated } from "../services/notifications/feedNotificationService.js";
import type { FeedPost } from "../domain/feedPost.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteFeedPostId } from "../domain/feedPostId.js";

const USER_A = "phase-feed2e-user-a";
const USER_B = "phase-feed2e-user-b";
const TOKEN_A1 = "ExponentPushToken[phase2e-a1]";
const TOKEN_A2 = "ExponentPushToken[phase2e-a2]";
const TOKEN_B1 = "ExponentPushToken[phase2e-b1]";
const TOKEN_INVALID = "ExponentPushToken[phase2e-invalid]";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup(): Promise<void> {
  const tokens = [TOKEN_A1, TOKEN_A2, TOKEN_B1, TOKEN_INVALID];
  await Promise.all(
    tokens.map((token) =>
      db.collection(COLLECTIONS.pushDevices).doc(buildPushDeviceId(token)).delete(),
    ),
  );

  const notifs = await db.collection(COLLECTIONS.notifications).get();
  await Promise.all(
    notifs.docs
      .filter((doc) => {
        const recipient = (doc.data() as { recipientUid?: string }).recipientUid;
        return recipient === USER_A || recipient === USER_B;
      })
      .map((doc) => doc.ref.delete()),
  );
}

function makeNotification(input: {
  recipientUid: string;
  idSuffix: string;
  title?: string;
  body?: string;
}): Notification {
  const sourceKey = `feed-post:phase2e-${input.idSuffix}`;
  return {
    id: buildNotificationId(sourceKey, input.recipientUid),
    recipientUid: input.recipientUid,
    projectId: "project-phase2e",
    activityEventId: sourceKey,
    type: "project_update",
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    destination: {
      kind: "feed_post",
      projectId: "project-phase2e",
      postId: `phase2e-${input.idSuffix}`,
    },
    title: input.title ?? "New project update",
    body: input.body ?? "Someone posted in Test Project",
    projectName: "Test Project",
  };
}

async function main(): Promise<void> {
  await cleanup();

  try {
    const deviceA1 = await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_A1,
        platform: "ios",
        deviceName: "iPhone A",
      },
    });
    assert(deviceA1.userId === USER_A, "authenticated user owns registration");
    assert(deviceA1.disabledAt === null, "new device is active");
    assert(
      deviceA1.id === buildPushDeviceId(TOKEN_A1),
      "device id derived from token",
    );

    const deviceA1Again = await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_A1,
        platform: "ios",
        deviceName: "iPhone A renamed",
      },
    });
    assert(deviceA1Again.id === deviceA1.id, "token upsert is idempotent");
    assert(
      deviceA1Again.deviceName === "iPhone A renamed",
      "upsert updates metadata",
    );

    const deviceA2 = await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_A2,
        platform: "android",
        deviceName: "Pixel A",
      },
    });

    const activeForA = await listActivePushDevicesForUser(USER_A);
    assert(activeForA.length === 2, "same user can have multiple active devices");

    const moved = await upsertPushDeviceForUser({
      userId: USER_B,
      registration: {
        expoPushToken: TOKEN_A1,
        platform: "ios",
        deviceName: "iPhone now B",
      },
    });
    assert(moved.userId === USER_B, "token reassigns via authenticated re-registration");
    assert(moved.id === deviceA1.id, "same token keeps same document id");

    const activeForAAfterMove = await listActivePushDevicesForUser(USER_A);
    assert(
      activeForAAfterMove.every((item) => item.expoPushToken !== TOKEN_A1),
      "previous owner no longer has moved token",
    );

    await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_A1,
        platform: "ios",
        deviceName: "iPhone A again",
      },
    });

    const forbidden = await disablePushDeviceForUser({
      deviceId: buildPushDeviceId(TOKEN_A1),
      userId: USER_B,
    });
    assert(
      forbidden.kind === "forbidden",
      "user cannot unregister another user's device",
    );

    const disabled = await disablePushDeviceForUser({
      deviceId: buildPushDeviceId(TOKEN_A1),
      userId: USER_A,
    });
    assert(disabled.kind === "ok", "user can unregister own token");
    if (disabled.kind !== "ok") {
      throw new Error("expected ok disable result");
    }
    assert(disabled.device.disabledAt !== null, "logout/disable sets disabledAt");

    const disabledAgain = await disablePushDeviceForUser({
      deviceId: buildPushDeviceId(TOKEN_A1),
      userId: USER_A,
    });
    assert(
      disabledAgain.kind === "ok" && disabledAgain.alreadyDisabled,
      "disable is idempotent",
    );

    const activeAfterDisable = await listActivePushDevicesForUser(USER_A);
    assert(
      !activeAfterDisable.some((item) => item.expoPushToken === TOKEN_A1),
      "inactive tokens excluded from delivery",
    );
    assert(
      activeAfterDisable.some((item) => item.expoPushToken === TOKEN_A2),
      "other devices remain active",
    );

    await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_A1,
        platform: "ios",
        deviceName: "iPhone A",
      },
    });
    await upsertPushDeviceForUser({
      userId: USER_A,
      registration: {
        expoPushToken: TOKEN_INVALID,
        platform: "ios",
        deviceName: "Bad token device",
      },
    });

    const notification = makeNotification({
      recipientUid: USER_A,
      idSuffix: "push-1",
    });
    const created = await createNotificationIfAbsent(notification);
    assert(created.created, "persisted notification created");

    const sentBatches: ExpoPushMessage[][] = [];
    const result = await sendPushForNotification(created.notification, {
      send: async (messages) => {
        sentBatches.push(messages);
        return messages.map((message): ExpoPushTicket => {
          if (message.to === TOKEN_INVALID) {
            return {
              status: "error",
              message: "Device not registered",
              details: { error: "DeviceNotRegistered" },
            };
          }
          return { status: "ok", id: `ticket-${message.to}` };
        });
      },
    });

    assert(result.attempted >= 2, "multiple devices produce multiple messages");
    assert(sentBatches.length >= 1, "persisted notification triggers push attempt");

    const flat = sentBatches.flat();
    for (const message of flat) {
      assert(
        typeof message.data.notificationId === "string" &&
          message.data.notificationId === created.notification.id,
        "push payload contains notificationId",
      );
      assert(
        !("storageKey" in message.data) &&
          !("commentBody" in message.data) &&
          !("mediaUrl" in message.data),
        "payload excludes sensitive resource data",
      );
    }

    const invalidStill = await listActivePushDevicesForUser(USER_A);
    assert(
      !invalidStill.some((item) => item.expoPushToken === TOKEN_INVALID),
      "invalid token becomes disabled",
    );

    const stillThere = await createNotificationIfAbsent(notification);
    assert(!stillThere.created, "notification remains after push");
    assert(
      stillThere.notification.id === created.notification.id,
      "push failure does not delete notification",
    );

    let throwCount = 0;
    const pushFailed = await trySendPushForNotification(created.notification, {
      send: async () => {
        throwCount += 1;
        throw new Error("Expo unavailable");
      },
    });
    assert(pushFailed === null, "push failure swallowed by trySend");
    assert(throwCount === 1, "push sender invoked");

    const afterFailure = await createNotificationIfAbsent(notification);
    assert(
      afterFailure.notification.id === created.notification.id,
      "push failure does not affect persisted notification",
    );

    const empty = await sendPushForNotification(
      makeNotification({ recipientUid: USER_B, idSuffix: "no-device" }),
      {
        send: async () => {
          throw new Error("should not send");
        },
      },
    );
    assert(empty.attempted === 0, "no active device → no failure");

    const messages = buildExpoPushMessages({
      notification: created.notification,
      devices: await listActivePushDevicesForUser(USER_A),
    });
    assert(
      chunkMessages(messages, 1).length === messages.length,
      "batching respects Expo limits",
    );
    assert(
      isInvalidExpoTokenError({
        status: "error",
        details: { error: "DeviceNotRegistered" },
      }),
      "DeviceNotRegistered treated as invalid",
    );

    // Feed post create path: push failure must not fail notification creation.
    const projectId = createRemoteProjectId(USER_A, "project-feed2e-push");
    const project: Project = {
      id: projectId,
      localProjectId: "project-feed2e-push",
      name: "Feed2E Push",
      location: "Boston",
      status: "active",
      progress: 0,
      openDeltas: 0,
      assignedTasks: 0,
      ownerUid: USER_A,
    };
    await db.collection(COLLECTIONS.projects).doc(projectId).set(project);
    await db.collection(COLLECTIONS.projectMembers).doc(
      createProjectMemberId(projectId, USER_B),
    ).set({
      id: createProjectMemberId(projectId, USER_B),
      projectId,
      userId: USER_B,
      role: "field_member",
      status: "active",
      invitedBy: USER_A,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const postId = createRemoteFeedPostId(projectId, "post-push-1");
    const post: FeedPost = {
      id: postId,
      projectId,
      authorUserId: USER_A,
      text: "Push path test",
      locationLabel: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      media: [],
      acknowledgementCount: 0,
      commentCount: 0,
    };

    await upsertPushDeviceForUser({
      userId: USER_B,
      registration: {
        expoPushToken: TOKEN_B1,
        platform: "ios",
        deviceName: "B phone",
      },
    });

    const createdCount = await notifyProjectFeedPostCreated({
      post,
      project,
      authorDisplayName: "Author A",
    });
    assert(createdCount === 1, "member receives notification; author excluded");

    const authorNotifs = await db
      .collection(COLLECTIONS.notifications)
      .where("recipientUid", "==", USER_A)
      .get();
    const selfFeed = authorNotifs.docs.filter((doc) => {
      const data = doc.data() as { type?: string; activityEventId?: string };
      return (
        data.type === "project_update" &&
        data.activityEventId === `feed-post:${postId}`
      );
    });
    assert(
      selfFeed.length === 0,
      "self-actions still generate no notification/push",
    );

    const retryCount = await notifyProjectFeedPostCreated({
      post,
      project,
      authorDisplayName: "Author A",
    });
    assert(
      retryCount === 0,
      "duplicate notification retry does not recreate rows",
    );

    await db.collection(COLLECTIONS.projects).doc(projectId).delete();
    await db
      .collection(COLLECTIONS.projectMembers)
      .doc(createProjectMemberId(projectId, USER_B))
      .delete();

    const projectNotifs = await db
      .collection(COLLECTIONS.notifications)
      .where("projectId", "==", projectId)
      .get();
    await Promise.all(projectNotifs.docs.map((doc) => doc.ref.delete()));

    console.log("phaseFeed2EPushNotificationTest: PASS");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error("phaseFeed2EPushNotificationTest failed:");
  console.error(error);
  process.exit(1);
});
