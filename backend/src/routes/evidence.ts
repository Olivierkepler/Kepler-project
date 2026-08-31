import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import type { Evidence } from "../domain/evidence.js";
import { createRemoteEvidenceId } from "../domain/evidenceId.js";
import {
  getEvidenceById,
  getEvidenceForProject,
  setEvidence,
  deleteEvidenceById,
} from "../repositories/evidenceRepository.js";
import { getDeltasForProject } from "../repositories/deltasRepository.js";
import { getMeasurementsForProject } from "../repositories/measurementsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import {
  buildEvidenceObjectPath,
  createEvidenceReadUrl,
  createEvidenceUploadUrl,
  deleteEvidenceObject,
} from "../storage/evidenceStorage.js";
import {
  evidenceMetadataMatches,
  parseEvidenceUploadUrlInput,
  parseEvidenceWriteInput,
} from "../validation/evidence.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { triggerFieldVarianceResumeForNewEvidence } from "../services/fieldVarianceResumeTrigger.js";
import {
  assertProjectAccessContext,
  filterEvidenceForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  assertDeltaLinkedFieldWritableByUser,
  assertMeasurementLinkedFieldWritableByUser,
} from "../services/collaboration/projectFieldWriteAccess.js";

export const evidenceRouter = Router();

function toEvidenceListItem(evidence: Evidence) {
  return {
    id: evidence.id,
    projectId: evidence.projectId,
    localEvidenceId: evidence.localEvidenceId,
    type: evidence.type,
    note: evidence.note,
    objectPath: evidence.objectPath,
    contentType: evidence.contentType,
    createdAt: evidence.createdAt,
    localMeasurementId: evidence.localMeasurementId ?? null,
    localDeltaId: evidence.localDeltaId ?? null,
    ...(evidence.capturedByUid
      ? { capturedByUid: evidence.capturedByUid }
      : {}),
  };
}

/**
 * List Evidence metadata for a readable remote project (Phase 2H.1 scoped READ).
 */
