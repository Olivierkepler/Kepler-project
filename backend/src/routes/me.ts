import { Router } from "express";

import {
  getUserProfileByUid,
  getUserProfilesByUids,
  upsertUserProfile,
} from "../repositories/userProfilesRepository.js";
import { discoverProjectsForUser } from "../services/collaboration/discoverProjects.js";
import {
  handleRouteError,
  readBody,
  requireUserEmail,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { parseUpsertUserProfileBody } from "../validation/userProfile.js";

export const meRouter = Router();

const MAX_BATCH_PROFILE_UIDS = 50;

/**
 * Cloud project discovery for the authenticated user (Phase 1H).
 *
 * Returns projects with ACTIVE membership and/or legacy ownerUid ownership.
 * Discoverability does not grant general project API access.
 */
meRouter.get("/me/projects", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const projects = await discoverProjectsForUser(uid);
    res.status(200).json(projects);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Presentation-only profile for the authenticated user.
 * Authorization identity remains Firebase UID.
 */
meRouter.get("/me/profile", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const email = requireUserEmail(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const profile = await getUserProfileByUid(uid);

    if (!profile) {
      res.status(200).json({
        uid,
        displayName: "",
        email: email ?? "",
        createdAt: null,
        updatedAt: null,
      });
      return;
    }

    res.status(200).json(profile);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Upsert presentation profile for the authenticated user only.
 * Email is taken from the verified ID token — never from the request body.
 */
meRouter.put("/me/profile", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const email = requireUserEmail(req);
    const parsed = parseUpsertUserProfileBody(readBody(req));

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!email) {
      sendError(res, 400, "Authenticated email is required");
      return;
    }

    if (!parsed) {
      sendError(res, 400, "displayName is required");
      return;
    }

    const profile = await upsertUserProfile({
      uid,
      displayName: parsed.displayName,
      email,
    });

    res.status(200).json(profile);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Batch-read presentation profiles for collaborator UI.
 * Authenticated access only; returns display metadata, not auth grants.
 */
meRouter.get("/user-profiles", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const raw = req.query.uids;

    if (typeof raw !== "string" || raw.trim().length === 0) {
      sendError(res, 400, "uids query parameter is required");
      return;
    }

    const uids = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_BATCH_PROFILE_UIDS);

    const profiles = await getUserProfilesByUids(uids);
    res.status(200).json(profiles);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
