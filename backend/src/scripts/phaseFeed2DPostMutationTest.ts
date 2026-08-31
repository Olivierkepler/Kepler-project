/**
 * Phase Feed 2D — author-owned post edit/delete.
 *
 * Run: npx tsx src/scripts/phaseFeed2DPostMutationTest.ts
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
  FeedConflictError,
  FeedValidationError,
  createProjectFeedPost,
  deleteAuthorProjectFeedPost,
  editAuthorProjectFeedPost,
  getAuthorizedProjectFeedPost,
  getFeedMediaForAuthorizedRead,
  listAuthorizedCombinedFeed,
  listAuthorizedProjectFeed,
} from "../services/feed/feedService.js";
import {
  acknowledgeProjectFeedPost,
  createProjectFeedPostComment,
} from "../services/feed/feedEngagementService.js";
import { buildFeedMediaObjectPath } from "../storage/feedMediaStorage.js";

const OWNER_UID = "phase-feed2d-owner-uid";
const WRITER_UID = "phase-feed2d-writer-uid";
const VIEWER_UID = "phase-feed2d-viewer-uid";
const OUTSIDER_UID = "phase-feed2d-outsider-uid";
const LOCAL_PROJECT = "project-feed2d-boston";

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
    name: `Feed2D ${input.localProjectId}`,
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
  const activity = await db
    .collection(COLLECTIONS.activityEvents)
    .where("projectId", "==", projectId)
    .get();
  for (const doc of activity.docs) {
    await doc.ref.delete();
  }

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
  expected:
    | typeof ProjectAccessError
    | typeof FeedValidationError
    | typeof FeedConflictError = ProjectAccessError,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected denial`);
  } catch (error) {
    assert(
      error instanceof expected,
      `${label}: expected ${expected.name}, got ${
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
    const textPost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: OWNER_UID,
      body: {
        localPostId: "post-edit-1",
        text: "Initial update text.",
        locationLabel: "Level 2",
        media: [],
      },
    });

    const mediaObjectPath = buildFeedMediaObjectPath({
      ownerUid: project.ownerUid,
      projectId: project.id,
      localPostId: "post-media-1",
      localMediaId: "media-1",
      contentType: "image/jpeg",
    });

    const mediaPost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: WRITER_UID,
      body: {
        localPostId: "post-media-1",
        text: "Photo caption",
        locationLabel: null,
        media: [
          {
            localMediaId: "media-1",
            type: "image",
            objectPath: mediaObjectPath,
            contentType: "image/jpeg",
            fileName: "site.jpg",
            width: 800,
            height: 600,
            durationSeconds: null,
          },
        ],
      },
    });

    const originalCreatedAt = textPost.createdAt;
    const originalUpdatedAt = textPost.updatedAt;

    const edited = await editAuthorProjectFeedPost({
      projectId: project.id,
      postId: textPost.id,
      uid: OWNER_UID,
      body: {
        text: "  Revised update text.  ",
        locationLabel: "Level 3",
      },
    });

    assert(edited.text === "Revised update text.", "author can edit own post");
    assert(edited.locationLabel === "Level 3", "location label updated");
    assert(edited.createdAt === originalCreatedAt, "createdAt unchanged");
    assert(edited.updatedAt !== originalUpdatedAt, "updatedAt changes");
    assert(
      edited.acknowledgementCount === textPost.acknowledgementCount,
      "engagement counts preserved on edit",
    );

    const stored = await loadPost(textPost.id);
    assert(stored.authorUserId === OWNER_UID, "authorUserId cannot change");
    assert(stored.projectId === project.id, "projectId cannot change");
    assert(stored.media.length === 0, "media preserved on text-only edit");

    await expectDenied("another member cannot edit", () =>
      editAuthorProjectFeedPost({
        projectId: project.id,
        postId: textPost.id,
        uid: WRITER_UID,
        body: { text: "Hijack" },
      }),
    );

    await expectDenied("viewer cannot edit another user's post", () =>
      editAuthorProjectFeedPost({
        projectId: project.id,
        postId: textPost.id,
        uid: VIEWER_UID,
        body: { text: "Hijack" },
      }),
    );

    await expectDenied("non-member cannot edit", () =>
      editAuthorProjectFeedPost({
        projectId: project.id,
        postId: textPost.id,
        uid: OUTSIDER_UID,
        body: { text: "Hijack" },
      }),
    );

    await expectDenied("project mismatch rejected", () =>
      editAuthorProjectFeedPost({
        projectId: "foreign-project",
        postId: textPost.id,
        uid: OWNER_UID,
        body: { text: "Mismatch" },
      }),
    );

    await expectDenied(
      "empty text rejected when no media",
      () =>
        editAuthorProjectFeedPost({
          projectId: project.id,
          postId: textPost.id,
          uid: OWNER_UID,
          body: { text: "   " },
        }),
      FeedValidationError,
    );

    const clearedText = await editAuthorProjectFeedPost({
      projectId: project.id,
      postId: mediaPost.id,
      uid: WRITER_UID,
      body: { text: "" },
    });
    assert(clearedText.text === "", "empty text allowed when post has media");
    assert(clearedText.media.length === 1, "media preserved");

    await expectDenied(
      "expectedUpdatedAt conflict handled",
      () =>
        editAuthorProjectFeedPost({
          projectId: project.id,
          postId: textPost.id,
          uid: OWNER_UID,
          body: {
            text: "Conflict attempt",
            expectedUpdatedAt: originalUpdatedAt,
          },
        }),
      FeedConflictError,
    );

    const otherPost = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: VIEWER_UID,
      body: {
        localPostId: "post-delete-target",
        text: "Delete me",
        locationLabel: null,
        media: [],
      },
    });

    await deleteAuthorProjectFeedPost({
      projectId: project.id,
      postId: otherPost.id,
      uid: VIEWER_UID,
    });

    await deleteAuthorProjectFeedPost({
      projectId: project.id,
      postId: otherPost.id,
      uid: VIEWER_UID,
    });

    const deletedRecord = await loadPost(otherPost.id);
    assert(Boolean(deletedRecord.deletedAt), "soft delete retains audit record");
    assert(
      deletedRecord.deletedByUserId === VIEWER_UID,
      "deletedByUserId recorded",
    );

    const combined = await listAuthorizedCombinedFeed({
      uid: OWNER_UID,
      limit: 50,
    });
    assert(
      !combined.items.some((item) => item.id === otherPost.id),
      "deleted post excluded from combined feed",
    );

    const projectFeed = await listAuthorizedProjectFeed({
      uid: OWNER_UID,
      projectId: project.id,
      limit: 50,
    });
    assert(
      !projectFeed.items.some((item) => item.id === otherPost.id),
      "deleted post excluded from project feed",
    );

    const single = await getAuthorizedProjectFeedPost({
      projectId: project.id,
      postId: otherPost.id,
      uid: OWNER_UID,
    });
    assert(single === undefined, "single-post endpoint hides deleted content");

    await expectDenied("another member cannot delete", () =>
      deleteAuthorProjectFeedPost({
        projectId: project.id,
        postId: textPost.id,
        uid: WRITER_UID,
      }),
    );

    await expectDenied("non-member cannot delete", () =>
      deleteAuthorProjectFeedPost({
        projectId: project.id,
        postId: textPost.id,
        uid: OUTSIDER_UID,
      }),
    );

    await expectDenied("deleted post cannot be edited", () =>
      editAuthorProjectFeedPost({
        projectId: project.id,
        postId: otherPost.id,
        uid: VIEWER_UID,
        body: { text: "Too late" },
      }),
    );

    await expectDenied("comment creation rejected for deleted post", () =>
      createProjectFeedPostComment({
        projectId: project.id,
        postId: otherPost.id,
        uid: OWNER_UID,
        body: { text: "Comment on deleted" },
      }),
    );

    await expectDenied("acknowledgement rejected for deleted post", () =>
      acknowledgeProjectFeedPost({
        projectId: project.id,
        postId: otherPost.id,
        uid: OWNER_UID,
      }),
    );

    const media = mediaPost.media[0]!;
    const mediaRead = await getFeedMediaForAuthorizedRead({
      projectId: project.id,
      postId: mediaPost.id,
      mediaId: media.id,
    });
    assert(mediaRead !== undefined, "active post media readable");

    await deleteAuthorProjectFeedPost({
      projectId: project.id,
      postId: mediaPost.id,
      uid: WRITER_UID,
    });

    const deletedMediaRead = await getFeedMediaForAuthorizedRead({
      projectId: project.id,
      postId: mediaPost.id,
      mediaId: media.id,
    });
    assert(
      deletedMediaRead === undefined,
      "media read URL lookup rejected for deleted post",
    );

    const activitySnap = await db
      .collection(COLLECTIONS.activityEvents)
      .where("projectId", "==", project.id)
      .get();
    const activityTypes = activitySnap.docs.map(
      (doc) => (doc.data() as { type?: string }).type,
    );
    assert(
      activityTypes.includes("feed_post_edited"),
      "audit event recorded for edit",
    );
    assert(
      activityTypes.includes("feed_post_deleted"),
      "audit event recorded for delete",
    );

    assert(
      combined.items.some((item) => item.id === textPost.id),
      "unrelated posts unaffected",
    );

    console.log("phaseFeed2DPostMutationTest: PASS");
  } finally {
    await cleanup(project.id);
  }
}

main().catch((error) => {
  console.error("phaseFeed2DPostMutationTest failed:");
  console.error(error);
  process.exit(1);
});
