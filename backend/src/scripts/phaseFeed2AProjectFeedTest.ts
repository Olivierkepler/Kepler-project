/**
 * Phase Feed 2A — project feed authorization + persistence.
 *
 * Run: npx tsx src/scripts/phaseFeed2AProjectFeedTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import {
  FeedValidationError,
  createProjectFeedPost,
  listAuthorizedCombinedFeed,
  listAuthorizedProjectFeed,
} from "../services/feed/feedService.js";
import {
  assertFeedReadable,
  assertFeedWritable,
  canCreateFeedPost,
} from "../services/feed/feedAccess.js";
import {
  buildFeedMediaObjectPath,
  feedMediaObjectPathMatchesExpected,
} from "../storage/feedMediaStorage.js";
import { MAX_FEED_POST_TEXT_LENGTH } from "../domain/feedPost.js";

const OWNER_UID = "phase-feed2a-owner-uid";
const WRITER_UID = "phase-feed2a-writer-uid";
const VIEWER_UID = "phase-feed2a-viewer-uid";
const OUTSIDER_UID = "phase-feed2a-outsider-uid";
const LOCAL_PROJECT = "project-feed2a-boston";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
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
      error instanceof ProjectAccessError ||
        error instanceof FeedValidationError,
      `${label}: expected ProjectAccessError or FeedValidationError, got ${
        error instanceof Error ? error.name : typeof error
      }`,
    );
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
    name: `Feed2A ${input.localProjectId}`,
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

async function cleanup(projectIds: string[]): Promise<void> {
  for (const projectId of projectIds) {
    const posts = await db
      .collection(COLLECTIONS.feedPosts)
      .where("projectId", "==", projectId)
      .get();

    for (const doc of posts.docs) {
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
    assert(canCreateFeedPost("field_member"), "field_member can post");
    assert(!canCreateFeedPost("viewer"), "viewer cannot post");

    await assertFeedWritable(project.id, OWNER_UID);
    await assertFeedWritable(project.id, WRITER_UID);

    await expectDenied("viewer cannot write", () =>
      assertFeedWritable(project.id, VIEWER_UID),
    );

    await expectDenied("outsider cannot write", () =>
      assertFeedWritable(project.id, OUTSIDER_UID),
    );

    const textPost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: OWNER_UID,
      body: {
        localPostId: "post-text-1",
        text: "Electrical trim-out completed.",
        locationLabel: "Level 3",
        media: [],
      },
    });

    assert(textPost.author.userId === OWNER_UID, "author from server context");
    assert(textPost.projectId === project.id, "post belongs to project");

    const objectPath = buildFeedMediaObjectPath({
      ownerUid: project.ownerUid,
      projectId: project.id,
      localPostId: "post-media-1",
      localMediaId: "media-1",
      contentType: "image/jpeg",
    });

    assert(
      feedMediaObjectPathMatchesExpected({
        objectPath,
        ownerUid: project.ownerUid,
        projectId: project.id,
        localPostId: "post-media-1",
        localMediaId: "media-1",
      }),
      "media path matches",
    );

    const imagePost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: WRITER_UID,
      body: {
        localPostId: "post-media-1",
        text: "",
        locationLabel: null,
        media: [
          {
            localMediaId: "media-1",
            type: "image",
            objectPath,
            contentType: "image/jpeg",
            fileName: "photo.jpg",
            width: null,
            height: null,
            durationSeconds: null,
          },
        ],
      },
    });

    assert(imagePost.media.length === 1, "image metadata persisted");
    assert(imagePost.media[0]?.type === "image", "image type");

    const videoPath = buildFeedMediaObjectPath({
      ownerUid: project.ownerUid,
      projectId: project.id,
      localPostId: "post-video-1",
      localMediaId: "video-1",
      contentType: "video/mp4",
    });

    const videoPost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: WRITER_UID,
      body: {
        localPostId: "post-video-1",
        text: "Site walkthrough clip",
        locationLabel: null,
        media: [
          {
            localMediaId: "video-1",
            type: "video",
            objectPath: videoPath,
            contentType: "video/mp4",
            fileName: "clip.mp4",
            width: null,
            height: null,
            durationSeconds: 42,
          },
        ],
      },
    });

    assert(videoPost.media[0]?.type === "video", "video metadata");

    await expectDenied("empty post rejected", () =>
      createProjectFeedPost({
        projectId: project.id,
        authorUserId: OWNER_UID,
        body: {
          localPostId: "post-empty",
          text: "",
          locationLabel: null,
          media: [],
        },
      }),
    );

    await expectDenied("text too long rejected", () =>
      createProjectFeedPost({
        projectId: project.id,
        authorUserId: OWNER_UID,
        body: {
          localPostId: "post-long",
          text: "x".repeat(MAX_FEED_POST_TEXT_LENGTH + 1),
          locationLabel: null,
          media: [],
        },
      }),
    );

    const projectFeed = await listAuthorizedProjectFeed({
      uid: WRITER_UID,
      projectId: project.id,
      limit: 10,
    });

    assert(projectFeed.items.length >= 3, "project feed returns posts");
    assert(
      projectFeed.items[0]!.createdAt >= projectFeed.items[1]!.createdAt,
      "newest first ordering",
    );

    const combined = await listAuthorizedCombinedFeed({
      uid: WRITER_UID,
      limit: 2,
    });

    assert(combined.items.length === 2, "pagination limit honored");
    assert(combined.nextCursor !== null, "pagination cursor present");

    const page2 = await listAuthorizedCombinedFeed({
      uid: WRITER_UID,
      limit: 2,
      cursor: combined.nextCursor,
    });

    assert(page2.items.length >= 1, "pagination page 2");

    await assertFeedReadable(project.id, VIEWER_UID);

    await expectDenied("outsider cannot read", () =>
      assertFeedReadable(project.id, OUTSIDER_UID),
    );

  } finally {
    await cleanup([project.id]);
  }

  console.log("phaseFeed2AProjectFeedTest: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
