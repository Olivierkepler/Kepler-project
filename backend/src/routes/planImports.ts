import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import type { PlanImport, PlanImportFile } from "../domain/planImport.js";
import {
  createRemotePlanImportFileId,
  createRemotePlanImportId,
} from "../domain/planImportId.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";
import { getCandidatesForImport } from "../repositories/planImportCandidatesRepository.js";
import {
  PlanImportProcessError,
  startPlanImportProcessing,
} from "../services/planImportProcess.js";
import {
  approvePlanImport,
  PlanImportApprovalError,
} from "../services/planImportApproval.js";
import {
  batchSelectPlanImportCandidates,
  deletePlanImportCandidate,
  markPlanImportReadyForApproval,
  parseBatchSelectCandidatesInput,
  parsePlanImportCandidatePatchInput,
  PlanImportReviewError,
  updatePlanImportCandidate,
} from "../services/planImportReview.js";
import {
  buildPlanImportObjectPath,
  createPlanImportUploadUrl,
  planImportObjectExists,
} from "../storage/planImportStorage.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { toPlanImportCandidateResponse } from "../validation/planImportCandidate.js";
import {
  parsePlanImportCreateInput,
  planImportCreatePayloadMatches,
  toPlanImportResponse,
} from "../validation/planImport.js";
import { presentPlanItems } from "../services/planItemImageService.js";

export const planImportsRouter = Router();

type UploadDescriptor = {
  fileId: string;
  localFileId: string;
  uploadUrl: string;
  storagePath: string;
  contentType: string;
  expiresAt: string;
};

async function buildUploadsForImport(
  item: PlanImport,
): Promise<UploadDescriptor[]> {
  const uploads: UploadDescriptor[] = [];

  for (const file of item.files) {
    const signed = await createPlanImportUploadUrl(
      file.storagePath,
      file.mimeType,
    );
    uploads.push({
      fileId: file.id,
      localFileId: file.localFileId,
      uploadUrl: signed.uploadUrl,
      storagePath: signed.storagePath,
      contentType: signed.contentType,
      expiresAt: signed.expiresAt,
    });
  }

  return uploads;
}

/**
 * Create a PlanImport and return short-lived signed PUT URLs.
 * Owner-only (matches PlanItem write trust model). Idempotent on localImportId.
 *
 * POST /api/projects/:projectId/plan-imports
 */
