import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { UserPushDevice } from "../domain/pushDevice.js";
import { buildPushDeviceId, isActivePushDevice } from "../domain/pushDevice.js";
import {
  buildPushDeviceCandidate,
  normalizePushDeviceDocument,
  type PushDeviceRegisterInput,
} from "../validation/pushDevice.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function pushDevicesCollection() {
  return db.collection(COLLECTIONS.pushDevices);
}

export async function getPushDeviceById(
  deviceId: string,
): Promise<UserPushDevice | undefined> {
  requireId(deviceId, "deviceId");

  const snapshot = await pushDevicesCollection().doc(deviceId).get();
  if (!snapshot.exists) {
    return undefined;
  }

  return normalizePushDeviceDocument(snapshot.data());
}

export async function getPushDeviceByExpoToken(
  expoPushToken: string,
): Promise<UserPushDevice | undefined> {
  return getPushDeviceById(buildPushDeviceId(expoPushToken));
}

/**
 * Upsert push registration for the authenticated user.
 * Same Expo token always maps to one document; may reassign from a prior user.
 */
export async function upsertPushDeviceForUser(input: {
  userId: string;
  registration: PushDeviceRegisterInput;
  nowIso?: string;
}): Promise<UserPushDevice> {
  requireId(input.userId, "userId");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const deviceId = buildPushDeviceId(input.registration.expoPushToken);
  const ref = pushDevicesCollection().doc(deviceId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists
      ? normalizePushDeviceDocument(snapshot.data())
      : undefined;

    if (snapshot.exists && !existing) {
      throw new Error("Corrupt PushDevice document");
    }

    const next = buildPushDeviceCandidate({
      userId: input.userId,
      expoPushToken: input.registration.expoPushToken,
      platform: input.registration.platform,
      deviceName: input.registration.deviceName,
      nowIso,
      existing,
    });

    tx.set(ref, next, { merge: false });
    return next;
  });
}

export type DisablePushDeviceResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "ok"; device: UserPushDevice; alreadyDisabled: boolean };

export async function disablePushDeviceForUser(input: {
  deviceId: string;
  userId: string;
  nowIso?: string;
}): Promise<DisablePushDeviceResult> {
  requireId(input.deviceId, "deviceId");
  requireId(input.userId, "userId");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const ref = pushDevicesCollection().doc(input.deviceId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = normalizePushDeviceDocument(snapshot.data());
    if (!current) {
      return { kind: "not_found" as const };
    }

    if (current.userId !== input.userId) {
      return { kind: "forbidden" as const };
    }

    if (!isActivePushDevice(current)) {
      return {
        kind: "ok" as const,
        device: current,
        alreadyDisabled: true,
      };
    }

    const updated: UserPushDevice = {
      ...current,
      disabledAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(ref, updated, { merge: false });
    return {
      kind: "ok" as const,
      device: updated,
      alreadyDisabled: false,
    };
  });
}

export async function disablePushDeviceByExpoToken(input: {
  expoPushToken: string;
  userId: string;
  nowIso?: string;
}): Promise<DisablePushDeviceResult> {
  return disablePushDeviceForUser({
    deviceId: buildPushDeviceId(input.expoPushToken),
    userId: input.userId,
    nowIso: input.nowIso,
  });
}

export async function disablePushDeviceById(input: {
  deviceId: string;
  nowIso?: string;
}): Promise<UserPushDevice | undefined> {
  requireId(input.deviceId, "deviceId");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const ref = pushDevicesCollection().doc(input.deviceId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      return undefined;
    }

    const current = normalizePushDeviceDocument(snapshot.data());
    if (!current) {
      return undefined;
    }

    if (!isActivePushDevice(current)) {
      return current;
    }

    const updated: UserPushDevice = {
      ...current,
      disabledAt: nowIso,
      updatedAt: nowIso,
    };

    tx.set(ref, updated, { merge: false });
    return updated;
  });
}

export async function listActivePushDevicesForUser(
  userId: string,
): Promise<UserPushDevice[]> {
  requireId(userId, "userId");

  const snapshot = await pushDevicesCollection()
    .where("userId", "==", userId)
    .get();

  return snapshot.docs
    .map((doc) => normalizePushDeviceDocument(doc.data()))
    .filter(
      (item): item is UserPushDevice =>
        item !== undefined && isActivePushDevice(item),
    );
}
