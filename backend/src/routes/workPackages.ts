import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import type { WorkPackage } from "../domain/workPackage.js";
import { createWorkPackageId } from "../domain/workPackageId.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import {
  deleteWorkPackageById,
  getWorkPackageById,
  listWorkPackagesForProject,
  setWorkPackage,
} from "../repositories/workPackagesRepository.js";
import {
  commitWorkPackageImage,
  deleteWorkPackageImage,
  presentWorkPackage,
  presentWorkPackages,
  requestWorkPackageImageUpload,
  WorkPackageImageError,
} from "../services/workPackageImageService.js";
import {
  assertProjectAccessContext,
  canReadWorkPackageId,
  filterWorkPackagesForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parseWorkPackageCreateInput,
  parseWorkPackageImageCommitBody,
  parseWorkPackageImageUploadUrlBody,
  parseWorkPackageUpdateInput,
} from "../validation/workPackage.js";

export const workPackagesRouter = Router();

async function loadOwnedWorkPackageImageContext(input: {
  uid: string;
  projectId: string;
  workPackageId: string;
}) {
  const project = await assertProjectOwnedByUser(input.projectId, input.uid);
  const workPackage = await getWorkPackageById(input.workPackageId);
  if (!workPackage || workPackage.projectId !== input.projectId) {
    throw new WorkPackageImageError("Work package not found", 404);
  }
  return { project, workPackage };
}

async function handleWorkPackageImageRouteError(
  res: import("express").Response,
  error: unknown,
): Promise<void> {
  if (error instanceof WorkPackageImageError) {
    sendError(res, error.statusCode, error.message);
    return;
  }
  await handleRouteError(res, error);
}

/**
 * Ensures every planItemId is a canonical cloud PlanItem belonging to projectId.
 * Empty list is valid. Missing / foreign plan items → false.
 */
async function planItemIdsBelongToProject(
  projectId: string,
  planItemIds: readonly string[],
): Promise<boolean> {
  for (const planItemId of planItemIds) {
    const planItem = await getPlanItemById(planItemId);

    if (!planItem || planItem.projectId !== projectId) {
      return false;
    }
  }

  return true;
}

