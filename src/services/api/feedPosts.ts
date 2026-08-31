import { authenticatedFetch } from "./client";

export type RemoteFeedPostMedia = {
  id: string;
  postId: string;
  projectId: string;
  type: "image" | "video";
  storageKey: string;
  contentType: string;
  fileName: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
};

export type RemoteFeedPostAuthor = {
  userId: string;
  displayName: string | null;
};

export type RemoteFeedPost = {
  id: string;
  projectId: string;
  projectName: string;
  author: RemoteFeedPostAuthor;
  text: string;
  locationLabel: string | null;
  createdAt: string;
  updatedAt: string;
  media: RemoteFeedPostMedia[];
  acknowledgementCount: number;
  commentCount: number;
  acknowledgedByCurrentUser: boolean;
};

export type RemoteFeedAcknowledgementState = {
  acknowledgedByCurrentUser: boolean;
  acknowledgementCount: number;
};

export type RemoteFeedPostComment = {
  id: string;
  postId: string;
  projectId: string;
  author: RemoteFeedPostAuthor;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteFeedCommentPage = {
  items: RemoteFeedPostComment[];
  nextCursor: string | null;
};

export const MAX_FEED_POST_COMMENT_LENGTH = 1000;

export type RemoteFeedPage = {
  items: RemoteFeedPost[];
  nextCursor: string | null;
};

export type CreateRemoteFeedPostMediaInput = {
  localMediaId: string;
  type: "image" | "video";
  objectPath: string;
  contentType: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
};

export type CreateRemoteFeedPostRequest = {
  localPostId: string;
  text: string;
  locationLabel?: string | null;
  media?: CreateRemoteFeedPostMediaInput[];
};

export type FeedMediaUploadUrlRequest = {
  localPostId: string;
  localMediaId: string;
  type: "image" | "video";
  contentType: string;
};

export type FeedMediaUploadUrlResponse = {
  localPostId: string;
  localMediaId: string;
  type: "image" | "video";
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

export type FeedMediaReadUrlResponse = {
  mediaId: string;
  type: "image" | "video";
  contentType: string;
  readUrl: string;
  objectPath: string;
  expiresAt: string;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }

  return fallback;
}

function parseEngagementCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function parseAcknowledgementState(
  value: unknown,
): RemoteFeedAcknowledgementState | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.acknowledgedByCurrentUser !== "boolean" ||
    typeof record.acknowledgementCount !== "number"
  ) {
    return null;
  }

  return {
    acknowledgedByCurrentUser: record.acknowledgedByCurrentUser,
    acknowledgementCount: parseEngagementCount(
      record.acknowledgementCount,
    ),
  };
}

export function parseRemoteFeedPostComment(
  value: unknown,
): RemoteFeedPostComment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.postId !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.text !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  const authorRecord = record.author;

  if (
    typeof authorRecord !== "object" ||
    authorRecord === null ||
    typeof (authorRecord as Record<string, unknown>).userId !== "string"
  ) {
    return null;
  }

  const author = authorRecord as Record<string, unknown>;

  return {
    id: record.id.trim(),
    postId: record.postId.trim(),
    projectId: record.projectId.trim(),
    author: {
      userId: (author.userId as string).trim(),
      displayName:
        typeof author.displayName === "string"
          ? author.displayName.trim() || null
          : null,
    },
    text: record.text,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

function isRemoteFeedPostMedia(
  value: unknown,
): value is RemoteFeedPostMedia {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.postId === "string" &&
    typeof record.projectId === "string" &&
    (record.type === "image" || record.type === "video") &&
    typeof record.storageKey === "string" &&
    typeof record.contentType === "string" &&
    (record.fileName === null || typeof record.fileName === "string") &&
    (record.width === null || typeof record.width === "number") &&
    (record.height === null || typeof record.height === "number") &&
    (record.durationSeconds === null ||
      typeof record.durationSeconds === "number") &&
    typeof record.createdAt === "string"
  );
}

export function parseRemoteFeedPost(
  value: unknown,
): RemoteFeedPost | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.projectName !== "string" ||
    typeof record.text !== "string" ||
    (record.locationLabel !== null &&
      typeof record.locationLabel !== "string") ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !Array.isArray(record.media)
  ) {
    return null;
  }

  const authorRecord = record.author;

  if (
    typeof authorRecord !== "object" ||
    authorRecord === null ||
    typeof (authorRecord as Record<string, unknown>).userId !== "string"
  ) {
    return null;
  }

  const author = authorRecord as Record<string, unknown>;
  const authorUserId = author.userId;

  if (typeof authorUserId !== "string") {
    return null;
  }

  const media: RemoteFeedPostMedia[] = [];

  for (const entry of record.media) {
    if (!isRemoteFeedPostMedia(entry)) {
      return null;
    }

    media.push(entry);
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    projectName: record.projectName.trim(),
    author: {
      userId: authorUserId.trim(),
      displayName:
        typeof author.displayName === "string"
          ? author.displayName.trim() || null
          : null,
    },
    text: record.text,
    locationLabel:
      record.locationLabel === null
        ? null
        : record.locationLabel.trim() || null,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
    media,
    acknowledgementCount: parseEngagementCount(
      record.acknowledgementCount,
    ),
    commentCount: parseEngagementCount(record.commentCount),
    acknowledgedByCurrentUser:
      record.acknowledgedByCurrentUser === true,
  };
}

