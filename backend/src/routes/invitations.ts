import { Router } from "express";

import {
  acceptProjectInvitation,
  declineProjectInvitation,
  listPendingProjectInvitationsForEmail,
} from "../repositories/projectInvitationsRepository.js";
import {
  getProjectById,
  getProjectsByIds,
} from "../repositories/projectsRepository.js";
import { projectInvitationAcceptedActivity } from "../services/activity/projectActivityProjections.js";
import {
  handleRouteError,
  requireUserEmail,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { normalizeInvitationEmail } from "../validation/projectInvitation.js";

export const invitationsRouter = Router();

/**
 * Pending invitations for the authenticated recipient.
 * Email identity comes only from the verified Firebase ID token.
 */
invitationsRouter.get("/me/invitations", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const email = requireUserEmail(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!email) {
      sendError(res, 400, "Authenticated email is required");
      return;
    }

    const invitations = await listPendingProjectInvitationsForEmail(
      normalizeInvitationEmail(email),
    );

    let projectNameById = new Map<string, string>();
    try {
      const projects = await getProjectsByIds(
        invitations.map((invitation) => invitation.projectId),
      );
      projectNameById = new Map(
        projects
          .map((project) => [project.id, project.name.trim()] as const)
          .filter(([, name]) => name.length > 0),
      );
    } catch {
      // Keep the invitation list available if project presentation lookup fails.
    }

    res.status(200).json(
      invitations.map((invitation) => {
        const projectName = projectNameById.get(invitation.projectId);
        return projectName
          ? { ...invitation, projectName }
          : invitation;
      }),
    );
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Accept a pending invitation.
 * Membership is created from invitation.role; general project access unchanged.
 */
invitationsRouter.post("/invitations/:invitationId/accept", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const email = requireUserEmail(req);
    const invitationId = req.params.invitationId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!email) {
      sendError(res, 400, "Authenticated email is required");
      return;
    }

    if (!invitationId) {
      sendError(res, 400, "invitationId is required");
      return;
    }

    const result = await acceptProjectInvitation({
      invitationId,
      acceptingUserId: uid,
      acceptingUserEmail: email,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          sendError(res, 404, "Invitation not found");
          return;
        case "not_pending":
          sendError(res, 409, "Invitation is not pending");
          return;
        case "email_mismatch":
          sendError(res, 403, "Invitation email does not match authenticated user");
          return;
        case "membership_removed":
          sendError(res, 409, "Removed membership cannot be reactivated");
          return;
        case "membership_invited":
          sendError(res, 409, "Invited membership already exists");
          return;
        case "membership_exists":
          sendError(res, 409, "Membership already exists");
          return;
        default:
          sendError(res, 409, "Unable to accept invitation");
          return;
      }
    }

    try {
      const project = await getProjectById(result.invitation.projectId);
      if (project) {
        await projectInvitationAcceptedActivity({
          invitation: result.invitation,
          actorUid: uid,
          projectOwnerUid: project.ownerUid,
        });
      }
    } catch {
      // Activity projection is best-effort.
    }

    res.status(200).json({
      member: result.member,
      invitation: result.invitation,
    });
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Decline a pending invitation. No ProjectMember is created.
 */
invitationsRouter.post(
  "/invitations/:invitationId/decline",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const email = requireUserEmail(req);
      const invitationId = req.params.invitationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!email) {
        sendError(res, 400, "Authenticated email is required");
        return;
      }

      if (!invitationId) {
        sendError(res, 400, "invitationId is required");
        return;
      }

      const result = await declineProjectInvitation({
        invitationId,
        decliningUserEmail: email,
      });

      if (!result.ok) {
        switch (result.reason) {
          case "not_found":
            sendError(res, 404, "Invitation not found");
            return;
          case "not_pending":
            sendError(res, 409, "Invitation is not pending");
            return;
          case "email_mismatch":
            sendError(
              res,
              403,
              "Invitation email does not match authenticated user",
            );
            return;
          default:
            sendError(res, 409, "Unable to decline invitation");
            return;
        }
      }

      res.status(200).json(result.invitation);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);
