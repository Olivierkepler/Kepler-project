import { Router } from "express";

import { getMeasurementById } from "../repositories/measurementsRepository.js";
import {
  encodeActivityCursor,
  listActivityEventsForProject,
} from "../repositories/activityEventsRepository.js";
import {
  assertProjectAccessContext,
} from "../services/collaboration/projectAccessScope.js";
import {
  filterActivityEventsForAccess,
} from "../services/activity/activityVisibility.js";
import type { ActivityEvent } from "../domain/activityEvent.js";
import {
  handleRouteError,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const activityRouter = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_FETCH_ROUNDS = 8;

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
 * Role-filtered project Activity timeline (Phase 2M.1 / 2O pagination fix).
 * GET /api/projects/:projectId/activity?limit=&cursor=
 */
activityRouter.get("/projects/:projectId/activity", async (req, res) => {
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

    const access = await assertProjectAccessContext(projectId, uid);
    const limit = parseLimit(req.query.limit);
    const initialCursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : null;

    // Full / viewer: single page then filter (viewer filter is type-based).
    if (access.accessMode === "full") {
      const page = await listActivityEventsForProject(projectId, {
        limit,
        cursor: initialCursor,
      });
      const items = filterActivityEventsForAccess(page.items, access);
      res.status(200).json({
        items,
        nextCursor: page.nextCursor,
      });
      return;
    }

    // Assigned scope: fetch until visible limit filled or exhaustion.
    // nextCursor resumes after the last *returned* visible event so remaining
    // in-scope events on a partially consumed raw page are not skipped.
    const visible: ActivityEvent[] = [];
    let cursor: string | null = initialCursor;
    let nextCursor: string | null = null;
    let rounds = 0;
    const ownMeasurementIds = new Set<string>();

    fetchLoop: while (visible.length < limit && rounds < MAX_FETCH_ROUNDS) {
      rounds += 1;
      const page = await listActivityEventsForProject(projectId, {
        limit: 100,
        cursor,
      });

      for (const item of page.items) {
        if (
          item.type === "measurement_accepted" ||
          item.type === "measurement_rejected"
        ) {
          if (!ownMeasurementIds.has(item.subjectId)) {
            const measurement = await getMeasurementById(item.subjectId);
            if (
              measurement &&
              measurement.projectId === projectId &&
              measurement.capturedByUid === uid
            ) {
              ownMeasurementIds.add(measurement.id);
            }
          }
        }
      }

      const filtered = filterActivityEventsForAccess(page.items, access, {
        currentUserMeasurementIds: ownMeasurementIds,
      });

      for (const item of filtered) {
        if (visible.length >= limit) {
          const last = visible[visible.length - 1]!;
          nextCursor = encodeActivityCursor(last.createdAt, last.id);
          break fetchLoop;
        }
        visible.push(item);
      }

      if (!page.nextCursor || page.items.length === 0) {
        nextCursor = null;
        break;
      }

      cursor = page.nextCursor;

      if (visible.length >= limit) {
        nextCursor = page.nextCursor;
        break;
      }
    }

    res.status(200).json({
      items: visible.slice(0, limit),
      nextCursor,
    });
  } catch (error) {
    await handleRouteError(res, error);
  }
});
