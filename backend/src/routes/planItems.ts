import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import type { PlanItem } from "../domain/planItem.js";
import {
  getPlanItemById,
  getPlanItemsForProject,
  setPlanItem,
} from "../repositories/planItemsRepository.js";
import {
  assertProjectAccessContext,
  filterPlanItemsForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  getPlanItemProvenance,
  PlanItemProvenanceError,
} from "../services/planItemProvenance.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parsePlanItem,
  parsePlanItemBootstrapBody,
  parsePlanItemUpdateInput,
} from "../validation/planItem.js";

export const planItemsRouter = Router();

planItemsRouter.get("/projects/:projectId/plan-items", async (req, res) => {
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
    const items = await getPlanItemsForProject(projectId);
    res.status(200).json(filterPlanItemsForAccess(items, access));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Read-only PlanItem provenance (Phase 2P.6).
 * Owner-only. Lazy-loaded; does not mutate PlanItems or imports.
 *
 * GET /api/projects/:projectId/plan-items/:planItemId/provenance
 */
planItemsRouter.get(
  "/projects/:projectId/plan-items/:planItemId/provenance",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const planItemId = req.params.planItemId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !planItemId) {
        sendError(res, 400, "projectId and planItemId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      try {
        const provenance = await getPlanItemProvenance({
          projectId,
          planItemId,
        });
        res.status(200).json(provenance);
      } catch (error) {
        if (error instanceof PlanItemProvenanceError) {
          sendError(res, error.statusCode, error.message);
          return;
        }
        throw error;
      }
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Idempotent PlanItem bootstrap for an owned remote project.
 * Returns 200 with created/existing counts and the resulting items.
 */
planItemsRouter.post(
  "/projects/:projectId/plan-items/bootstrap",
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

      await assertProjectOwnedByUser(projectId, uid);

      const inputs = parsePlanItemBootstrapBody(readBody(req));

      if (!inputs) {
        sendError(res, 400, "Invalid plan item bootstrap payload");
        return;
      }

      let created = 0;
      let existing = 0;
      const items: PlanItem[] = [];

      for (const input of inputs) {
        const remoteId = createRemotePlanItemId(
          projectId,
          input.localPlanItemId,
        );
        const found = await getPlanItemById(remoteId);

        if (found) {
          if (found.projectId !== projectId) {
            sendError(res, 404, "Plan item not found");
            return;
          }

          existing += 1;
          items.push(found);
          continue;
        }

        const planItem: PlanItem = {
          id: remoteId,
          projectId,
          ...input,
        };

        await setPlanItem(planItem);
        created += 1;
        items.push(planItem);
      }

      res.status(200).json({ created, existing, items });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Narrow PlanItem field update for an owned remote project.
 */
planItemsRouter.patch(
  "/projects/:projectId/plan-items/:planItemId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const planItemId = req.params.planItemId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !planItemId) {
        sendError(res, 400, "projectId and planItemId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const update = parsePlanItemUpdateInput(readBody(req));

      if (!update) {
        sendError(res, 400, "Invalid plan item update payload");
        return;
      }

      const existing = await getPlanItemById(planItemId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Plan item not found");
        return;
      }

      const planItem: PlanItem = {
        ...existing,
        ...(update.label !== undefined ? { label: update.label } : {}),
        ...(update.plannedValue !== undefined
          ? { plannedValue: update.plannedValue }
          : {}),
        ...(update.unitCost !== undefined ? { unitCost: update.unitCost } : {}),
        ...(update.productionRatePerDay !== undefined
          ? { productionRatePerDay: update.productionRatePerDay }
          : {}),
        ...(update.laborHoursPerUnit !== undefined
          ? { laborHoursPerUnit: update.laborHoursPerUnit }
          : {}),
      };

      await setPlanItem(planItem);
      res.status(200).json(planItem);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

planItemsRouter.get("/plan-items/:planItemId", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const planItemId = req.params.planItemId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!planItemId) {
      sendError(res, 400, "planItemId is required");
      return;
    }

    const item = await getPlanItemById(planItemId);

    if (!item) {
      sendError(res, 404, "Plan item not found");
      return;
    }

    await assertProjectOwnedByUser(item.projectId, uid);
    res.status(200).json(item);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

planItemsRouter.post("/plan-items", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const planItem = parsePlanItem(readBody(req));

    if (!planItem) {
      sendError(res, 400, "Invalid plan item payload");
      return;
    }

    await assertProjectOwnedByUser(planItem.projectId, uid);

    const existing = await getPlanItemById(planItem.id);

    if (existing) {
      sendError(res, 409, "Plan item already exists");
      return;
    }

    await setPlanItem(planItem);
    res.status(201).json(planItem);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
