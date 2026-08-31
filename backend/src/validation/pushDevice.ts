import type {
  PushDevicePlatform,
  UserPushDevice,
} from "../domain/pushDevice.js";
import {
  buildPushDeviceId,
  isExpoPushToken,
} from "../domain/pushDevice.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

const PLATFORMS = new Set<PushDevicePlatform>(["ios", "android"]);

export type PushDeviceRegisterInput = {
  expoPushToken: string;
  platform: PushDevicePlatform;
  deviceName: string | null;
};

export function parsePushDeviceRegisterInput(
  body: unknown,
): PushDeviceRegisterInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (typeof body.expoPushToken !== "string") {
    return null;
  }

  const expoPushToken = body.expoPushToken.trim();
  if (!expoPushToken || !isExpoPushToken(expoPushToken)) {
    return null;
  }

  if (body.platform !== "ios" && body.platform !== "android") {
    return null;
  }

  let deviceName: string | null = null;
  if (body.deviceName !== undefined && body.deviceName !== null) {
    if (typeof body.deviceName !== "string") {
      return null;
    }
    const trimmed = body.deviceName.trim();
    deviceName = trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }

  return {
    expoPushToken,
    platform: body.platform,
    deviceName,
  };
}

export function normalizePushDeviceDocument(
  value: unknown,
): UserPushDevice | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.userId) ||
    !isNonEmptyString(value.expoPushToken) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt) ||
    !isNonEmptyString(value.lastSeenAt)
  ) {
    return undefined;
  }

  if (
    typeof value.platform !== "string" ||
    !PLATFORMS.has(value.platform as PushDevicePlatform)
  ) {
    return undefined;
  }

  if (
    value.deviceName !== null &&
    value.deviceName !== undefined &&
    typeof value.deviceName !== "string"
  ) {
    return undefined;
  }

  if (
    value.disabledAt !== null &&
    value.disabledAt !== undefined &&
    typeof value.disabledAt !== "string"
  ) {
    return undefined;
  }

  const expoPushToken = value.expoPushToken.trim();
  if (!isExpoPushToken(expoPushToken)) {
    return undefined;
  }

  return {
    id: value.id.trim(),
    userId: value.userId.trim(),
    expoPushToken,
    platform: value.platform as PushDevicePlatform,
    deviceName:
      typeof value.deviceName === "string"
        ? value.deviceName.trim() || null
        : null,
    createdAt: value.createdAt.trim(),
    updatedAt: value.updatedAt.trim(),
    lastSeenAt: value.lastSeenAt.trim(),
    disabledAt:
      typeof value.disabledAt === "string" && value.disabledAt.trim()
        ? value.disabledAt.trim()
        : null,
  };
}

export function buildPushDeviceCandidate(input: {
  userId: string;
  expoPushToken: string;
  platform: PushDevicePlatform;
  deviceName: string | null;
  nowIso: string;
  existing?: UserPushDevice;
}): UserPushDevice {
  const id = buildPushDeviceId(input.expoPushToken);

  return {
    id,
    userId: input.userId.trim(),
    expoPushToken: input.expoPushToken.trim(),
    platform: input.platform,
    deviceName: input.deviceName,
    createdAt: input.existing?.createdAt ?? input.nowIso,
    updatedAt: input.nowIso,
    lastSeenAt: input.nowIso,
    disabledAt: null,
  };
}
