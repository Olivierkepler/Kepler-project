import { Router } from "express";

import { getProjectById } from "../repositories/projectsRepository.js";
import {
  assertFeedReadable,
  assertFeedWritable,
} from "../services/feed/feedAccess.js";
import {
  acknowledgeProjectFeedPost,
  createProjectFeedPostComment,
  listProjectFeedPostComments,
  removeProjectFeedPostAcknowledgement,
} from "../services/feed/feedEngagementService.js";
import {
  FeedValidationError,
  FeedConflictError,
  createProjectFeedPost,
  deleteAuthorProjectFeedPost,
  editAuthorProjectFeedPost,
  getAuthorizedProjectFeedPost,
  getFeedMediaForAuthorizedRead,
  listAuthorizedCombinedFeed,
  listAuthorizedProjectFeed,
} from "../services/feed/feedService.js";
import {
  buildFeedMediaObjectPath,
  createFeedMediaReadUrl,
  createFeedMediaUploadUrl,
} from "../storage/feedMediaStorage.js";
import {
  parseFeedMediaUploadUrlInput,
  parseFeedPostWriteInput,
} from "../validation/feedPost.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const feedPostsRouter = Router();

const DEFAULT_FEED_LIMIT = 25;
const MAX_FEED_LIMIT = 100;
const DEFAULT_COMMENT_LIMIT = 30;
const MAX_COMMENT_LIMIT = 100;

function parseLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return DEFAULT_FEED_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_FEED_LIMIT;
  }

  return Math.min(parsed, MAX_FEED_LIMIT);
}

function parseCommentLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return DEFAULT_COMMENT_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_COMMENT_LIMIT;
  }

  return Math.min(parsed, MAX_COMMENT_LIMIT);
}

async function handleFeedRouteError(
  res: import("express").Response,
  error: unknown,
): Promise<void> {
  if (error instanceof FeedValidationError) {
    sendError(res, 400, error.message);
    return;
  }

  if (error instanceof FeedConflictError) {
    sendError(res, 409, error.message);
    return;
  }

  await handleRouteError(res, error);
}

feedPostsRouter.get("/feed", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const limit = parseLimit(req.query.limit);
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : null;

    const page = await listAuthorizedCombinedFeed({
      uid,
      limit,
      cursor,
    });

    res.status(200).json(page);
  } catch (error) {
    await handleFeedRouteError(res, error);
  }
});

feedPostsRouter.get(
  "/projects/:projectId/feed",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      await assertFeedReadable(projectId, uid);

      const limit = parseLimit(req.query.limit);
      const cursor =
        typeof req.query.cursor === "string" && req.query.cursor.trim()
          ? req.query.cursor.trim()
          : null;

      const page = await listAuthorizedProjectFeed({
        uid,
        projectId,
        limit,
        cursor,
      });

      res.status(200).json(page);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.get(
  "/projects/:projectId/feed/posts/:postId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const post = await getAuthorizedProjectFeedPost({
        projectId,
        postId,
        uid,
      });

      if (!post) {
        sendError(res, 404, "Post not found");
        return;
      }

      res.status(200).json(post);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.patch(
  "/projects/:projectId/feed/posts/:postId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const updated = await editAuthorProjectFeedPost({
        projectId,
        postId,
        uid,
        body: readBody(req),
      });

      res.status(200).json(updated);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.delete(
  "/projects/:projectId/feed/posts/:postId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      await deleteAuthorProjectFeedPost({
        projectId,
        postId,
        uid,
      });

      res.status(204).send();
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.post(
  "/projects/:projectId/feed",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      const access = await assertFeedWritable(projectId, uid);
      const body = parseFeedPostWriteInput(readBody(req));

      if (!body) {
        sendError(res, 400, "Invalid feed post payload");
        return;
      }

      const created = await createProjectFeedPost({
        projectId: access.projectId,
        authorUserId: uid,
        body,
      });

      res.status(201).json(created);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.post(
  "/projects/:projectId/feed/media/upload-url",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      const access = await assertFeedWritable(projectId, uid);
      const input = parseFeedMediaUploadUrlInput(readBody(req));

      if (!input) {
        sendError(res, 400, "Invalid feed media upload URL payload");
        return;
      }

      const project = await getProjectById(access.projectId);

      if (!project) {
        sendError(res, 404, "Project not found");
        return;
      }

      const objectPath = buildFeedMediaObjectPath({
        ownerUid: project.ownerUid,
        projectId: project.id,
        localPostId: input.localPostId,
        localMediaId: input.localMediaId,
        contentType: input.contentType,
      });

      const signed = await createFeedMediaUploadUrl(
        objectPath,
        input.contentType,
      );

      res.status(200).json({
        localPostId: input.localPostId,
        localMediaId: input.localMediaId,
        type: input.type,
        ...signed,
      });
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.post(
  "/projects/:projectId/feed/posts/:postId/media/:mediaId/read-url",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;
      const mediaId = req.params.mediaId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId || !mediaId) {
        sendError(res, 400, "projectId, postId, and mediaId are required");
        return;
      }

      await assertFeedReadable(projectId, uid);

      const media = await getFeedMediaForAuthorizedRead({
        projectId,
        postId,
        mediaId,
      });

      if (!media) {
        sendError(res, 404, "Media not found");
        return;
      }

      const signed = await createFeedMediaReadUrl(media.storageKey);

      res.status(200).json({
        mediaId: media.id,
        type: media.type,
        contentType: media.contentType,
        ...signed,
      });
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.put(
  "/projects/:projectId/feed/posts/:postId/acknowledgement",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const result = await acknowledgeProjectFeedPost({
        projectId,
        postId,
        uid,
      });

      res.status(200).json(result);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.delete(
  "/projects/:projectId/feed/posts/:postId/acknowledgement",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const result = await removeProjectFeedPostAcknowledgement({
        projectId,
        postId,
        uid,
      });

      res.status(200).json(result);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.get(
  "/projects/:projectId/feed/posts/:postId/comments",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const page = await listProjectFeedPostComments({
        projectId,
        postId,
        uid,
        limit: parseCommentLimit(req.query.limit),
        cursor:
          typeof req.query.cursor === "string" && req.query.cursor.trim()
            ? req.query.cursor.trim()
            : null,
      });

      res.status(200).json(page);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);

feedPostsRouter.post(
  "/projects/:projectId/feed/posts/:postId/comments",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const postId = req.params.postId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !postId) {
        sendError(res, 400, "projectId and postId are required");
        return;
      }

      const created = await createProjectFeedPostComment({
        projectId,
        postId,
        uid,
        body: readBody(req),
      });

      res.status(201).json(created);
    } catch (error) {
      await handleFeedRouteError(res, error);
    }
  },
);