workPackagesRouter.get(
  "/projects/:projectId/work-packages",
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

      const access = await assertProjectAccessContext(projectId, uid);
      const items = await listWorkPackagesForProject(projectId);
      res.status(200).json(
        await presentWorkPackages(filterWorkPackagesForAccess(items, access)),
      );
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

workPackagesRouter.get(
  "/projects/:projectId/work-packages/:workPackageId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }

      const access = await assertProjectAccessContext(projectId, uid);

      const item = await getWorkPackageById(workPackageId);

      if (
        !item ||
        item.projectId !== projectId ||
        !canReadWorkPackageId(access, workPackageId)
      ) {
        sendError(res, 404, "Work package not found");
        return;
      }

      res.status(200).json(await presentWorkPackage(item));
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only WorkPackage create.
 * Server owns id, projectId, createdAt, updatedAt.
 */
workPackagesRouter.post(
  "/projects/:projectId/work-packages",
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

      const input = parseWorkPackageCreateInput(readBody(req));

      if (!input) {
        sendError(res, 400, "Invalid work package payload");
        return;
      }

      const planItemsOk = await planItemIdsBelongToProject(
        projectId,
        input.planItemIds,
      );

      if (!planItemsOk) {
        sendError(
          res,
          400,
          "planItemIds must reference PlanItems belonging to this project",
        );
        return;
      }

      const nowIso = new Date().toISOString();
      const workPackage: WorkPackage = {
        id: createWorkPackageId(),
        projectId,
        name: input.name,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        status: input.status,
        planItemIds: [...input.planItemIds],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await setWorkPackage(workPackage);
      res.status(201).json(await presentWorkPackage(workPackage));
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only narrow field update.
 * Mutable: name, description, status, planItemIds.
 */
workPackagesRouter.patch(
  "/projects/:projectId/work-packages/:workPackageId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const update = parseWorkPackageUpdateInput(readBody(req));

      if (!update) {
        sendError(res, 400, "Invalid work package update payload");
        return;
      }

      const existing = await getWorkPackageById(workPackageId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Work package not found");
        return;
      }

      const nextPlanItemIds =
        update.planItemIds !== undefined
          ? update.planItemIds
          : existing.planItemIds;

      if (update.planItemIds !== undefined) {
        const planItemsOk = await planItemIdsBelongToProject(
          projectId,
          nextPlanItemIds,
        );

        if (!planItemsOk) {
          sendError(
            res,
            400,
            "planItemIds must reference PlanItems belonging to this project",
          );
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const next: WorkPackage = {
        id: existing.id,
        projectId: existing.projectId,
        name: update.name !== undefined ? update.name : existing.name,
        status: update.status !== undefined ? update.status : existing.status,
        planItemIds: [...nextPlanItemIds],
        ...(existing.imageStoragePath !== undefined
          ? { imageStoragePath: existing.imageStoragePath }
          : {}),
        createdAt: existing.createdAt,
        updatedAt: nowIso,
      };

      if (update.description !== undefined) {
        const trimmed = update.description.trim();
        if (trimmed.length > 0) {
          next.description = update.description;
        }
      } else if (
        existing.description !== undefined &&
        existing.description.trim().length > 0
      ) {
        next.description = existing.description;
      }

      await setWorkPackage(next);
      res.status(200).json(await presentWorkPackage(next));
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

workPackagesRouter.post(
  "/projects/:projectId/work-packages/:workPackageId/image/upload-url",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;
      const parsed = parseWorkPackageImageUploadUrlBody(readBody(req));
      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "Invalid Work Package image upload request");
        return;
      }
      const { project, workPackage } = await loadOwnedWorkPackageImageContext({
        uid,
        projectId,
        workPackageId,
      });
      const signed = await requestWorkPackageImageUpload({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId,
        workPackage,
        contentType: parsed.contentType,
      });
      res.status(200).json(signed);
    } catch (error) {
      await handleWorkPackageImageRouteError(res, error);
    }
  },
);

workPackagesRouter.post(
  "/projects/:projectId/work-packages/:workPackageId/image/commit",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;
      const parsed = parseWorkPackageImageCommitBody(readBody(req));
      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "Invalid Work Package image commit request");
        return;
      }
      const { project, workPackage } = await loadOwnedWorkPackageImageContext({
        uid,
        projectId,
        workPackageId,
      });
      const presented = await commitWorkPackageImage({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId,
        workPackage,
        objectId: parsed.objectId,
        contentType: parsed.contentType,
      });
      res.status(200).json(presented);
    } catch (error) {
      await handleWorkPackageImageRouteError(res, error);
    }
  },
);

workPackagesRouter.delete(
  "/projects/:projectId/work-packages/:workPackageId/image",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;
      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }
      const { project, workPackage } = await loadOwnedWorkPackageImageContext({
        uid,
        projectId,
        workPackageId,
      });
      const presented = await deleteWorkPackageImage({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId,
        workPackage,
      });
      res.status(200).json(presented);
    } catch (error) {
      await handleWorkPackageImageRouteError(res, error);
    }
  },
);

/**
 * Owner-only WorkPackage delete.
 * Does not cascade to PlanItems or assignments (none yet).
 * Missing under owned project → 204 (idempotent).
 */
workPackagesRouter.delete(
  "/projects/:projectId/work-packages/:workPackageId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const workPackageId = req.params.workPackageId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !workPackageId) {
        sendError(res, 400, "projectId and workPackageId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getWorkPackageById(workPackageId);

      if (!existing) {
        res.status(204).send();
        return;
      }

      if (existing.projectId !== projectId) {
        sendError(res, 404, "Work package not found");
        return;
      }

      await deleteWorkPackageById(workPackageId);
      res.status(204).send();
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);
