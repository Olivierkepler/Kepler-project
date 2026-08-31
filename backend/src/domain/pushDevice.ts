import { createHash } from "node:crypto";

export type PushDevicePlatform = "ios" | "android";

/**
 * Per-device Expo push registration (Phase Feed 2E).
 * Push is a delivery layer only — persisted Notification remains authoritative.
 */
export type UserPushDevice = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: PushDevicePlatform;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  disabledAt: string | null;
};

export function isActivePushDevice(device: UserPushDevice): boolean {
  return device.disabledAt == null;
}

/**
 * Deterministic document id from Expo push token.
 * One token → one registration row (upsert / account reassignment).
 */
export function buildPushDeviceId(expoPushToken: string): string {
  const token = expoPushToken.trim();
  if (!token) {
    throw new Error("expoPushToken is required");
  }

  const digest = createHash("sha256").update(token).digest("hex").slice(0, 32);
  return `push:${digest}`;
}

export function isExpoPushToken(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("ExponentPushToken[") ||
    trimmed.startsWith("ExpoPushToken[")
  );
}
