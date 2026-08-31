/**
 * Phase Feed 2F — authorized BuildSigma search.
 *
 * Run: npx tsx src/scripts/phaseFeed2FSearchTest.ts
 */

import { AddressInfo } from "node:net";

import "../config/firebase.js";
import { app } from "../app.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { FeedPost } from "../domain/feedPost.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteFeedPostId } from "../domain/feedPostId.js";
import {
  SEARCH_PEOPLE_LIMIT,
  SEARCH_POST_LIMIT,
  SEARCH_PROJECT_LIMIT,
  type BuildSigmaSearchResults,
} from "../domain/search.js";
import { softDeleteFeedPost } from "../repositories/feedPostsRepository.js";
import { getAuthorizedProjectFeedPost } from "../services/feed/feedService.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import {
  normalizeSearchText,
  searchBuildSigmaForUser,
} from "../services/search/searchService.js";

const OWNER_A = "phase-feed2f-owner-a";
const MEMBER_A = "phase-feed2f-member-a";
const OWNER_B = "phase-feed2f-owner-b";
const MEMBER_B = "phase-feed2f-member-b";
const OUTSIDER = "phase-feed2f-outsider";

const LOCAL_A = "project-feed2f-r409";
const LOCAL_B = "project-feed2f-secret";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function seedProject(input: {
  localProjectId: string;
  ownerUid: string;
  name: string;
  location?: string;
}): Promise<Project> {
  const id = createRemoteProjectId(input.ownerUid, input.localProjectId);
  const project: Project = {
    id,
    localProjectId: input.localProjectId,
    name: input.name,
    location: input.location ?? "Boston, MA",
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
  invitedBy: string;
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: input.status,
    invitedBy: input.invitedBy,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function seedProfile(input: {
  uid: string;
  displayName: string;
  email: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.userProfiles).doc(input.uid).set({
    uid: input.uid,
    displayName: input.displayName,
    email: input.email,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedPost(input: {
  projectId: string;
  authorUserId: string;
  localPostId: string;
  text: string;
  withMedia?: boolean;
  deleted?: boolean;
}): Promise<FeedPost> {
  const now = new Date().toISOString();
  const id = createRemoteFeedPostId(input.projectId, input.localPostId);
  const post: FeedPost = {
    id,
    projectId: input.projectId,
    authorUserId: input.authorUserId,
    text: input.text,
    locationLabel: null,
    createdAt: now,
    updatedAt: now,
    media: input.withMedia
      ? [
          {
            id: `${id}_m1`,
            postId: id,
            projectId: input.projectId,
            type: "image",
            storageKey: `feed/${input.projectId}/${id}/private.jpg`,
            contentType: "image/jpeg",
            fileName: "private.jpg",
            width: 100,
            height: 100,
            durationSeconds: null,
            createdAt: now,
          },
        ]
      : [],
    acknowledgementCount: 0,
    commentCount: 0,
    ...(input.deleted
      ? {
          deletedAt: now,
          deletedByUserId: input.authorUserId,
        }
      : {}),
  };

  await db.collection(COLLECTIONS.feedPosts).doc(post.id).set(post);
  return post;
}

async function cleanup(projectIds: string[], uids: string[]): Promise<void> {
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

  for (const uid of uids) {
    await db.collection(COLLECTIONS.userProfiles).doc(uid).delete();
  }
}

function assertNoPrivateMediaLeak(results: BuildSigmaSearchResults): void {
  const serialized = JSON.stringify(results);
  assert(
    !serialized.includes("storageKey"),
    "search must not leak storageKey",
  );
  assert(
    !serialized.includes("uploadUrl"),
    "search must not leak uploadUrl",
  );
  assert(
    !serialized.includes("private.jpg"),
    "search must not leak private media path",
  );
  assert(!serialized.includes("gs://"), "search must not leak gs:// URLs");
  assert(
    !/"email"\s*:/.test(serialized),
    "search must not leak email fields",
  );

  for (const post of results.posts) {
    assert(
      typeof post.hasMedia === "boolean",
      "posts expose hasMedia only",
    );
  }
}

async function requestUnauthenticatedSearch(): Promise<number> {
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/search?q=electrical`,
    );
    return response.status;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function main(): Promise<void> {
  const projectA = await seedProject({
    localProjectId: LOCAL_A,
    ownerUid: OWNER_A,
    name: "R-409 Retro Fit For Store #52",
    location: "Cambridge, MA",
  });

  const projectB = await seedProject({
    localProjectId: LOCAL_B,
    ownerUid: OWNER_B,
    name: "Secret Tower Electrical",
    location: "Private Site",
  });

  const projectIds = [projectA.id, projectB.id];
  const uids = [OWNER_A, MEMBER_A, OWNER_B, MEMBER_B, OUTSIDER];

  try {
    await seedMember({
      projectId: projectA.id,
      userId: OWNER_A,
      role: "owner",
      status: "active",
      invitedBy: OWNER_A,
    });
    await seedMember({
      projectId: projectA.id,
      userId: MEMBER_A,
      role: "field_member",
      status: "active",
      invitedBy: OWNER_A,
    });
    await seedMember({
      projectId: projectB.id,
      userId: OWNER_B,
      role: "owner",
      status: "active",
      invitedBy: OWNER_B,
    });
    await seedMember({
      projectId: projectB.id,
      userId: MEMBER_B,
      role: "contractor",
      status: "active",
      invitedBy: OWNER_B,
    });

    await seedProfile({
      uid: OWNER_A,
      displayName: "Alex Owner",
      email: "alex-owner-2f@example.com",
    });
    await seedProfile({
      uid: MEMBER_A,
      displayName: "Vandrick Andrade",
      email: "vandrick-2f@example.com",
    });
    await seedProfile({
      uid: OWNER_B,
      displayName: "Blake Secret",
      email: "blake-2f@example.com",
    });
    await seedProfile({
      uid: MEMBER_B,
      displayName: "Hidden Member",
      email: "hidden-2f@example.com",
    });

    const visiblePost = await seedPost({
      projectId: projectA.id,
      authorUserId: MEMBER_A,
      localPostId: "post-visible",
      text: "Electrical rough-in completed on level 2",
      withMedia: true,
    });

    const secretPost = await seedPost({
      projectId: projectB.id,
      authorUserId: MEMBER_B,
      localPostId: "post-secret",
      text: "Electrical rough-in completed in secret tower",
      withMedia: true,
    });

    const deletedPost = await seedPost({
      projectId: projectA.id,
      authorUserId: OWNER_A,
      localPostId: "post-deleted",
      text: "Electrical temporary note that was deleted",
      deleted: true,
    });

    // 1. unauthenticated search rejected
    const unauthStatus = await requestUnauthenticatedSearch();
    assert(unauthStatus === 401, `unauth expected 401, got ${unauthStatus}`);
    console.log("PASS 1 unauthenticated search rejected");

    // 9. query normalization
    assert(
      normalizeSearchText("  R-409   Retro  ") === "r-409 retro",
      "normalize collapses whitespace / lowercases",
    );
    assert(
      normalizeSearchText("Store #52").includes("#52"),
      "normalize preserves # identifiers",
    );
    console.log("PASS 9 query normalization");

    // 10. minimum / empty query
    const empty = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: " ",
    });
    assert(
      empty.projects.length === 0 &&
        empty.people.length === 0 &&
        empty.posts.length === 0,
      "empty query returns empty results",
    );
    const short = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "e",
    });
    assert(
      short.projects.length === 0 &&
        short.people.length === 0 &&
        short.posts.length === 0,
      "single-char query returns empty results",
    );
    console.log("PASS 10 minimum/empty query handled safely");

    const results = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "  Electrical  ",
    });

    // 2. authorized project appears (name match via later R-409; here electrical may hit posts)
    const projectSearch = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "R-409",
    });
    assert(
      projectSearch.projects.some((item) => item.id === projectA.id),
      "authorized project appears",
    );
    console.log("PASS 2 authorized project appears");

    // 14. project identifiers like R-409 remain searchable
    assert(
      projectSearch.projects[0]?.name.includes("R-409"),
      "R-409 searchable in project name",
    );
    console.log("PASS 14 R-409 remains searchable");

    // 3. inaccessible project does not appear
    assert(
      !projectSearch.projects.some((item) => item.id === projectB.id),
      "inaccessible project must not appear",
    );
    const electricalProjects = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "Secret Tower",
    });
    assert(
      electricalProjects.projects.length === 0,
      "inaccessible project name must not appear for outsider member",
    );
    console.log("PASS 3 inaccessible project does not appear");

    // 4. accessible project member appears
    const peopleSearch = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "Vandrick",
    });
    assert(
      peopleSearch.people.some(
        (person) =>
          person.userId === MEMBER_A && person.projectId === projectA.id,
      ),
      "accessible project member appears",
    );
    console.log("PASS 4 accessible project member appears");

    // 5. member from unrelated inaccessible project does not appear
    const hiddenPeople = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "Hidden Member",
    });
    assert(
      hiddenPeople.people.length === 0,
      "member from inaccessible project must not appear",
    );
    console.log("PASS 5 inaccessible project member does not appear");

    // 6. accessible human feed post appears
    assert(
      results.posts.some((post) => post.id === visiblePost.id),
      "accessible feed post appears",
    );
    console.log("PASS 6 accessible human feed post appears");

    // 7. inaccessible feed post does not appear
    assert(
      !results.posts.some((post) => post.id === secretPost.id),
      "inaccessible feed post must not appear",
    );
    console.log("PASS 7 inaccessible feed post does not appear");

    // 8. deleted post does not appear
    assert(
      !results.posts.some((post) => post.id === deletedPost.id),
      "deleted post must not appear",
    );
    const deletedSearch = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "temporary note",
    });
    assert(
      deletedSearch.posts.length === 0,
      "deleted post text must not surface",
    );
    console.log("PASS 8 deleted post does not appear");

    // 12. no private media URL leak
    assertNoPrivateMediaLeak(results);
    const mediaPost = results.posts.find((post) => post.id === visiblePost.id);
    assert(mediaPost?.hasMedia === true, "hasMedia true without URLs");
    console.log("PASS 12 search does not leak private media URLs");

    // 11. result limits enforced
    for (let i = 0; i < SEARCH_PROJECT_LIMIT + 3; i += 1) {
      await seedProject({
        localProjectId: `project-feed2f-limit-${i}`,
        ownerUid: OWNER_A,
        name: `LimitProbe Retro ${i}`,
      });
      const limitProjectId = createRemoteProjectId(
        OWNER_A,
        `project-feed2f-limit-${i}`,
      );
      projectIds.push(limitProjectId);
      await seedMember({
        projectId: limitProjectId,
        userId: OWNER_A,
        role: "owner",
        status: "active",
        invitedBy: OWNER_A,
      });
      await seedMember({
        projectId: limitProjectId,
        userId: MEMBER_A,
        role: "viewer",
        status: "active",
        invitedBy: OWNER_A,
      });
    }

    for (let i = 0; i < SEARCH_PEOPLE_LIMIT + 3; i += 1) {
      const uid = `phase-feed2f-extra-person-${i}`;
      uids.push(uid);
      await seedProfile({
        uid,
        displayName: `Limit Person ${i}`,
        email: `limit-person-${i}@example.com`,
      });
      await seedMember({
        projectId: projectA.id,
        userId: uid,
        role: "viewer",
        status: "active",
        invitedBy: OWNER_A,
      });
    }

    for (let i = 0; i < SEARCH_POST_LIMIT + 3; i += 1) {
      await seedPost({
        projectId: projectA.id,
        authorUserId: OWNER_A,
        localPostId: `post-limit-${i}`,
        text: `LimitUpdate marker content ${i}`,
      });
    }

    const limitedProjects = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "LimitProbe",
    });
    assert(
      limitedProjects.projects.length <= SEARCH_PROJECT_LIMIT,
      `project limit ${SEARCH_PROJECT_LIMIT}`,
    );

    const limitedPeople = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "Limit Person",
    });
    assert(
      limitedPeople.people.length <= SEARCH_PEOPLE_LIMIT,
      `people limit ${SEARCH_PEOPLE_LIMIT}`,
    );

    const limitedPosts = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "LimitUpdate",
    });
    assert(
      limitedPosts.posts.length <= SEARCH_POST_LIMIT,
      `post limit ${SEARCH_POST_LIMIT}`,
    );
    console.log("PASS 11 result limits enforced");

    // 13. removed project member loses search visibility
    const memberMemberships = await db
      .collection(COLLECTIONS.projectMembers)
      .where("userId", "==", MEMBER_A)
      .get();

    await Promise.all(
      memberMemberships.docs.map((doc) =>
        doc.ref.set(
          {
            status: "removed",
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ),
      ),
    );

    const afterRemoval = await searchBuildSigmaForUser({
      userId: MEMBER_A,
      query: "R-409",
    });
    assert(
      afterRemoval.projects.length === 0,
      "removed member loses project search visibility",
    );
    const afterRemovalPeople = await searchBuildSigmaForUser({
      userId: OWNER_A,
      query: "Vandrick",
    });
    assert(
      afterRemovalPeople.people.length === 0,
      "removed member is not discoverable to others",
    );
    console.log("PASS 13 removed project member loses search visibility");

    // Restore memberships for soft-delete / destination checks
    await Promise.all(
      memberMemberships.docs.map((doc) =>
        doc.ref.set(
          {
            status: "active",
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        ),
      ),
    );

    // Soft-delete via repository path (ensures active filter still holds)
    await softDeleteFeedPost({
      postId: visiblePost.id,
      projectId: projectA.id,
      authorUserId: MEMBER_A,
      nowIso: new Date().toISOString(),
    });
    const afterSoftDelete = await searchBuildSigmaForUser({
      userId: OWNER_A,
      query: "rough-in completed on level",
    });
    assert(
      !afterSoftDelete.posts.some((post) => post.id === visiblePost.id),
      "soft-deleted post excluded",
    );

    // 15. destination authorization remains authoritative
    try {
      await getAuthorizedProjectFeedPost({
        projectId: projectB.id,
        postId: secretPost.id,
        uid: MEMBER_A,
      });
      throw new Error("outsider should not open inaccessible post");
    } catch (error) {
      assert(
        error instanceof ProjectAccessError,
        "destination auth still enforced",
      );
    }
    console.log(
      "PASS 15 destination authorization remains authoritative",
    );

    console.log("PASS Phase Feed 2F search");
  } finally {
    await cleanup(projectIds, uids);
  }
}

main().catch((error) => {
  console.error("FAIL Phase Feed 2F search");
  console.error(error);
  process.exitCode = 1;
});
