import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { FeedPost, FeedPostMedia } from "../../domain/feedPost.js";
import { isActiveFeedPost } from "../../domain/feedPost.js";
import {
  createRemoteFeedMediaId,
  createRemoteFeedPostId,
} from "../../domain/feedPostId.js";
import { getProjectById } from "../../repositories/projectsRepository.js";
import {
  createFeedPostIfAbsent,
  getFeedPostById,
  listFeedPostsForProject,
  listFeedPostsForProjects,
  softDeleteFeedPost,
  updateFeedPostContent,
} from "../../repositories/feedPostsRepository.js";
import { getUserProfilesByUids } from "../../repositories/userProfilesRepository.js";
import { discoverProjectsForUser } from "../collaboration/discoverProjects.js";
import {
  tryNotifyProjectFeedPostCreated,
  resolveAuthorDisplayName,
} from "../notifications/feedNotificationService.js";
import { assertFeedReadable } from "./feedAccess.js";
import {
  tryRecordFeedPostDeletedActivity,
  tryRecordFeedPostEditedActivity,
} from "./feedPostActivityService.js";
import { getAcknowledgedByCurrentUserForPosts } from "./feedEngagementService.js";
import {
  assertFeedMediaPathsForPost,
  type FeedPostWriteInput,
  parseFeedPostEditInput,
  validateFeedPostEditInput,
  validateFeedPostWriteInput,
} from "../../validation/feedPost.js";

export class FeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedValidationError";
  }
}

export class FeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedConflictError";
  }
}

export type FeedPostAuthorPresentation = {
  userId: string;
  displayName: string | null;
};