planImportsRouter.post("/projects/:projectId/plan-imports", async (req, res) => {
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

    let input;
    try {
      input = parsePlanImportCreateInput(readBody(req));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid plan import payload";
      sendError(res, 400, message);
      return;
    }

    if (!input) {
      sendError(res, 400, "Invalid plan import payload");
      return;
    }

    const project = await assertProjectOwnedByUser(projectId, uid);
    const remoteImportId = createRemotePlanImportId(
      projectId,
      input.localImportId,
    );

    const existing = await getPlanImportById(remoteImportId);

    if (existing) {
      if (existing.projectId !== projectId || existing.ownerUid !== project.ownerUid) {
        sendError(res, 404, "Project not found");
        return;
      }

      if (!planImportCreatePayloadMatches(existing, input)) {
        sendError(
          res,
          409,
          "A plan import with this localImportId already exists with different files.",
        );
        return;
      }

      if (existing.status === "uploaded") {
        res.status(200).json({
          import: toPlanImportResponse(existing),
          uploads: [],
        });
        return;
      }

      if (existing.status === "failed" || existing.status === "uploading") {
        const uploads = await buildUploadsForImport(existing);
        res.status(200).json({
          import: toPlanImportResponse(existing),
          uploads,
        });
        return;
      }

      // processing / ready_for_review / ready_for_approval — no new uploads
      res.status(200).json({
        import: toPlanImportResponse(existing),
        uploads: [],
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const files: PlanImportFile[] = input.files.map((file) => {
      const remoteFileId = createRemotePlanImportFileId(
        remoteImportId,
        file.localFileId,
      );
      const storagePath = buildPlanImportObjectPath(
        project.ownerUid,
        projectId,
        remoteImportId,
        remoteFileId,
        file.mimeType,
      );

      return {
        id: remoteFileId,
        localFileId: file.localFileId,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        storagePath,
        uploadStatus: "pending",
      };
    });

    const created: PlanImport = {
      id: remoteImportId,
      projectId,
      ownerUid: project.ownerUid,
      createdByUid: uid,
      localImportId: input.localImportId,
      status: "uploading",
      files,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setPlanImport(created);
    const uploads = await buildUploadsForImport(created);

    res.status(201).json({
      import: toPlanImportResponse(created),
      uploads,
    });
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Verify GCS objects exist, then transition uploading → uploaded.
 * Idempotent when already uploaded.
 *
 * POST /api/projects/:projectId/plan-imports/:importId/commit
 */
planImportsRouter.post(
  "/projects/:projectId/plan-imports/:importId/commit",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getPlanImportById(importId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Plan import not found");
        return;
      }

      if (existing.status === "uploaded") {
        res.status(200).json({
          import: toPlanImportResponse(existing),
        });
        return;
      }

      if (
        existing.status === "processing" ||
        existing.status === "ready_for_review" ||
        existing.status === "ready_for_approval"
      ) {
        res.status(200).json({
          import: toPlanImportResponse(existing),
        });
        return;
      }

      if (existing.status !== "uploading" && existing.status !== "failed") {
        sendError(res, 409, "Plan import cannot be committed in its current state.");
        return;
      }

      const missingPaths = new Set<string>();

      for (const file of existing.files) {
        const exists = await planImportObjectExists(file.storagePath);
        if (!exists) {
          missingPaths.add(file.storagePath);
        }
      }

      if (missingPaths.size > 0) {
        const missingNames = existing.files
          .filter((file) => missingPaths.has(file.storagePath))
          .map((file) => file.name);
        const failed: PlanImport = {
          ...existing,
          status: "failed",
          errorMessage: `Upload incomplete. Missing object(s): ${missingNames.join(", ")}`,
          updatedAt: new Date().toISOString(),
          files: existing.files.map((file) => ({
            ...file,
            uploadStatus: missingPaths.has(file.storagePath)
              ? "failed"
              : file.uploadStatus,
          })),
        };
        await setPlanImport(failed);
        sendError(res, 409, failed.errorMessage ?? "Upload incomplete.");
        return;
      }

      const committed: PlanImport = {
        ...existing,
        status: "uploaded",
        updatedAt: new Date().toISOString(),
        files: existing.files.map((file) => ({
          ...file,
          uploadStatus: "uploaded",
        })),
      };
      delete committed.errorMessage;

      await setPlanImport(committed);

      res.status(200).json({
        import: toPlanImportResponse(committed),
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Fetch a single PlanImport (owner-only).
 *
 * GET /api/projects/:projectId/plan-imports/:importId
 */
planImportsRouter.get(
  "/projects/:projectId/plan-imports/:importId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getPlanImportById(importId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Plan import not found");
        return;
      }

      res.status(200).json({
        import: toPlanImportResponse(existing),
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Start async document intelligence for an uploaded PlanImport (Phase 2P.3).
 * Owner-only. Does not create PlanItems.
 *
 * POST /api/projects/:projectId/plan-imports/:importId/process
 */
planImportsRouter.post(
  "/projects/:projectId/plan-imports/:importId/process",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      try {
        const result = await startPlanImportProcessing({
          projectId,
          importId,
        });

        res.status(200).json({
          import: toPlanImportResponse(result.import),
          alreadyProcessing: result.alreadyProcessing,
          alreadyReady: result.alreadyReady,
        });
      } catch (error) {
        if (error instanceof PlanImportProcessError) {
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
 * List validated PlanImportCandidates for an import (Phase 2P.3).
 * Owner-only. Read-only proposed data — never PlanItems.
 *
 * GET /api/projects/:projectId/plan-imports/:importId/candidates
 */
planImportsRouter.get(
  "/projects/:projectId/plan-imports/:importId/candidates",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getPlanImportById(importId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Plan import not found");
        return;
      }

      const candidates = await getCandidatesForImport(importId);

      res.status(200).json({
        candidates: candidates.map(toPlanImportCandidateResponse),
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Batch select/deselect candidates for an import (Phase 2P.4).
 * Owner-only. Does not create PlanItems.
 *
 * PATCH /api/projects/:projectId/plan-imports/:importId/candidates
 */
planImportsRouter.patch(
  "/projects/:projectId/plan-imports/:importId/candidates",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      let input;
      try {
        input = parseBatchSelectCandidatesInput(readBody(req));
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
          sendError(res, error.statusCode, error.message);
          return;
        }
        throw error;
      }

      try {
        const candidates = await batchSelectPlanImportCandidates({
          projectId,
          importId,
          candidateIds: input.candidateIds,
          selected: input.selected,
        });

        res.status(200).json({
          candidates: candidates.map(toPlanImportCandidateResponse),
        });
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
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
 * Update a single candidate (review-safe fields only). Owner-only.
 * Preserves original AI extraction. Does not create PlanItems.
 *
 * PATCH /api/projects/:projectId/plan-imports/:importId/candidates/:candidateId
 */
planImportsRouter.patch(
  "/projects/:projectId/plan-imports/:importId/candidates/:candidateId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;
      const candidateId = req.params.candidateId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId || !candidateId) {
        sendError(res, 400, "projectId, importId, and candidateId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      let patch;
      try {
        patch = parsePlanImportCandidatePatchInput(readBody(req));
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
          sendError(res, error.statusCode, error.message);
          return;
        }
        throw error;
      }

      try {
        const candidate = await updatePlanImportCandidate({
          projectId,
          importId,
          candidateId,
          reviewerUid: uid,
          patch,
        });

        res.status(200).json({
          candidate: toPlanImportCandidateResponse(candidate),
        });
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
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
 * Delete exactly one generated candidate. Owner-only.
 * Allowed only while import is ready_for_review or ready_for_approval.
 * Does not delete PlanItems, the import, or source files.
 *
 * DELETE /api/projects/:projectId/plan-imports/:importId/candidates/:candidateId
 */
planImportsRouter.delete(
  "/projects/:projectId/plan-imports/:importId/candidates/:candidateId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;
      const candidateId = req.params.candidateId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId || !candidateId) {
        sendError(res, 400, "projectId, importId, and candidateId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      try {
        await deletePlanImportCandidate({
          projectId,
          importId,
          candidateId,
        });
        res.status(204).send();
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
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
 * Mark human review complete → ready_for_approval (Phase 2P.4).
 * Owner-only. Does NOT create PlanItems or transition to approved.
 *
 * POST /api/projects/:projectId/plan-imports/:importId/ready-for-approval
 */
planImportsRouter.post(
  "/projects/:projectId/plan-imports/:importId/ready-for-approval",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      try {
        const result = await markPlanImportReadyForApproval({
          projectId,
          importId,
        });

        res.status(200).json({
          import: toPlanImportResponse(result.import),
          candidates: result.candidates.map(toPlanImportCandidateResponse),
        });
      } catch (error) {
        if (error instanceof PlanImportReviewError) {
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
 * Approve reviewed candidates → authoritative PlanItems (Phase 2P.5).
 * Owner-only. Idempotent. Does not accept candidate payloads from the client.
 *
 * POST /api/projects/:projectId/plan-imports/:importId/approve
 */
planImportsRouter.post(
  "/projects/:projectId/plan-imports/:importId/approve",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const importId = req.params.importId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !importId) {
        sendError(res, 400, "projectId and importId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      try {
        const result = await approvePlanImport({
          projectId,
          importId,
          approverUid: uid,
        });

        res.status(200).json({
          import: toPlanImportResponse(result.import),
          createdPlanItemIds: result.createdPlanItemIds,
          createdCount: result.createdCount,
          alreadyApproved: result.alreadyApproved,
          planItems: await presentPlanItems(result.planItems),
        });
      } catch (error) {
        if (error instanceof PlanImportApprovalError) {
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

