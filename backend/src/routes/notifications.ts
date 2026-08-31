import { Router } from "express";

import {
  countUnreadNotifications,
  getNotificationById,
  listNotificationsForRecipient,
  markAllNotificationsRead,
  markNotificationRead,
} from "../repositories/notificationsRepository.js";
import {
  handleRouteError,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const notificationsRouter = Router();

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function parseLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Authenticated user's notification inbox.
 * GET /api/me/notifications?limit=&cursor=
 */
notificationsRouter.get("/me/notifications", async (req, res) => {
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

    const page = await listNotificationsForRecipient(uid, { limit, cursor });
    res.status(200).json(page);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * GET /api/me/notifications/unread-count
 */
notificationsRouter.get("/me/notifications/unread-count", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const count = await countUnreadNotifications(uid);
    res.status(200).json({ count });
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * GET /api/me/notifications/:notificationId
 * Recipient must match authenticated user.
 */
notificationsRouter.get(
  "/me/notifications/:notificationId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const notificationId = req.params.notificationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!notificationId) {
        sendError(res, 400, "notificationId is required");
        return;
      }

      const notification = await getNotificationById(notificationId);

      if (!notification || notification.recipientUid !== uid) {
        sendError(res, 404, "Notification not found");
        return;
      }

      res.status(200).json(notification);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * PATCH /api/me/notifications/:notificationId/read
 */
notificationsRouter.patch(
  "/me/notifications/:notificationId/read",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const notificationId = req.params.notificationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!notificationId) {
        sendError(res, 400, "notificationId is required");
        return;
      }

      const result = await markNotificationRead(notificationId, uid);

      if (result.kind === "not_found" || result.kind === "forbidden") {
        sendError(res, 404, "Notification not found");
        return;
      }

      res.status(200).json(result.notification);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * POST /api/me/notifications/read-all
 */
notificationsRouter.post("/me/notifications/read-all", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const updated = await markAllNotificationsRead(uid);
    res.status(200).json({ updated });
  } catch (error) {
    await handleRouteError(res, error);
  }
});
