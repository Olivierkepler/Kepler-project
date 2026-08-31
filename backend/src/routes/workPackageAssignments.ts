import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import {
  applyAssignmentProgressTransition,
  normalizeAssignmentProgressNote,
} from "../repositories/assignmentProgressEventsRepository.js";
import {
  createWorkPackageAssignmentIfAbsent,
  deleteWorkPackageAssignmentById,
  getWorkPackageAssignmentById,
  listWorkPackageAssignmentsForProject,
} from "../repositories/workPackageAssignmentsRepository.js";
import {
  getProjectMember,
  getProjectMemberById,
} from "../repositories/projectMembersRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import { getWorkPackageById } from "../repositories/workPackagesRepository.js";
import {
  projectAssignmentCreatedActivity,
  projectAssignmentProgressActivity,
} from "../services/activity/projectActivityProjections.js";
import {
  assertProjectAccessContext,
  canReadAssignment,
  filterAssignmentsForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  isMemberAllowedAssignmentTransition,
  isOwnerAllowedAssignmentTransition,
} from "../services/collaboration/assignmentProgressTransitions.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import {
  parseWorkPackageAssignmentCreateInput,
  parseWorkPackageAssignmentUpdateInput,
} from "../validation/workPackageAssignment.js";

export const workPackageAssignmentsRouter = Router();