evidenceRouter.get("/projects/:projectId/evidence", async (req, res) => {
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
    const [items, measurements, deltas] = await Promise.all([
      getEvidenceForProject(projectId),
      getMeasurementsForProject(projectId),
      getDeltasForProject(projectId),
    ]);
    const filtered = filterEvidenceForAccess(
      items,
      measurements,
      deltas,
      access,
    );
    res.status(200).json(filtered.map(toEvidenceListItem));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Short-lived signed PUT URL for private photo evidence objects.
 * Owner: existing behavior (path under owner uid).
 * Collaborator: requires localMeasurementId + writable Measurement scope;
 * path under Project.ownerUid tenancy.
 */
evidenceRouter.post(
  "/projects/:projectId/evidence/upload-url",
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

      const input = parseEvidenceUploadUrlInput(readBody(req));

      if (!input) {
        sendError(res, 400, "Invalid evidence upload URL payload");
        return;
      }

      const project = await getProjectById(projectId);

      if (!project) {
        sendError(res, 404, "Project not found");
        return;
      }

      const isOwner = project.ownerUid === uid;
      let storageOwnerUid = project.ownerUid;

      if (isOwner) {
        await assertProjectOwnedByUser(projectId, uid);
        storageOwnerUid = uid;
      } else {
        if (input.localDeltaId) {
          if (input.localMeasurementId) {
            sendError(res, 400, "Invalid evidence upload URL payload");
            return;
          }
          await assertDeltaLinkedFieldWritableByUser(
            projectId,
            uid,
            input.localDeltaId,
          );
          storageOwnerUid = project.ownerUid;
        } else if (input.localMeasurementId) {
          await assertMeasurementLinkedFieldWritableByUser(
            projectId,
            uid,
            input.localMeasurementId,
          );
          storageOwnerUid = project.ownerUid;
        } else {
          sendError(res, 400, "localMeasurementId is required");
          return;
        }
      }

      const remoteEvidenceId = createRemoteEvidenceId(
        projectId,
        input.localEvidenceId,
      );
      const objectPath = buildEvidenceObjectPath(
        storageOwnerUid,
        projectId,
        remoteEvidenceId,
        input.contentType,
      );

      const signed = await createEvidenceUploadUrl(
        objectPath,
        input.contentType,
      );

      res.status(200).json({
        remoteEvidenceId,
        localEvidenceId: input.localEvidenceId,
        ...signed,
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Short-lived signed GET URL for a photo Evidence object.
 * Authorization follows Phase 2H project access + Evidence read scope.
 * Storage tenancy is Project.ownerUid; do not require evidence.ownerUid === uid.
 */
evidenceRouter.post(
  "/projects/:projectId/evidence/:evidenceId/read-url",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const evidenceId = req.params.evidenceId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !evidenceId) {
        sendError(res, 400, "projectId and evidenceId are required");
        return;
      }

      const access = await assertProjectAccessContext(projectId, uid);
      const evidence = await getEvidenceById(evidenceId);

      if (!evidence || evidence.projectId !== projectId) {
        sendError(res, 404, "Evidence not found");
        return;
      }

      const [measurements, deltas] = await Promise.all([
        getMeasurementsForProject(projectId),
        getDeltasForProject(projectId),
      ]);
      const readable = filterEvidenceForAccess(
        [evidence],
        measurements,
        deltas,
        access,
      );

      if (readable.length === 0) {
        sendError(res, 404, "Evidence not found");
        return;
      }

      if (evidence.type !== "photo" || !evidence.objectPath) {
        sendError(res, 400, "Evidence does not have a readable photo object");
        return;
      }

      const signed = await createEvidenceReadUrl(evidence.objectPath);
      res.status(200).json({
        remoteEvidenceId: evidence.id,
        ...signed,
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Idempotent Evidence metadata create.
 * Owner: unchanged create semantics; ownerUid = writer; capturedByUid set.
 * Collaborator: Measurement-linked only; ownerUid = Project.ownerUid;
 * path under project owner tenancy; re-authorize at commit.
 */
evidenceRouter.post("/projects/:projectId/evidence", async (req, res) => {
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

    const input = parseEvidenceWriteInput(readBody(req));

    if (!input) {
      sendError(res, 400, "Invalid evidence payload");
      return;
    }

    const project = await getProjectById(projectId);

    if (!project) {
      sendError(res, 404, "Project not found");
      return;
    }

    const isOwner = project.ownerUid === uid;
    let storageOwnerUid = project.ownerUid;

    if (isOwner) {
      await assertProjectOwnedByUser(projectId, uid);
      storageOwnerUid = uid;
    } else {
      if (input.localDeltaId) {
        if (input.localMeasurementId) {
          sendError(res, 404, "Evidence not found");
          return;
        }
        await assertDeltaLinkedFieldWritableByUser(
          projectId,
          uid,
          input.localDeltaId,
        );
        storageOwnerUid = project.ownerUid;
      } else if (input.localMeasurementId) {
        await assertMeasurementLinkedFieldWritableByUser(
          projectId,
          uid,
          input.localMeasurementId,
        );
        storageOwnerUid = project.ownerUid;
      } else {
        sendError(res, 404, "Evidence not found");
        return;
      }
    }

    const remoteEvidenceId = createRemoteEvidenceId(
      projectId,
      input.localEvidenceId,
    );

    if (input.type === "photo") {
      const expectedPath = buildEvidenceObjectPath(
        storageOwnerUid,
        projectId,
        remoteEvidenceId,
        input.contentType ?? "image/jpeg",
      );

      if (input.objectPath !== expectedPath) {
        sendError(res, 400, "Invalid evidence object path");
        return;
      }
    }

    const existing = await getEvidenceById(remoteEvidenceId);

    if (existing) {
      if (
        existing.projectId !== projectId ||
        existing.ownerUid !== storageOwnerUid
      ) {
        sendError(res, 404, "Evidence not found");
        return;
      }

      if (
        evidenceMetadataMatches(existing, input, storageOwnerUid, projectId)
      ) {
        res.status(200).json(toEvidenceListItem(existing));
        return;
      }

      // Owner-only refresh of same-identity metadata. Collaborators may not
      // mutate existing Evidence after create.
      if (!isOwner) {
        sendError(res, 404, "Evidence not found");
        return;
      }

      const updated: Evidence = {
        id: remoteEvidenceId,
        ownerUid: storageOwnerUid,
        projectId,
        localEvidenceId: input.localEvidenceId,
        type: input.type,
        note: input.note,
        objectPath: input.objectPath,
        contentType: input.contentType,
        createdAt: existing.createdAt,
        localMeasurementId: input.localMeasurementId,
        localDeltaId: input.localDeltaId,
        capturedByUid: existing.capturedByUid ?? uid,
      };

      await setEvidence(updated);
      res.status(200).json(toEvidenceListItem(updated));
      return;
    }

    const evidence: Evidence = {
      id: remoteEvidenceId,
      ownerUid: storageOwnerUid,
      projectId,
      localEvidenceId: input.localEvidenceId,
      type: input.type,
      note: input.note,
      objectPath: input.objectPath,
      contentType: input.contentType,
      createdAt: input.createdAt,
      localMeasurementId: input.localMeasurementId,
      localDeltaId: input.localDeltaId,
      capturedByUid: uid,
    };

    await setEvidence(evidence);

    // A5: resume waiting Field Variance only for genuine NEW Delta Evidence.
    // Enqueue failures must not fail Evidence creation or mutate Evidence.
    void triggerFieldVarianceResumeForNewEvidence(evidence).catch(() => {
      // Trigger logs enqueue_failed; Evidence response stays 201.
    });

    res.status(201).json(toEvidenceListItem(evidence));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Idempotent Evidence delete — OWNER-ONLY.
 * Collaborators cannot delete even Evidence they captured.
 * Missing Evidence under an owned project → 204.
 */
evidenceRouter.delete(
  "/projects/:projectId/evidence/:evidenceId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const evidenceId = req.params.evidenceId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !evidenceId) {
        sendError(res, 400, "projectId and evidenceId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const evidence = await getEvidenceById(evidenceId);

      if (!evidence) {
        res.status(204).send();
        return;
      }

      // Collaborator-captured Evidence uses Project.ownerUid as ownerUid
      // (storage tenancy), so the project owner can delete it.
      if (evidence.projectId !== projectId || evidence.ownerUid !== uid) {
        sendError(res, 404, "Evidence not found");
        return;
      }

      if (evidence.objectPath) {
        await deleteEvidenceObject(evidence.objectPath);
      }

      await deleteEvidenceById(evidenceId);
      res.status(204).send();
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);