export type FeedPostListItem = {
  id: string;
  projectId: string;
  projectName: string;
  author: FeedPostAuthorPresentation;
  text: string;
  locationLabel: string | null;
  createdAt: string;
  updatedAt: string;
  media: FeedPostMedia[];
  acknowledgementCount: number;
  commentCount: number;
  acknowledgedByCurrentUser: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function createProjectFeedPost(input: {
  projectId: string;
  authorUserId: string;
  body: FeedPostWriteInput;
}): Promise<FeedPostListItem> {
  const validationError = validateFeedPostWriteInput(input.body);

  if (validationError) {
    throw new FeedValidationError(validationError);
  }

  const project = await getProjectById(input.projectId);

  if (!project) {
    throw new FeedValidationError("Project not found");
  }

  if (
    !assertFeedMediaPathsForPost({
      ownerUid: project.ownerUid,
      projectId: project.id,
      localPostId: input.body.localPostId,
      media: input.body.media,
    })
  ) {
    throw new FeedValidationError("Invalid media object path");
  }

  const createdAt = nowIso();
  const postId = createRemoteFeedPostId(
    project.id,
    input.body.localPostId,
  );

  const media: FeedPostMedia[] = input.body.media.map((item) => ({
    id: createRemoteFeedMediaId(postId, item.localMediaId),
    postId,
    projectId: project.id,
    type: item.type,
    storageKey: item.objectPath,
    contentType: item.contentType,
    fileName: item.fileName,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    createdAt,
  }));

  const candidate: FeedPost = {
    id: postId,
    projectId: project.id,
    authorUserId: input.authorUserId,
    text: input.body.text,
    locationLabel: input.body.locationLabel,
    createdAt,
    updatedAt: createdAt,
    media,
    acknowledgementCount: 0,
    commentCount: 0,
  };

  const result = await createFeedPostIfAbsent(candidate);

  if (result.created) {
    const authorDisplayName = await resolveAuthorDisplayName(
      input.authorUserId,
    );
    await tryNotifyProjectFeedPostCreated({
      post: result.post,
      project,
      authorDisplayName,
    });
  }

  const [presented] = await presentFeedPosts(
    [result.post],
    new Map([[project.id, project.name]]),
    input.authorUserId,
  );

  return presented!;
}

export async function editAuthorProjectFeedPost(input: {
  projectId: string;
  postId: string;
  uid: string;
  body: unknown;
}): Promise<FeedPostListItem> {
  const parsed = parseFeedPostEditInput(input.body);

  if (!parsed) {
    throw new FeedValidationError("Invalid feed post edit payload");
  }

  await assertFeedReadable(input.projectId, input.uid);

  const existing = await getFeedPostById(input.postId);

  if (!existing || existing.projectId !== input.projectId) {
    throw new ProjectAccessError("Post not found", 404);
  }

  if (!isActiveFeedPost(existing)) {
    throw new ProjectAccessError("Post not found", 404);
  }

  if (existing.authorUserId !== input.uid) {
    throw new ProjectAccessError("Post not found", 404);
  }

  const validationError = validateFeedPostEditInput(
    parsed,
    existing.media.length,
  );

  if (validationError) {
    throw new FeedValidationError(validationError);
  }

  const editedAt = nowIso();
  const result = await updateFeedPostContent({
    postId: input.postId,
    projectId: input.projectId,
    authorUserId: input.uid,
    text: parsed.text,
    locationLabel: parsed.locationLabel,
    expectedUpdatedAt: parsed.expectedUpdatedAt,
    nowIso: editedAt,
  });

  if (result.kind === "not_found" || result.kind === "deleted") {
    throw new ProjectAccessError("Post not found", 404);
  }

  if (result.kind === "forbidden") {
    throw new ProjectAccessError("Post not found", 404);
  }

  if (result.kind === "conflict") {
    throw new FeedConflictError(
      "This update was changed elsewhere. Refresh and try again.",
    );
  }

  const project = await getProjectById(input.projectId);

  if (!project) {
    throw new ProjectAccessError("Post not found", 404);
  }

  await tryRecordFeedPostEditedActivity({
    projectId: input.projectId,
    postId: input.postId,
    actorUid: input.uid,
    updatedAt: result.post.updatedAt,
  });

  return presentFeedPost(result.post, project.name, input.uid);
}

export async function deleteAuthorProjectFeedPost(input: {
  projectId: string;
  postId: string;
  uid: string;
}): Promise<void> {
  await assertFeedReadable(input.projectId, input.uid);

  const result = await softDeleteFeedPost({
    postId: input.postId,
    projectId: input.projectId,
    authorUserId: input.uid,
    nowIso: nowIso(),
  });

  if (result.kind === "not_found" || result.kind === "forbidden") {
    throw new ProjectAccessError("Post not found", 404);
  }

  if (!result.alreadyDeleted) {
    await tryRecordFeedPostDeletedActivity({
      projectId: input.projectId,
      postId: input.postId,
      actorUid: input.uid,
      deletedAt: result.post.deletedAt ?? result.post.updatedAt,
    });
  }
}

async function presentFeedPosts(
  posts: FeedPost[],
  projectNameById: Map<string, string>,
  viewerUid: string,
): Promise<FeedPostListItem[]> {
  if (posts.length === 0) {
    return [];
  }

  const authorUids = [
    ...new Set(posts.map((post) => post.authorUserId)),
  ];
  const profiles = await getUserProfilesByUids(authorUids);
  const profileByUid = new Map(
    profiles.map((profile) => [profile.uid, profile] as const),
  );

  const acknowledged = await getAcknowledgedByCurrentUserForPosts(
    posts.map((post) => post.id),
    viewerUid,
  );

  return posts.map((post) => {
    const profile = profileByUid.get(post.authorUserId);

    return {
      id: post.id,
      projectId: post.projectId,
      projectName:
        projectNameById.get(post.projectId) ?? "Unknown project",
      author: {
        userId: post.authorUserId,
        displayName: profile?.displayName?.trim() || null,
      },
      text: post.text,
      locationLabel: post.locationLabel,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      media: post.media,
      acknowledgementCount: Math.max(0, post.acknowledgementCount ?? 0),
      commentCount: Math.max(0, post.commentCount ?? 0),
      acknowledgedByCurrentUser: acknowledged.has(post.id),
    };
  });
}

async function presentFeedPost(
  post: FeedPost,
  projectName: string,
  viewerUid: string,
): Promise<FeedPostListItem> {
  const [item] = await presentFeedPosts(
    [post],
    new Map([[post.projectId, projectName]]),
    viewerUid,
  );

  return item!;
}

export async function getAuthorizedProjectFeedPost(input: {
  projectId: string;
  postId: string;
  uid: string;
}): Promise<FeedPostListItem | undefined> {
  await assertFeedReadable(input.projectId, input.uid);

  const post = await getFeedPostById(input.postId);

  if (!post || post.projectId !== input.projectId || !isActiveFeedPost(post)) {
    return undefined;
  }

  const project = await getProjectById(input.projectId);

  if (!project) {
    return undefined;
  }

  return presentFeedPost(post, project.name, input.uid);
}

export async function getProjectFeedPostListItem(
  postId: string,
  viewerUid: string,
): Promise<FeedPostListItem | undefined> {
  const post = await getFeedPostById(postId);

  if (!post) {
    return undefined;
  }

  const project = await getProjectById(post.projectId);

  if (!project) {
    return undefined;
  }

  return presentFeedPost(post, project.name, viewerUid);
}

export async function listAuthorizedProjectFeed(input: {
  uid: string;
  projectId: string;
  limit: number;
  cursor?: string | null;
}): Promise<{ items: FeedPostListItem[]; nextCursor: string | null }> {
  const project = await getProjectById(input.projectId);

  if (!project) {
    return { items: [], nextCursor: null };
  }

  const page = await listFeedPostsForProject(input.projectId, {
    limit: input.limit,
    cursor: input.cursor,
  });

  const items = await presentFeedPosts(
    page.items,
    new Map([[project.id, project.name]]),
    input.uid,
  );

  return {
    items,
    nextCursor: page.nextCursor,
  };
}

export async function listAuthorizedCombinedFeed(input: {
  uid: string;
  limit: number;
  cursor?: string | null;
}): Promise<{ items: FeedPostListItem[]; nextCursor: string | null }> {
  const discovered = await discoverProjectsForUser(input.uid);
  const projectIds = discovered.map((project) => project.id);
  const projectNameById = new Map(
    discovered.map((project) => [project.id, project.name] as const),
  );

  const page = await listFeedPostsForProjects(projectIds, {
    limit: input.limit,
    cursor: input.cursor,
  });

  const items = await presentFeedPosts(
    page.items,
    projectNameById,
    input.uid,
  );

  return {
    items,
    nextCursor: page.nextCursor,
  };
}

export async function getFeedMediaForAuthorizedRead(input: {
  projectId: string;
  postId: string;
  mediaId: string;
}): Promise<FeedPostMedia | undefined> {
  const post = await getFeedPostById(input.postId);

  if (!post || post.projectId !== input.projectId || !isActiveFeedPost(post)) {
    return undefined;
  }

  return post.media.find((item) => item.id === input.mediaId);
}
