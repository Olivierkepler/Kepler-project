import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { Project } from "../domain/project.js";
import {
  ensureOwnerProjectMember,
  listProjectMembers,
} from "../repositories/projectMembersRepository.js";
import {
  addProjectInvitationIfAbsent,
  listProjectInvitationsForProject,
} from "../repositories/projectInvitationsRepository.js";
import {
  getProjectById,
  getProjectsForOwner,
  setProject,
} from "../repositories/projectsRepository.js";
import { getUserProfilesByUids } from "../repositories/userProfilesRepository.js";
import { assertProjectReadableByUser } from "../services/collaboration/projectReadAccess.js";
import { projectInvitationCreatedActivity } from "../services/activity/projectActivityProjections.js";
import { buildProjectMembersWithPresentation } from "../services/projectMemberPresentation.js";
import { projectProgressService } from "../services/projectProgressService.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { parseProjectInvitationCreateInput } from "../validation/projectInvitation.js";
import {
  parseProjectProgressBaselineInput,
  parseProjectProgressSnapshotInput,
} from "../validation/projectProgress.js";
import { parseProjectUpdateInput, parseProjectWriteInput } from "../validation/project.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const projects = await getProjectsForOwner(uid);
    res.status(200).json(projects);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Idempotent bootstrap for a local project.
 * Returns 200 when already present for this user, 201 when created.
 *
 * Phase 1F: after project exists for this owner, ensures an additive
 * owner ProjectMember (create-if-absent). Does not change ownership checks.
 */
projectsRouter.post("/bootstrap", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const input = parseProjectWriteInput(readBody(req));

    if (!input) {
      sendError(res, 400, "Invalid project payload");
      return;
    }

    const remoteId = createRemoteProjectId(uid, input.localProjectId);
    const existing = await getProjectById(remoteId);

    if (existing) {
      if (existing.ownerUid !== uid) {
        sendError(res, 404, "Project not found");
        return;
      }

      await ensureOwnerProjectMember(existing);
      res.status(200).json(existing);
      return;
    }

    const project: Project = {
      id: remoteId,
      ownerUid: uid,
      ...input,
    };

    await setProject(project);
    await ensureOwnerProjectMember(project);
    res.status(201).json(project);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Owner-only membership list (Phase 1F).
 * Membership alone does not authorize this endpoint — assertProjectOwnedByUser.
 *
 * Phase 2E-E: response remains the same ProjectMember array, enriched with
 * optional presentation fields (displayName, email, avatarUrl) resolved from
 * trusted userProfiles. Authorization and membership semantics are unchanged.
 */
projectsRouter.get("/:projectId/members", async (req, res) => {
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
    const members = await listProjectMembers(projectId);
    const profiles = await getUserProfilesByUids(
      members.map((member) => member.userId),
    );
    const presented = await buildProjectMembersWithPresentation(
      members,
      profiles,
    );
    res.status(200).json(presented);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Owner-only invitation list (Phase 1G).
 * Creating/listing invitations does not grant invitees project access.
 */
projectsRouter.get("/:projectId/invitations", async (req, res) => {
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
    const invitations = await listProjectInvitationsForProject(projectId);
    res.status(200).json(invitations);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Owner-only invitation create (Phase 1G).
 * invitedBy = authenticated uid. Role cannot be "owner".
 */
projectsRouter.post("/:projectId/invitations", async (req, res) => {
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

    const input = parseProjectInvitationCreateInput(readBody(req));

    if (!input) {
      sendError(res, 400, "Invalid invitation payload");
      return;
    }

    const result = await addProjectInvitationIfAbsent({
      projectId,
      email: input.email,
      role: input.role,
      invitedBy: uid,
    });

    if (!result.created) {
      sendError(
        res,
        409,
        "An active invitation already exists for this email.",
      );
      return;
    }

    try {
      const project = await getProjectById(projectId);
      if (project) {
        await projectInvitationCreatedActivity({
          invitation: result.invitation,
          projectOwnerUid: project.ownerUid,
          // Invitee UID unknown from email-only invitation — no Notification.
        });
      }
    } catch {
      // Activity projection is best-effort.
    }

    res.status(201).json(result.invitation);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

projectsRouter.get("/:projectId", async (req, res) => {
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

    // Phase 1I: membership-aware READ (owner OR ACTIVE member).
    const access = await assertProjectReadableByUser(projectId, uid);
    res.status(200).json(access.project);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Narrow Project field update for an owned remote project.
 */
projectsRouter.patch("/:projectId", async (req, res) => {
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

    const update = parseProjectUpdateInput(readBody(req));

    if (!update) {
      sendError(res, 400, "Invalid project update payload");
      return;
    }

    const existing = await assertProjectOwnedByUser(projectId, uid);
    const project: Project = {
      ...existing,
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.location !== undefined ? { location: update.location } : {}),
      ...(update.status !== undefined ? { status: update.status } : {}),
    };

    await setProject(project);
    res.status(200).json(project);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/** Membership-aware read of the planned baseline and actual progress history. */
projectsRouter.get("/:projectId/progress", async (req, res) => {
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

    const series = await projectProgressService.getSeries(projectId, uid);
    res.status(200).json(series);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/** Owner-only, date-keyed upsert for one planned baseline point. */
projectsRouter.put("/:projectId/progress/baseline", async (req, res) => {
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

    const input = parseProjectProgressBaselineInput(readBody(req));
    if (!input) {
      sendError(res, 400, "Invalid project progress baseline point");
      return;
    }

    const point = await projectProgressService.upsertBaseline(
      projectId,
      uid,
      input,
    );
    res.status(200).json(point);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/** Owner-only append of a manually recorded actual progress snapshot. */
projectsRouter.post("/:projectId/progress/snapshots", async (req, res) => {
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

    const input = parseProjectProgressSnapshotInput(readBody(req));
    if (!input) {
      sendError(res, 400, "Invalid project progress snapshot");
      return;
    }

    const snapshot = await projectProgressService.appendSnapshot(
      projectId,
      uid,
      input,
    );
    res.status(201).json(snapshot);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Create-only. Deterministic remote ID; duplicate → 409.
 * Phase 1F: ensures additive owner ProjectMember after create.
 */
projectsRouter.post("/", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const input = parseProjectWriteInput(readBody(req));

    if (!input) {
      sendError(res, 400, "Invalid project payload");
      return;
    }

    const remoteId = createRemoteProjectId(uid, input.localProjectId);
    const existing = await getProjectById(remoteId);

    if (existing) {
      sendError(res, 409, "Project already exists");
      return;
    }

    const project: Project = {
      id: remoteId,
      ownerUid: uid,
      ...input,
    };

    await setProject(project);
    await ensureOwnerProjectMember(project);
    res.status(201).json(project);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
