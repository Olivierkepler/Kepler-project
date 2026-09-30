import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import type { Measurement } from "../domain/measurement.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import {
  applyMeasurementContributionReview,
  listContributionReviewEventsForMeasurement,
  normalizeContributionReviewNote,
} from "../repositories/contributionReviewEventsRepository.js";
import {
  getMeasurementById,
  getMeasurementsForProject,
  setMeasurement,
} from "../repositories/measurementsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import {
  assertProjectAccessContext,
  filterMeasurementsForAccess,
} from "../services/collaboration/projectAccessScope.js";
import { assertPlanItemFieldWritableByUser } from "../services/collaboration/projectFieldWriteAccess.js";
import { bridgeAcceptedCollaboratorMeasurementToFieldVariance } from "../services/acceptedMeasurementAgentBridge.js";
import {
  projectContributionReviewActivity,
  projectMeasurementSubmittedActivity,
} from "../services/activity/projectActivityProjections.js";
import {
  OwnerMeasurementReconcileError,
  reconcileOwnerMeasurementToDelta,
} from "../services/reconcileOwnerMeasurementToDelta.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parseMeasurement,
  parseMeasurementBootstrapBody,
  parseMeasurementContributionReviewBody,
} from "../validation/measurement.js";

export const measurementsRouter = Router();

/**
 * Pending contribution queue: only explicit reviewStatus === "pending".
 * Legacy missing reviewStatus is effectively accepted and excluded.
 * Sorted createdAt DESC, then id DESC for stable ties.
 */
function filterPendingReviewMeasurements(
  measurements: readonly Measurement[],
): Measurement[] {
  return measurements
    .filter((measurement) => measurement.reviewStatus === "pending")
    .sort((a, b) => {
      const timeCmp = b.createdAt.localeCompare(a.createdAt);
      if (timeCmp !== 0) {
        return timeCmp;
      }
      return b.id.localeCompare(a.id);
    });
}