function parseFeedPage(body: unknown): RemoteFeedPage {
  if (typeof body !== "object" || body === null) {
    throw new Error("Project feed could not be loaded.");
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.items)) {
    throw new Error("Project feed could not be loaded.");
  }

  const items: RemoteFeedPost[] = [];

  for (const entry of record.items) {
    const parsed = parseRemoteFeedPost(entry);

    if (!parsed) {
      throw new Error("Project feed could not be loaded.");
    }

    items.push(parsed);
  }

  const nextCursor =
    typeof record.nextCursor === "string" && record.nextCursor.trim()
      ? record.nextCursor.trim()
      : null;

  return { items, nextCursor };
}

/**
 * GET /api/feed
 */
export async function getAuthorizedProjectFeed(
  options?: {
    limit?: number;
    cursor?: string | null;
  },
): Promise<RemoteFeedPage> {
  const params = new URLSearchParams();

  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }

  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();
  const path = `/api/feed${query ? `?${query}` : ""}`;

  const response = await authenticatedFetch(path);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Project feed could not be loaded."),
    );
  }

  return parseFeedPage(body);
}

/**
 * POST /api/projects/:projectId/feed
 */
export async function createRemoteFeedPost(
  remoteProjectId: string,
  request: CreateRemoteFeedPostRequest,
): Promise<RemoteFeedPost> {
  const projectId = remoteProjectId.trim();

  if (!projectId) {
    throw new Error("projectId is required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/feed`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to publish project update."),
    );
  }

  const parsed = parseRemoteFeedPost(body);

  if (!parsed) {
    throw new Error("Unable to publish project update.");
  }

  return parsed;
}

/**
 * GET /api/projects/:projectId/feed/posts/:postId
 */
export async function getRemoteFeedPost(
  remoteProjectId: string,
  postId: string,
): Promise<RemoteFeedPost> {
  const projectId = remoteProjectId.trim();
  const id = postId.trim();

  if (!projectId || !id) {
    throw new Error("projectId and postId are required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/feed/posts/${encodeURIComponent(id)}`,
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Project update could not be loaded."),
    );
  }

  const parsed = parseRemoteFeedPost(body);

  if (!parsed) {
    throw new Error("Project update could not be loaded.");
  }

  return parsed;
}

export type UpdateRemoteFeedPostRequest = {
  text: string;
  locationLabel?: string | null;
  expectedUpdatedAt?: string;
};

/**
 * PATCH /api/projects/:projectId/feed/posts/:postId
 */
export async function updateRemoteFeedPost(
  remoteProjectId: string,
  postId: string,
  request: UpdateRemoteFeedPostRequest,
): Promise<RemoteFeedPost> {
  const projectId = remoteProjectId.trim();
  const id = postId.trim();

  if (!projectId || !id) {
    throw new Error("projectId and postId are required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/feed/posts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Project update could not be saved."),
    );
  }

  const parsed = parseRemoteFeedPost(body);

  if (!parsed) {
    throw new Error("Project update could not be saved.");
  }

  return parsed;
}

/**
 * DELETE /api/projects/:projectId/feed/posts/:postId
 */
