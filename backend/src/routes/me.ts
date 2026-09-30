import { Router } from "express";

import {
  clearUserProfileAvatar,
  getUserProfileByUid,
  getUserProfilesByUids,
  setUserProfileAvatarStoragePath,
  upsertUserProfile,
} from "../repositories/userProfilesRepository.js";
import { discoverProjectsForUser } from "../services/collaboration/discoverProjects.js";
import {
  toUserProfilePresentation,
  toUserProfilePresentations,
  toUserProfileShellPresentation,
} from "../services/userProfilePresentation.js";
import {
  buildUserAvatarObjectPath,
  createUserAvatarUploadUrl,
  deleteUserAvatarObject,
  getUserAvatarObjectSize,
  isUserAvatarObjectPathForUid,
  USER_AVATAR_MAX_BYTES,
  userAvatarObjectExists,
} from "../storage/userAvatarStorage.js";
import {
  handleRouteError,
  readBody,
  requireUserEmail,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { parseUpsertUserProfileBody } from "../validation/userProfile.js";
import {
  parseUserAvatarCommitBody,
  parseUserAvatarUploadUrlBody,
} from "../validation/userProfileAvatar.js";

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
      res.status(200).json(
        await toUserProfileShellPresentation({
          uid,
          email: email ?? "",
        }),
      );
      return;
    }

    res.status(200).json(await toUserProfilePresentation(profile));
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

    res.status(200).json(await toUserProfilePresentation(profile));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Short-lived signed PUT URL for the authenticated user's profile photo.
 * Object path is scoped to the authenticated uid only.
 */
meRouter.post("/me/profile/avatar/upload-url", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const parsed = parseUserAvatarUploadUrlBody(readBody(req));

    if (!parsed) {
      sendError(res, 400, "Invalid avatar upload URL payload");
      return;
    }

    const objectPath = buildUserAvatarObjectPath(uid, parsed.contentType);
    const signed = await createUserAvatarUploadUrl(
      objectPath,
      parsed.contentType,
    );

    res.status(200).json(signed);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Commit a profile photo after successful upload to the signed URL.
 * Only the authenticated user may commit their own avatar path.
 */
meRouter.put("/me/profile/avatar", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const email = requireUserEmail(req);
    const parsed = parseUserAvatarCommitBody(readBody(req));

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!parsed) {
      sendError(res, 400, "Invalid avatar commit payload");
      return;
    }

    const expectedPath = buildUserAvatarObjectPath(uid, parsed.contentType);

    if (
      parsed.objectPath !== expectedPath ||
      !isUserAvatarObjectPathForUid(uid, parsed.objectPath)
    ) {
      sendError(res, 400, "Invalid avatar object path");
      return;
    }

    const exists = await userAvatarObjectExists(parsed.objectPath);

    if (!exists) {
      sendError(res, 400, "Avatar upload was not found");
      return;
    }

    const objectSize = await getUserAvatarObjectSize(parsed.objectPath);

    if (objectSize === null || objectSize > USER_AVATAR_MAX_BYTES) {
      sendError(res, 400, "Avatar file exceeds the maximum allowed size");
      return;
    }

    let existing = await getUserProfileByUid(uid);

    if (!existing) {
      if (!email) {
        sendError(res, 400, "Authenticated email is required");
        return;
      }

      existing = await upsertUserProfile({
        uid,
        displayName: "",
        email,
      });
    }

    const previousPath = existing.avatarStoragePath;
    const profile = await setUserProfileAvatarStoragePath({
      uid,
      avatarStoragePath: parsed.objectPath,
    });

    if (previousPath && previousPath !== parsed.objectPath) {
      await deleteUserAvatarObject(previousPath).catch(() => undefined);
    }

    res.status(200).json(await toUserProfilePresentation(profile));
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Remove the authenticated user's profile photo.
 */
meRouter.delete("/me/profile/avatar", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const existing = await getUserProfileByUid(uid);

    if (!existing?.avatarStoragePath) {
      res.status(200).json(
        existing
          ? await toUserProfilePresentation(existing)
          : await toUserProfileShellPresentation({ uid }),
      );
      return;
    }

    const previousPath = existing.avatarStoragePath;
    const profile = await clearUserProfileAvatar(uid);
    await deleteUserAvatarObject(previousPath).catch(() => undefined);

    res.status(200).json(await toUserProfilePresentation(profile));
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
    res.status(200).json(await toUserProfilePresentations(profiles));
  } catch (error) {
    await handleRouteError(res, error);
  }
});