measurementsRouter.get(
  "/projects/:projectId/measurements",
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

      const reviewStatusQuery =
        typeof req.query.reviewStatus === "string"
          ? req.query.reviewStatus.trim()
          : undefined;

      if (reviewStatusQuery !== undefined && reviewStatusQuery !== "pending") {
        sendError(res, 400, "Invalid reviewStatus filter");
        return;
      }

      const access = await assertProjectAccessContext(projectId, uid);

      if (reviewStatusQuery === "pending") {
        // Owner-only pending contribution queue (Phase 2J.1).
        if (access.accessMode !== "full" || !access.isOwner) {
          sendError(res, 404, "Project not found");
          return;
        }

        const measurements = await getMeasurementsForProject(projectId);
        const scoped = filterMeasurementsForAccess(measurements, access);
        res.status(200).json(filterPendingReviewMeasurements(scoped));
        return;
      }

      const measurements = await getMeasurementsForProject(projectId);
      res.status(200).json(filterMeasurementsForAccess(measurements, access));
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Idempotent Measurement bootstrap for an owned remote project.
 * Resolves PlanItems server-side from localPlanItemId.
 * Owner-authorized creates are auto-accepted (no review event).
 */
measurementsRouter.post(
  "/projects/:projectId/measurements/bootstrap",
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

      const inputs = parseMeasurementBootstrapBody(readBody(req));

      if (!inputs) {
        sendError(res, 400, "Invalid measurement bootstrap payload");
        return;
      }

      let created = 0;
      let existing = 0;
      const items: Measurement[] = [];

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

        const remoteId = createRemoteMeasurementId(
          projectId,
          input.localMeasurementId,
        );
        const found = await getMeasurementById(remoteId);

        if (found) {
          if (found.projectId !== projectId) {
            sendError(res, 404, "Measurement not found");
            return;
          }

          existing += 1;
          items.push(found);
          continue;
        }

        const measurement: Measurement = {
          id: remoteId,
          localMeasurementId: input.localMeasurementId,
          projectId,
          planItemId: planItem.id,
          type: input.type,
          label: input.label,
          value: input.value,
          unit: input.unit,
          createdAt: input.createdAt,
          capturedByUid: uid,
          reviewStatus: "accepted",
        };

        await setMeasurement(measurement);
        created += 1;
        items.push(measurement);
      }

      res.status(200).json({ created, existing, items });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

measurementsRouter.get("/measurements/:measurementId", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const measurementId = req.params.measurementId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!measurementId) {
      sendError(res, 400, "measurementId is required");
      return;
    }

    const measurement = await getMeasurementById(measurementId);

    if (!measurement) {
      sendError(res, 404, "Measurement not found");
      return;
    }

    await assertProjectOwnedByUser(measurement.projectId, uid);
    res.status(200).json(measurement);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Owner-only Measurement contribution review (Phase 2J.1).
 * Does not create Delta or agent runs.
 */
measurementsRouter.patch(
  "/projects/:projectId/measurements/:measurementId/review",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const measurementId = req.params.measurementId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !measurementId) {
        sendError(res, 400, "projectId and measurementId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const parsed = parseMeasurementContributionReviewBody(readBody(req));

      if (!parsed) {
        sendError(res, 400, "Invalid review payload");
        return;
      }

      const normalizedNote = normalizeContributionReviewNote(parsed.note);

      if (normalizedNote === null) {
        sendError(res, 400, "Invalid review note");
        return;
      }

      const result = await applyMeasurementContributionReview({
        projectId,
        measurementId,
        reviewerUid: uid,
        status: parsed.status,
        note: normalizedNote,
      });

      if (result.kind === "not_found") {
        sendError(res, 404, "Measurement not found");
        return;
      }

      if (result.kind === "updated") {
        try {
          const project = await getProjectById(projectId);
          if (project) {
            await projectContributionReviewActivity({
              event: result.event,
              measurement: result.measurement,
              projectOwnerUid: project.ownerUid,
            });
          }
        } catch {
          // Activity projection is best-effort.
        }
      }

      // Phase 2L.1: only on an actual pending/rejected → accepted transition
      // for collaborator contributions. Acceptance remains durable if bridge fails.
      if (
        result.kind === "updated" &&
        result.measurement.reviewStatus === "accepted"
      ) {
        try {
          await bridgeAcceptedCollaboratorMeasurementToFieldVariance({
            projectId,
            measurement: result.measurement,
          });
        } catch (bridgeError) {
          console.error(
            JSON.stringify({
              event: "accepted_measurement_agent_bridge_failed",
              projectId,
              measurementId,
              message:
                bridgeError instanceof Error
                  ? bridgeError.message.slice(0, 120)
                  : "unknown",
              timestamp: new Date().toISOString(),
            }),
          );
        }
      }

      res.status(200).json(result.measurement);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only append-only review history for a Measurement.
 */
measurementsRouter.get(
  "/projects/:projectId/measurements/:measurementId/review-events",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const measurementId = req.params.measurementId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !measurementId) {
        sendError(res, 400, "projectId and measurementId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const measurement = await getMeasurementById(measurementId);

      if (!measurement || measurement.projectId !== projectId) {
        sendError(res, 404, "Measurement not found");
        return;
      }

      const events = await listContributionReviewEventsForMeasurement(
        projectId,
        measurementId,
      );
      res.status(200).json(events);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only Plan-vs-Reality reconciliation (Phase 2F-C).
 * Server calculates from canonical Measurement + PlanItem.
 * Empty body; no client arithmetic.
 */
measurementsRouter.post(
  "/projects/:projectId/measurements/:measurementId/reconcile",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const measurementId = req.params.measurementId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !measurementId) {
        sendError(res, 400, "projectId and measurementId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const result = await reconcileOwnerMeasurementToDelta({
        projectId,
        measurementId,
        ownerUid: uid,
      });

      if (result.outcome === "no_delta") {
        res.status(200).json({
          outcome: "no_delta",
          reason: "zero_difference",
          measurementId: result.measurementId,
          delta: null,
        });
        return;
      }

      res.status(200).json({
        outcome: result.outcome,
        measurementId: result.measurementId,
        delta: result.delta,
      });
    } catch (error) {
      if (error instanceof OwnerMeasurementReconcileError) {
        sendError(res, error.statusCode, error.message, error.code);
        return;
      }
      await handleRouteError(res, error);
    }
  },
);

/**
 * Create-only Measurement.
 * Owner: reviewStatus accepted (no review event); capturedByUid from auth.
 * Contractor / field_member: reviewStatus pending + server provenance snapshot.
 */
measurementsRouter.post("/measurements", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const parsed = parseMeasurement(readBody(req));

    if (!parsed) {
      sendError(res, 400, "Invalid measurement payload");
      return;
    }

    const project = await getProjectById(parsed.projectId);

    if (!project) {
      sendError(res, 404, "Project not found");
      return;
    }

    const isOwner = project.ownerUid === uid;

    if (isOwner) {
      await assertProjectOwnedByUser(parsed.projectId, uid);

      const planItem = await getPlanItemById(parsed.planItemId);

      if (!planItem || planItem.projectId !== parsed.projectId) {
        sendError(res, 400, "planItemId does not belong to projectId");
        return;
      }

      const existing = await getMeasurementById(parsed.id);

      if (existing) {
        sendError(res, 409, "Measurement already exists");
        return;
      }

      const measurement: Measurement = {
        ...parsed,
        capturedByUid: uid,
        reviewStatus: "accepted",
      };

      await setMeasurement(measurement);
      res.status(201).json(measurement);
      return;
    }

    const write = await assertPlanItemFieldWritableByUser(
      parsed.projectId,
      uid,
      parsed.planItemId,
    );

    const remoteId = createRemoteMeasurementId(
      parsed.projectId,
      parsed.localMeasurementId,
    );

    if (parsed.id !== remoteId) {
      sendError(res, 400, "Invalid measurement id");
      return;
    }

    const existing = await getMeasurementById(remoteId);

    if (existing) {
      sendError(res, 409, "Measurement already exists");
      return;
    }

    const provenance = write.authorizationProvenance;

    const measurement: Measurement = {
      id: remoteId,
      localMeasurementId: parsed.localMeasurementId,
      projectId: parsed.projectId,
      planItemId: parsed.planItemId,
      type: parsed.type,
      label: parsed.label,
      value: parsed.value,
      unit: parsed.unit,
      createdAt: parsed.createdAt,
      capturedByUid: uid,
      reviewStatus: "pending",
      capturedByProjectMemberId: provenance.projectMemberId,
      submittedAssignmentId: provenance.assignmentId,
      submittedWorkPackageId: provenance.workPackageId,
    };

    await setMeasurement(measurement);

    try {
      await projectMeasurementSubmittedActivity({
        measurement,
        actorUid: uid,
        projectOwnerUid: project.ownerUid,
      });
    } catch {
      // Activity projection is best-effort.
    }

    res.status(201).json(measurement);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