export async function deleteRemoteFeedPost(
  remoteProjectId: string,
  postId: string,
): Promise<void> {
  const projectId = remoteProjectId.trim();
  const id = postId.trim();

  if (!projectId || !id) {
    throw new Error("projectId and postId are required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/feed/posts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

  if (!response.ok && response.status !== 204) {
    const body = await readJson(response);
    throw new Error(
      parseErrorMessage(body, "Project update could not be deleted."),
    );
  }
}

/**
 * POST /api/projects/:projectId/feed/media/upload-url
 */
export async function requestFeedMediaUploadUrl(
  remoteProjectId: string,
  request: FeedMediaUploadUrlRequest,
): Promise<FeedMediaUploadUrlResponse> {
  const projectId = remoteProjectId.trim();

  if (!projectId) {
    throw new Error("projectId is required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/feed/media/upload-url`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to prepare media upload."),
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Unable to prepare media upload.");
  }

  const record = body as Record<string, unknown>;

  if (
    typeof record.localPostId !== "string" ||
    typeof record.localMediaId !== "string" ||
    (record.type !== "image" && record.type !== "video") ||
    typeof record.uploadUrl !== "string" ||
    typeof record.objectPath !== "string" ||
    typeof record.contentType !== "string" ||
    typeof record.expiresAt !== "string"
  ) {
    throw new Error("Unable to prepare media upload.");
  }

  return {
    localPostId: record.localPostId,
    localMediaId: record.localMediaId,
    type: record.type,
    uploadUrl: record.uploadUrl,
    objectPath: record.objectPath,
    contentType: record.contentType,
    expiresAt: record.expiresAt,
  };
}

/**
 * POST /api/projects/:projectId/feed/posts/:postId/media/:mediaId/read-url
 */
export async function requestFeedMediaReadUrl(
  remoteProjectId: string,
  postId: string,
  mediaId: string,
): Promise<FeedMediaReadUrlResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/feed/posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}/read-url`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to load feed media."),
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Unable to load feed media.");
  }

  const record = body as Record<string, unknown>;

  if (
    typeof record.mediaId !== "string" ||
    (record.type !== "image" && record.type !== "video") ||
    typeof record.contentType !== "string" ||
    typeof record.readUrl !== "string" ||
    typeof record.objectPath !== "string" ||
    typeof record.expiresAt !== "string"
  ) {
    throw new Error("Unable to load feed media.");
  }

  return {
    mediaId: record.mediaId,
    type: record.type,
    contentType: record.contentType,
    readUrl: record.readUrl,
    objectPath: record.objectPath,
    expiresAt: record.expiresAt,
  };
}

function parseCommentPage(body: unknown): RemoteFeedCommentPage {
  if (typeof body !== "object" || body === null) {
    throw new Error("Comments could not be loaded.");
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.items)) {
    throw new Error("Comments could not be loaded.");
  }

  const items: RemoteFeedPostComment[] = [];

  for (const entry of record.items) {
    const parsed = parseRemoteFeedPostComment(entry);

    if (!parsed) {
      throw new Error("Comments could not be loaded.");
    }

    items.push(parsed);
  }

  const nextCursor =
    typeof record.nextCursor === "string" && record.nextCursor.trim()
      ? record.nextCursor.trim()
      : null;

  return { items, nextCursor };
}

/**
 * PUT /api/projects/:projectId/feed/posts/:postId/acknowledgement
 */
export async function acknowledgeRemoteFeedPost(
  remoteProjectId: string,
  postId: string,
): Promise<RemoteFeedAcknowledgementState> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/feed/posts/${encodeURIComponent(postId)}/acknowledgement`,
    { method: "PUT" },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to acknowledge update."),
    );
  }

  const parsed = parseAcknowledgementState(body);

  if (!parsed) {
    throw new Error("Unable to acknowledge update.");
  }

  return parsed;
}

/**
 * DELETE /api/projects/:projectId/feed/posts/:postId/acknowledgement
 */
export async function removeRemoteFeedPostAcknowledgement(
  remoteProjectId: string,
  postId: string,
): Promise<RemoteFeedAcknowledgementState> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/feed/posts/${encodeURIComponent(postId)}/acknowledgement`,
    { method: "DELETE" },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to remove acknowledgement."),
    );
  }

  const parsed = parseAcknowledgementState(body);

  if (!parsed) {
    throw new Error("Unable to remove acknowledgement.");
  }

  return parsed;
}

/**
 * GET /api/projects/:projectId/feed/posts/:postId/comments
 */
export async function getRemoteFeedPostComments(
  remoteProjectId: string,
  postId: string,
  options?: {
    limit?: number;
    cursor?: string | null;
  },
): Promise<RemoteFeedCommentPage> {
  const params = new URLSearchParams();

  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }

  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();
  const path = `/api/projects/${encodeURIComponent(remoteProjectId)}/feed/posts/${encodeURIComponent(postId)}/comments${query ? `?${query}` : ""}`;

  const response = await authenticatedFetch(path);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Comments could not be loaded."),
    );
  }

  return parseCommentPage(body);
}

/**
 * POST /api/projects/:projectId/feed/posts/:postId/comments
 */
export async function createRemoteFeedPostComment(
  remoteProjectId: string,
  postId: string,
  text: string,
): Promise<RemoteFeedPostComment> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/feed/posts/${encodeURIComponent(postId)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unable to post comment."),
    );
  }

  const parsed = parseRemoteFeedPostComment(body);

  if (!parsed) {
    throw new Error("Unable to post comment.");
  }

  return parsed;
}
