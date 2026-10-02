import { Router } from "express";

import {
  toKeplerConversationDTO,
  toKeplerMessageDTO,
} from "../dto/keplerConversationDto.js";
import {
  DEFAULT_KEPLER_PAGE_SIZE,
  MAX_KEPLER_PAGE_SIZE,
  decodeKeplerCursor,
  parseCreateKeplerMessageBody,
} from "../validation/keplerConversation.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  createKeplerConversationService,
  KeplerConversationError,
  keplerConversationService,
} from "../services/kepler/keplerConversationService.js";

type KeplerService = ReturnType<typeof createKeplerConversationService>;

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_KEPLER_PAGE_SIZE;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_KEPLER_PAGE_SIZE ? parsed : null;
}

function validCursor(value: unknown): string | null | undefined {
  if (value === undefined) return null;
  return typeof value === "string" && value.length > 0 && value.length <= 512 && decodeKeplerCursor(value) ? value : undefined;
}

async function routeError(res: import("express").Response, error: unknown): Promise<void> {
  if (error instanceof KeplerConversationError) {
    sendError(res, error.statusCode, error.message);
    return;
  }
  await handleRouteError(res, error);
}

export function createKeplerConversationsRouter(service: KeplerService = keplerConversationService) {
  const router = Router();

  router.post("/projects/:projectId/kepler/conversations", async (req, res) => {
    const uid = requireUserUid(req);
    const projectId = req.params.projectId;
    if (!uid) return sendError(res, 401, "Unauthorized");
    if (!projectId) return sendError(res, 400, "projectId is required");
    try {
      const conversation = await service.create({ projectId, uid });
      res.status(201).json(toKeplerConversationDTO(conversation));
    } catch (error) {
      await routeError(res, error);
    }
  });

  router.get("/projects/:projectId/kepler/conversations", async (req, res) => {
    const uid = requireUserUid(req);
    const projectId = req.params.projectId;
    if (!uid) return sendError(res, 401, "Unauthorized");
    if (!projectId) return sendError(res, 400, "projectId is required");
    const limit = parseLimit(req.query.limit);
    const cursor = validCursor(req.query.cursor);
    if (limit === null || cursor === undefined) return sendError(res, 400, "Invalid pagination parameters");
    try {
      const page = await service.list({ projectId, uid, limit, cursor });
      res.status(200).json({ items: page.items.map(toKeplerConversationDTO), nextCursor: page.nextCursor });
    } catch (error) {
      await routeError(res, error);
    }
  });

  router.post("/projects/:projectId/kepler/conversations/:conversationId/messages", async (req, res) => {
    const uid = requireUserUid(req);
    const { projectId, conversationId } = req.params;
    if (!uid) return sendError(res, 401, "Unauthorized");
    if (!projectId || !conversationId) return sendError(res, 400, "projectId and conversationId are required");
    const body = parseCreateKeplerMessageBody(readBody(req));
    if (!body) return sendError(res, 400, "Invalid Kepler message payload");
    try {
      const result = await service.postUserMessage({ projectId, conversationId, uid, ...body });
      res.status(result.generationStatus === "processing" ? 202 : result.created ? 201 : 200).json({
        userMessage: toKeplerMessageDTO(result.message),
        assistantMessage: result.assistantMessage ? toKeplerMessageDTO(result.assistantMessage) : null,
        generationStatus: result.generationStatus,
      });
    } catch (error) {
      await routeError(res, error);
    }
  });

  router.get("/projects/:projectId/kepler/conversations/:conversationId/messages", async (req, res) => {
    const uid = requireUserUid(req);
    const { projectId, conversationId } = req.params;
    if (!uid) return sendError(res, 401, "Unauthorized");
    if (!projectId || !conversationId) return sendError(res, 400, "projectId and conversationId are required");
    const limit = parseLimit(req.query.limit);
    const cursor = validCursor(req.query.cursor);
    if (limit === null || cursor === undefined) return sendError(res, 400, "Invalid pagination parameters");
    try {
      const page = await service.messages({ projectId, conversationId, uid, limit, cursor });
      res.status(200).json({ items: page.items.map(toKeplerMessageDTO), nextCursor: page.nextCursor });
    } catch (error) {
      await routeError(res, error);
    }
  });

  return router;
}

export const keplerConversationsRouter = createKeplerConversationsRouter();
