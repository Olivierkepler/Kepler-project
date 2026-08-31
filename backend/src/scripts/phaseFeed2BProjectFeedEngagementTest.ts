/**
 * Phase Feed 2B — acknowledgements + comments.
 *
 * Run: npx tsx src/scripts/phaseFeed2BProjectFeedEngagementTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { Project } from "../domain/project.js";
import { MAX_FEED_POST_COMMENT_LENGTH } from "../domain/feedPost.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import {
  acknowledgeProjectFeedPost,
  createProjectFeedPostComment,
  listProjectFeedPostComments,
  removeProjectFeedPostAcknowledgement,
} from "../services/feed/feedEngagementService.js";
import {
  FeedValidationError,
  createProjectFeedPost,
  listAuthorizedCombinedFeed,
} from "../services/feed/feedService.js";

const OWNER_UID = "phase-feed2b-owner-uid";
const WRITER_UID = "phase-feed2b-writer-uid";
const VIEWER_UID = "phase-feed2b-viewer-uid";
const OUTSIDER_UID = "phase-feed2b-outsider-uid";
const LOCAL_PROJECT = "project-feed2b-boston";

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
    name: `Feed2B ${input.localProjectId}`,
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
      const comments = await db
        .collection(COLLECTIONS.feedPostComments)
        .where("postId", "==", doc.id)
        .get();

      for (const comment of comments.docs) {
        await comment.ref.delete();
      }

      const acknowledgements = await db
        .collection(COLLECTIONS.feedPostAcknowledgements)
        .where("postId", "==", doc.id)
        .get();

      for (const acknowledgement of acknowledgements.docs) {
        await acknowledgement.ref.delete();
      }

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
    const post = await createProjectFeedPost({
      projectId: project.id,
      authorUserId: OWNER_UID,
      body: {
        localPostId: "post-engagement-1",
        text: "Drywall inspection complete.",
        locationLabel: null,
        media: [],
      },
    });

    assert(post.acknowledgementCount === 0, "new post acknowledgementCount 0");
    assert(post.commentCount === 0, "new post commentCount 0");
    assert(
      post.acknowledgedByCurrentUser === false,
      "author not auto-acknowledged",
    );

    const firstAck = await acknowledgeProjectFeedPost({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
    });

    assert(firstAck.acknowledgedByCurrentUser, "writer acknowledged");
    assert(firstAck.acknowledgementCount === 1, "count is 1");

    const secondAck = await acknowledgeProjectFeedPost({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
    });

    assert(secondAck.acknowledgedByCurrentUser, "idempotent acknowledge");
    assert(secondAck.acknowledgementCount === 1, "double acknowledge no double-count");

    const viewerAck = await acknowledgeProjectFeedPost({
      projectId: project.id,
      postId: post.id,
      uid: VIEWER_UID,
    });

    assert(viewerAck.acknowledgementCount === 2, "viewer can acknowledge");

    const removedAck = await removeProjectFeedPostAcknowledgement({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
    });

    assert(!removedAck.acknowledgedByCurrentUser, "unacknowledged");
    assert(removedAck.acknowledgementCount === 1, "count decremented");

    const secondRemove = await removeProjectFeedPostAcknowledgement({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
    });

    assert(
      secondRemove.acknowledgementCount === 1,
      "double unacknowledge does not go negative",
    );

    await expectDenied("outsider cannot acknowledge", () =>
      acknowledgeProjectFeedPost({
        projectId: project.id,
        postId: post.id,
        uid: OUTSIDER_UID,
      }),
    );

    await expectDenied("wrong project rejected", () =>
      acknowledgeProjectFeedPost({
        projectId: "wrong-project-id",
        postId: post.id,
        uid: VIEWER_UID,
      }),
    );

    const comment = await createProjectFeedPostComment({
      projectId: project.id,
      postId: post.id,
      uid: VIEWER_UID,
      body: { text: "  Looks good on level 3.  " },
    });

    assert(comment.author.userId === VIEWER_UID, "author from server context");
    assert(comment.text === "Looks good on level 3.", "comment trimmed");
    assert(comment.postId === post.id, "comment belongs to post");
    assert(comment.projectId === project.id, "comment belongs to project");

    await expectDenied("empty comment rejected", () =>
      createProjectFeedPostComment({
        projectId: project.id,
        postId: post.id,
        uid: VIEWER_UID,
        body: { text: "   " },
      }),
    );

    await expectDenied("over-limit comment rejected", () =>
      createProjectFeedPostComment({
        projectId: project.id,
        postId: post.id,
        uid: VIEWER_UID,
        body: { text: "x".repeat(MAX_FEED_POST_COMMENT_LENGTH + 1) },
      }),
    );

    await expectDenied("outsider cannot comment", () =>
      createProjectFeedPostComment({
        projectId: project.id,
        postId: post.id,
        uid: OUTSIDER_UID,
        body: { text: "Should fail" },
      }),
    );

    const secondComment = await createProjectFeedPostComment({
      projectId: project.id,
      postId: post.id,
      uid: WRITER_UID,
      body: { text: "Thanks for the update." },
    });

    const commentsPage = await listProjectFeedPostComments({
      projectId: project.id,
      postId: post.id,
      uid: VIEWER_UID,
      limit: 30,
    });

    assert(commentsPage.items.length === 2, "two comments listed");
    assert(
      commentsPage.items[0]!.id === comment.id,
      "comments oldest-first",
    );
    assert(
      commentsPage.items[1]!.id === secondComment.id,
      "second comment last",
    );

    const feedPage = await listAuthorizedCombinedFeed({
      uid: VIEWER_UID,
      limit: 25,
    });

    const feedPost = feedPage.items.find((item) => item.id === post.id);

    assert(feedPost != null, "feed includes post");

    if (!feedPost) {
      throw new Error("feed includes post");
    }

    assert(feedPost.commentCount === 2, "commentCount on feed item");
    assert(
      feedPost.acknowledgedByCurrentUser === true,
      "acknowledgedByCurrentUser on feed item",
    );
    assert(
      feedPost.acknowledgementCount === 1,
      "acknowledgementCount on feed item",
    );

    const foreignProject = await seedProject({
      localProjectId: "project-feed2b-foreign",
      ownerUid: OUTSIDER_UID,
    });

    const foreignPost = await createProjectFeedPost({
      projectId: foreignProject.id,
      authorUserId: OUTSIDER_UID,
      body: {
        localPostId: "foreign-post",
        text: "Private update",
        locationLabel: null,
        media: [],
      },
    });

    await expectDenied("cannot read foreign comments", () =>
      listProjectFeedPostComments({
        projectId: foreignProject.id,
        postId: foreignPost.id,
        uid: VIEWER_UID,
        limit: 30,
      }),
    );

    await cleanup([project.id, foreignProject.id]);
  } catch (error) {
    await cleanup([project.id]);
    throw error;
  }

  console.log("phaseFeed2BProjectFeedEngagementTest: PASS");
}

main().catch((error) => {
  console.error("phaseFeed2BProjectFeedEngagementTest failed:");
  console.error(error);
  process.exit(1);
});
