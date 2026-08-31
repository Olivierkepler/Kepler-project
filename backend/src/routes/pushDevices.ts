import { Router } from "express";

import {
  disablePushDeviceForUser,
  upsertPushDeviceForUser,
} from "../repositories/pushDevicesRepository.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";
import { parsePushDeviceRegisterInput } from "../validation/pushDevice.js";

export const pushDevicesRouter = Router();

/**
 * Register / upsert Expo push token for the authenticated user.
 * POST /api/me/push-devices
 */
pushDevicesRouter.post("/me/push-devices", async (req, res) => {
  try {
    const uid = requireUserUid(req);

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    const registration = parsePushDeviceRegisterInput(readBody(req));

    if (!registration) {
      sendError(res, 400, "Invalid push device payload");
      return;
    }

    const device = await upsertPushDeviceForUser({
      userId: uid,
      registration,
    });

    res.status(200).json(device);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Disable push registration for the current user's device.
 * DELETE /api/me/push-devices/:deviceId
 */
pushDevicesRouter.delete("/me/push-devices/:deviceId", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const deviceId = req.params.deviceId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!deviceId) {
      sendError(res, 400, "deviceId is required");
      return;
    }

    const result = await disablePushDeviceForUser({
      deviceId,
      userId: uid,
    });

    if (result.kind === "not_found" || result.kind === "forbidden") {
      sendError(res, 404, "Push device not found");
      return;
    }

    res.status(200).json(result.device);
  } catch (error) {
    await handleRouteError(res, error);
  }
});