workPackageAssignmentsRouter.get(
  "/projects/:projectId/work-package-assignments",
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
      const items = await listWorkPackageAssignmentsForProject(projectId);
      res.status(200).json(filterAssignmentsForAccess(items, access));
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

workPackageAssignmentsRouter.get(
  "/projects/:projectId/work-package-assignments/:assignmentId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const assignmentId = req.params.assignmentId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !assignmentId) {
        sendError(res, 400, "projectId and assignmentId are required");
        return;
      }

      const access = await assertProjectAccessContext(projectId, uid);

      const item = await getWorkPackageAssignmentById(assignmentId);

      if (
        !item ||
        item.projectId !== projectId ||
        !canReadAssignment(access, item)
      ) {
        sendError(res, 404, "Work package assignment not found");
        return;
      }

      res.status(200).json(item);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only assignment create.
 * Server owns id, projectId, createdAt, updatedAt.
 * Default status = assigned.
 */
workPackageAssignmentsRouter.post(
  "/projects/:projectId/work-package-assignments",
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

      const input = parseWorkPackageAssignmentCreateInput(readBody(req));

      if (!input) {
        sendError(res, 400, "Invalid work package assignment payload");
        return;
      }

      const result = await createWorkPackageAssignmentIfAbsent({
        projectId,
        workPackageId: input.workPackageId,
        projectMemberId: input.projectMemberId,
        status: input.status,
      });

      if (!result.created) {
        switch (result.reason) {
          case "duplicate":
            sendError(
              res,
              409,
              "An active assignment already exists for this work package and member.",
            );
            return;
          case "work_package_not_found":
            sendError(res, 400, "Work package not found");
            return;
          case "work_package_wrong_project":
            sendError(
              res,
              400,
              "Work package does not belong to this project",
            );
            return;
          case "member_not_found":
            sendError(res, 400, "Project member not found");
            return;
          case "member_wrong_project":
            sendError(
              res,
              400,
              "Project member does not belong to this project",
            );
            return;
          case "member_not_active":
            sendError(
              res,
              400,
              "Project member must be active to receive an assignment",
            );
            return;
          default:
            sendError(res, 400, "Unable to create assignment");
            return;
        }
      }

      // Phase 2M.1: Activity + Notification (best-effort; domain already committed)
      try {
        const workPackage = await getWorkPackageById(
          result.assignment.workPackageId,
        );
        const member = await getProjectMemberById(
          result.assignment.projectMemberId,
        );
        const project = await getProjectById(projectId);
        if (workPackage && member && project) {
          await projectAssignmentCreatedActivity({
            assignment: result.assignment,
            workPackage,
            member,
            actorUid: uid,
            projectOwnerUid: project.ownerUid,
          });
        }
      } catch {
        // Projection failures must not affect assignment create response.
      }

      res.status(201).json(result.assignment);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Assignment lifecycle / progress status update (Phase 2K.1).
 *
 * Owner: administrative transitions (cancelled is terminal).
 * Contractor / field_member: narrow self-service transitions on own assignment.
 * Server owns actor attribution and progress event append.
 */
workPackageAssignmentsRouter.patch(
  "/projects/:projectId/work-package-assignments/:assignmentId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const assignmentId = req.params.assignmentId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !assignmentId) {
        sendError(res, 400, "projectId and assignmentId are required");
        return;
      }

      const update = parseWorkPackageAssignmentUpdateInput(readBody(req));

      if (!update) {
        sendError(res, 400, "Invalid work package assignment update payload");
        return;
      }

      const normalizedNote = normalizeAssignmentProgressNote(update.note);

      if (normalizedNote === null) {
        sendError(res, 400, "Invalid progress note");
        return;
      }

      const project = await getProjectById(projectId);

      if (!project) {
        sendError(res, 404, "Work package assignment not found");
        return;
      }

      const existing = await getWorkPackageAssignmentById(assignmentId);

      if (!existing || existing.projectId !== projectId) {
        sendError(res, 404, "Work package assignment not found");
        return;
      }

      const isOwner = project.ownerUid === uid;

      if (isOwner) {
        if (
          !isOwnerAllowedAssignmentTransition(existing.status, update.status)
        ) {
          sendError(res, 400, "Disallowed assignment status transition");
          return;
        }
      } else {
        const membership = await getProjectMember(projectId, uid);

        if (!membership || membership.status !== "active") {
          sendError(res, 404, "Work package assignment not found");
          return;
        }

        if (
          membership.role !== "contractor" &&
          membership.role !== "field_member"
        ) {
          sendError(res, 404, "Work package assignment not found");
          return;
        }

        if (existing.projectMemberId !== membership.id) {
          sendError(res, 404, "Work package assignment not found");
          return;
        }

        if (
          !isMemberAllowedAssignmentTransition(existing.status, update.status)
        ) {
          sendError(res, 400, "Disallowed assignment status transition");
          return;
        }
      }

      const result = await applyAssignmentProgressTransition({
        projectId,
        assignmentId,
        actorUid: uid,
        nextStatus: update.status,
        note: normalizedNote,
      });

      if (result.kind === "not_found") {
        sendError(res, 404, "Work package assignment not found");
        return;
      }

      if (result.kind === "updated") {
        try {
          const workPackage = await getWorkPackageById(
            result.assignment.workPackageId,
          );
          const member = await getProjectMemberById(
            result.assignment.projectMemberId,
          );
          await projectAssignmentProgressActivity({
            event: result.event,
            assignment: result.assignment,
            workPackage,
            assignedMember: member,
            projectOwnerUid: project.ownerUid,
            actorIsOwner: isOwner,
          });
        } catch {
          // Projection failures must not affect progress response.
        }
      }

      res.status(200).json(result.assignment);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only physical delete (matches WorkPackage / Evidence conventions).
 * Soft-cancel remains available via PATCH status=cancelled.
 * Does not cascade to ProjectMember / WorkPackage / PlanItems.
 * Missing under owned project → 204 (idempotent).
 */
workPackageAssignmentsRouter.delete(
  "/projects/:projectId/work-package-assignments/:assignmentId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const assignmentId = req.params.assignmentId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !assignmentId) {
        sendError(res, 400, "projectId and assignmentId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const existing = await getWorkPackageAssignmentById(assignmentId);

      if (!existing) {
        res.status(204).send();
        return;
      }

      if (existing.projectId !== projectId) {
        sendError(res, 404, "Work package assignment not found");
        return;
      }

      await deleteWorkPackageAssignmentById(assignmentId);
      res.status(204).send();
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);
