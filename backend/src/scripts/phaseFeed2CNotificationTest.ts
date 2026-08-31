/**
 * Phase Feed 2C — in-app feed notifications.
 *
 * Run: npx tsx src/scripts/phaseFeed2CNotificationTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { FeedPost } from "../domain/feedPost.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import {
  buildFeedPostSourceEventKey,
  buildNotificationId,
} from "../domain/notification.js";
import {
  countUnreadNotifications,
  listNotificationsForRecipient,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notificationsRepository.js";
import { createProjectFeedPostComment } from "../services/feed/feedEngagementService.js";
import {
  createProjectFeedPost,
  getAuthorizedProjectFeedPost,
} from "../services/feed/feedService.js";
import { notifyProjectFeedPostCreated } from "../services/notifications/feedNotificationService.js";

const OWNER_UID = "phase-feed2c-owner-uid";
const WRITER_UID = "phase-feed2c-writer-uid";
const VIEWER_UID = "phase-feed2c-viewer-uid";
const OUTSIDER_UID = "phase-feed2c-outsider-uid";
const LOCAL_PROJECT = "project-feed2c-boston";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function seedProject(input: {
  localProjectId: string;
  ownerUid: string;
}): Promise<Project> {
  const id = createRemoteProjectId(input.ownerUid, input.localProjectId);
  const project: Project = {
    id,
    localProjectId: input.localProjectId,
    name: `Feed2C ${input.localProjectId}`,
    location: "Boston, MA",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: input.ownerUid,
  };
  await db.collection(COLLECTIONS.projects).doc(project.id).set(project);
  return project;
}

async function seedMember(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: "active" | "invited" | "removed";
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: input.status,
    invitedBy: OWNER_UID,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function cleanup(projectId: string): Promise<void> {
  const notifSnap = await db.collection(COLLECTIONS.notifications).get();
  await Promise.all(
    notifSnap.docs
      .filter(
        (doc) =>
          (doc.data() as { projectId?: string }).projectId === projectId,
      )
      .map((doc) => doc.ref.delete()),
  );

  const posts = await db
    .collection(COLLECTIONS.feedPosts)
    .where("projectId", "==", projectId)
    .get();
  for (const doc of posts.docs) {
    await doc.ref.delete();
  }

  const comments = await db
    .collection(COLLECTIONS.feedPostComments)
    .where("projectId", "==", projectId)
    .get();
  for (const doc of comments.docs) {
    await doc.ref.delete();
  }

  const members = await db
    .collection(COLLECTIONS.projectMembers)
    .where("projectId", "==", projectId)
    .get();
  for (const doc of members.docs) {
    await doc.ref.delete();
  }

  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

async function expectDenied(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected denial`);
  } catch (error) {
    assert(
      error instanceof ProjectAccessError,
      `${label}: expected ProjectAccessError, got ${
        error instanceof Error ? error.name : typeof error
      }`,
    );
  }
}

async function loadPost(postId: string): Promise<FeedPost> {
  const snapshot = await db.collection(COLLECTIONS.feedPosts).doc(postId).get();
  const data = snapshot.data();
  assert(data !== undefined, "post persisted");
  return data as FeedPost;
}

async function main(): Promise<void> {
  const project = await seedProject({
    localProjectId: LOCAL_PROJECT,
    ownerUid: OWNER_UID,
  });

  await seedMember({
    projectId: project.id,
    userId: WRITER_UID,
    role: "field_member",
    status: "active",
  });

  await seedMember({
    projectId: project.id,
    userId: VIEWER_UID,
    role: "viewer",
    status: "active",
  });

  try {
    const post = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: OWNER_UID,
      body: {
        localPostId: "post-notify-1",
        text: "Concrete pour complete.",
        locationLabel: null,
        media: [],
      },
    });

    const postRecord = await loadPost(post.id);

    const ownerNotifs = await listNotificationsForRecipient(OWNER_UID, {
      limit: 30,
    });
    assert(
      ownerNotifs.items.every((item) => item.type !== "project_update"),
      "author excluded from own post notification",
    );

    const writerNotifs = await listNotificationsForRecipient(WRITER_UID, {
      limit: 30,
    });
    assert(
      writerNotifs.items.every((item) => item.recipientUid === WRITER_UID),
      "notification list only returns current user's notifications",
    );
    assert(
      writerNotifs.items.some(
        (item) =>
          item.type === "project_update" &&
          item.destination.kind === "feed_post" &&
          item.destination.postId === post.id &&
          item.projectId === project.id,
      ),
      "project member receives project update notification",
    );

    const outsiderNotifs = await listNotificationsForRecipient(OUTSIDER_UID, {
      limit: 30,
    });
    assert(
      outsiderNotifs.items.length === 0,
      "unauthorized/non-member does not receive notification",
    );

    const sourceKey = buildFeedPostSourceEventKey(post.id);
    const retryCount = await notifyProjectFeedPostCreated({
      post: postRecord,
      project,
      authorDisplayName: "Owner User",
    });
    assert(
      retryCount === 0,
      "retry/idempotency does not duplicate notifications",
    );

    await createProjectFeedPostComment({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
      body: { text: "Looks great." },
    });

    const authorCommentNotifs = await listNotificationsForRecipient(OWNER_UID, {
      limit: 30,
    });
    assert(
      authorCommentNotifs.items.some((item) => item.type === "feed_comment"),
      "post author receives another user's comment notification",
    );

    const commentCountBefore = authorCommentNotifs.items.filter(
      (item) => item.type === "feed_comment",
    ).length;

    await createProjectFeedPostComment({
      projectId: project.id,
      postId: post.id,
      uid: OWNER_UID,
      body: { text: "Thanks all." },
    });

    const ownerAfterSelfComment = await listNotificationsForRecipient(OWNER_UID, {
      limit: 30,
    });
    const commentCountAfter = ownerAfterSelfComment.items.filter(
      (item) => item.type === "feed_comment",
    ).length;
    assert(
      commentCountAfter === commentCountBefore,
      "self-comment does not create self notification",
    );

    const writerUnreadBefore = await countUnreadNotifications(WRITER_UID);
    assert(writerUnreadBefore >= 1, "unread count correct");

    const writerNotificationId = buildNotificationId(sourceKey, WRITER_UID);

    const forbiddenRead = await markNotificationRead(
      writerNotificationId,
      OWNER_UID,
    );
    assert(
      forbiddenRead.kind === "forbidden",
      "one user cannot mark another user's notification read",
    );

    const ownerForbidden = await markNotificationRead(
      writerNotificationId,
      OWNER_UID,
    );
    assert(
      ownerForbidden.kind === "forbidden",
      "one user cannot read another user's notification",
    );

    const markResult = await markNotificationRead(
      writerNotificationId,
      WRITER_UID,
    );
    assert(markResult.kind === "ok", "writer can mark own notification read");

    const markAgain = await markNotificationRead(
      writerNotificationId,
      WRITER_UID,
    );
    assert(markAgain.kind === "ok", "mark-read idempotent");

    const writerUnreadAfterOne = await countUnreadNotifications(WRITER_UID);
    assert(
      writerUnreadAfterOne === writerUnreadBefore - 1,
      "unread count decrements after mark read",
    );

    await markAllNotificationsRead(VIEWER_UID);
    const viewerUnread = await countUnreadNotifications(VIEWER_UID);
    assert(viewerUnread === 0, "mark-all-read affects only current user");

    const ownerUnread = await countUnreadNotifications(OWNER_UID);
    assert(ownerUnread > 0, "mark-all-read does not affect other users");

    const page = await listNotificationsForRecipient(OWNER_UID, { limit: 30 });
    assert(page.items.length >= 1, "owner notification list populated");
    for (let index = 1; index < page.items.length; index += 1) {
      const prev = page.items[index - 1]!;
      const current = page.items[index]!;
      assert(
        prev.createdAt.localeCompare(current.createdAt) >= 0,
        "pagination newest-first",
      );
    }

    await seedMember({
      projectId: project.id,
      userId: OUTSIDER_UID,
      role: "viewer",
      status: "removed",
    });

    await expectDenied("removed member cannot use notification target", () =>
      getAuthorizedProjectFeedPost({
        projectId: project.id,
        postId: post.id,
        uid: OUTSIDER_UID,
      }).then((value) => {
        if (!value) {
          throw new ProjectAccessError("Post not found", 404);
        }
        return value;
      }),
    );

    console.log("phaseFeed2CNotificationTest: PASS");
  } finally {
    await cleanup(project.id);
  }
}

main().catch((error) => {
  console.error("phaseFeed2CNotificationTest failed:");
  console.error(error);
  process.exit(1);
});
