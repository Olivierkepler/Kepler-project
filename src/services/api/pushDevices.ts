import type { PushDevicePlatform } from "../../types/pushDevice";
import type { RemotePushDevice } from "../../types/pushDevice";
import { authenticatedFetch } from "./client";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }
  return fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseRemotePushDevice(
  value: unknown,
): RemotePushDevice | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.userId) ||
    !isNonEmptyString(record.expoPushToken) ||
    (record.platform !== "ios" && record.platform !== "android") ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt) ||
    !isNonEmptyString(record.lastSeenAt)
  ) {
    return null;
  }

  if (
    record.disabledAt !== null &&
    record.disabledAt !== undefined &&
    !isNonEmptyString(record.disabledAt)
  ) {
    return null;
  }

  return {
    id: record.id.trim(),
    userId: record.userId.trim(),
    expoPushToken: record.expoPushToken.trim(),
    platform: record.platform,
    deviceName:
      typeof record.deviceName === "string"
        ? record.deviceName.trim() || null
        : null,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
    lastSeenAt: record.lastSeenAt.trim(),
    disabledAt:
      typeof record.disabledAt === "string" && record.disabledAt.trim()
        ? record.disabledAt.trim()
        : null,
  };
}

export type RegisterPushDeviceRequest = {
  expoPushToken: string;
  platform: PushDevicePlatform;
  deviceName?: string | null;
};

/**
 * POST /api/me/push-devices
 */
export async function registerPushDevice(
  request: RegisterPushDeviceRequest,
): Promise<RemotePushDevice> {
  const response = await authenticatedFetch("/api/me/push-devices", {
    method: "POST",
    body: JSON.stringify({
      expoPushToken: request.expoPushToken,
      platform: request.platform,
      deviceName: request.deviceName ?? null,
    }),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Push device could not be registered."),
    );
  }

  const parsed = parseRemotePushDevice(body);
  if (!parsed) {
    throw new Error("Push device could not be registered.");
  }

  return parsed;
}

/**
 * DELETE /api/me/push-devices/:deviceId
 */
export async function unregisterPushDevice(
  deviceId: string,
): Promise<RemotePushDevice> {
  const id = deviceId.trim();
  if (!id) {
    throw new Error("deviceId is required");
  }

  const response = await authenticatedFetch(
    `/api/me/push-devices/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Push device could not be unregistered."),
    );
  }

  const parsed = parseRemotePushDevice(body);
  if (!parsed) {
    throw new Error("Push device could not be unregistered.");
  }

  return parsed;
}
