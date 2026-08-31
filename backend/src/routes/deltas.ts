import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import type { Delta } from "../domain/delta.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import { getMeasurementById } from "../repositories/measurementsRepository.js";
import {
  getDeltaById,
  getDeltasForProject,
  markDeltaReviewed,
  setDelta,
  updateDeltaDisposition,
} from "../repositories/deltasRepository.js";
import {
  assertProjectAccessContext,
  filterDeltasForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parseDelta,
  parseDeltaBootstrapBody,
  parseDeltaDispositionPatch,
} from "../validation/delta.js";
import { triggerFieldVarianceForNewDelta } from "../services/fieldVarianceTrigger.js";
import { projectDeltaCreatedActivity } from "../services/activity/projectActivityProjections.js";

export const deltasRouter = Router();

deltasRouter.get("/projects/:projectId/deltas", async (req, res) => {
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
    const deltas = await getDeltasForProject(projectId);
    res.status(200).json(filterDeltasForAccess(deltas, access));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Narrow local→cloud review sync: open → accepted (legacy "reviewed").
 * Idempotent when already accepted/reviewed.
 * Prefer PATCH /deltas/:id for Phase 56 disposition.
 */
deltasRouter.patch(
  "/projects/:projectId/deltas/:deltaId/review",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const deltaId = req.params.deltaId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      if (!deltaId) {
        sendError(res, 400, "deltaId is required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getDeltaById(deltaId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Delta not found");
        return;
      }

      const reviewed = await markDeltaReviewed(deltaId);

      if (!reviewed || reviewed.projectId !== projectId) {
        sendError(res, 404, "Delta not found");
        return;
      }

      res.status(200).json(reviewed);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Phase 56 disposition update.
 * Client sends status + dispositionReason; server owns disposedAt.
 */
deltasRouter.patch(
  "/projects/:projectId/deltas/:deltaId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const deltaId = req.params.deltaId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !deltaId) {
        sendError(res, 400, "projectId and deltaId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getDeltaById(deltaId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Delta not found");
        return;
      }

      const patch = parseDeltaDispositionPatch(readBody(req));

      if (!patch) {
        sendError(res, 400, "Invalid delta disposition payload");
        return;
      }

      const updated = await updateDeltaDisposition(
        deltaId,
        patch.status,
        patch.dispositionReason,
      );

      if (!updated || updated.projectId !== projectId) {
        sendError(res, 404, "Delta not found");
        return;
      }

      res.status(200).json(updated);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Idempotent Delta bootstrap for an owned remote project.
 * Resolves PlanItem + Measurement server-side; does not recalculate formulas.
 */
deltasRouter.post(
  "/projects/:projectId/deltas/bootstrap",
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

      const inputs = parseDeltaBootstrapBody(readBody(req));

      if (!inputs) {
        sendError(res, 400, "Invalid delta bootstrap payload");
        return;
      }

      let created = 0;
      let existing = 0;
      const items: Delta[] = [];

      for (const input of inputs) {
        const remotePlanItemId = createRemotePlanItemId(
          projectId,
          input.localPlanItemId,
        );
        const planItem = await getPlanItemById(remotePlanItemId);

        if (!planItem || planItem.projectId !== projectId) {
          sendError(res, 400, "localPlanItemId does not belong to project");
          return;
        }

        const remoteMeasurementId = createRemoteMeasurementId(
          projectId,
          input.localMeasurementId,
        );
        const measurement = await getMeasurementById(remoteMeasurementId);

        if (!measurement || measurement.projectId !== projectId) {
          sendError(res, 400, "localMeasurementId does not belong to project");
          return;
        }

        if (measurement.planItemId !== planItem.id) {
          sendError(
            res,
            400,
            "measurement does not belong to the supplied plan item",
          );
          return;
        }

        const remoteId = createRemoteDeltaId(projectId, input.localDeltaId);
        const found = await getDeltaById(remoteId);

        if (found) {
          if (found.projectId !== projectId) {
            sendError(res, 404, "Delta not found");
            return;
          }

          existing += 1;
          items.push(found);
          continue;
        }

        const delta: Delta = {
          id: remoteId,
          localDeltaId: input.localDeltaId,
          projectId,
          planItemId: planItem.id,
          measurementId: measurement.id,
          type: "length",
          plannedValue: input.plannedValue,
          actualValue: input.actualValue,
          difference: input.difference,
          percentDifference: input.percentDifference,
          unit: input.unit,
          unitCost: input.unitCost,
          costImpact: input.costImpact,
          productionRatePerDay: input.productionRatePerDay,
          scheduleImpactDays: input.scheduleImpactDays,
          laborHoursPerUnit: input.laborHoursPerUnit,
          laborImpactHours: input.laborImpactHours,
          status: input.status,
          dispositionReason: input.dispositionReason,
          disposedAt: input.disposedAt,
          createdAt: input.createdAt,
        };

        await setDelta(delta);
        created += 1;
        items.push(delta);

        try {
          await projectDeltaCreatedActivity({
            delta,
            measurement,
            actorType: "human",
            actorUid: uid,
            projectOwnerUid: uid,
          });
        } catch {
          // Activity projection is best-effort.
        }

        // Phase A2: Field Variance Agent trigger (new Delta only).
        // Enqueue failures are logged; Delta bootstrap still succeeds.
        await triggerFieldVarianceForNewDelta({
          ownerUid: uid,
          projectId,
          delta,
          measurement,
        });
      }

      res.status(200).json({ created, existing, items });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

deltasRouter.get("/deltas/:deltaId", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const deltaId = req.params.deltaId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!deltaId) {
      sendError(res, 400, "deltaId is required");
      return;
    }

    const delta = await getDeltaById(deltaId);

    if (!delta) {
      sendError(res, 404, "Delta not found");
      return;
    }

    await assertProjectOwnedByUser(delta.projectId, uid);
    res.status(200).json(delta);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

deltasRouter.post("/deltas", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const delta = parseDelta(readBody(req));

    if (!delta) {
      sendError(res, 400, "Invalid delta payload");
      return;
    }

    await assertProjectOwnedByUser(delta.projectId, uid);

    const planItem = await getPlanItemById(delta.planItemId);
    const measurement = await getMeasurementById(delta.measurementId);

    if (!planItem || planItem.projectId !== delta.projectId) {
      sendError(res, 400, "planItemId does not belong to projectId");
      return;
    }

    if (!measurement || measurement.projectId !== delta.projectId) {
      sendError(res, 400, "measurementId does not belong to projectId");
      return;
    }

    if (measurement.planItemId !== delta.planItemId) {
      sendError(res, 400, "measurement planItemId does not match delta");
      return;
    }

    const existing = await getDeltaById(delta.id);

    if (existing) {
      sendError(res, 409, "Delta already exists");
      return;
    }

    await setDelta(delta);
    res.status(201).json(delta);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
