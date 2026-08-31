import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  registerPushDevice,
  unregisterPushDevice,
} from "../api/pushDevices";

const PUSH_DEVICE_ID_KEY = "buildsigma.pushDeviceId";
const PUSH_TOKEN_KEY = "buildsigma.expoPushToken";
const ANDROID_CHANNEL_ID = "buildsigma";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function resolveExpoProjectId(): string | null {
  const fromExtra =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (typeof fromExtra === "string" && fromExtra.trim()) {
    return fromExtra.trim();
  }

  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  return fromEnv || null;
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "BuildSigma",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#012169",
  });
}

export async function getNotificationPermissionStatus(): Promise<
  Notifications.PermissionStatus
> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.status;
}

/**
 * Check/request permission without blocking app use when denied.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === "granted") {
    return true;
  }

  if (current.status === "denied") {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === "granted";
}

export async function getExpoPushTokenSafe(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    console.warn(
      JSON.stringify({
        event: "expo_push_project_id_missing",
        message:
          "Set extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID before registering push tokens.",
      }),
    );
    return null;
  }

  await ensureAndroidNotificationChannel();

  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  const token = tokenResult.data?.trim();
  return token || null;
}

export async function getStoredPushDeviceId(): Promise<string | null> {
  const value = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
  return value?.trim() || null;
}

async function storePushRegistration(input: {
  deviceId: string;
  expoPushToken: string;
}): Promise<void> {
  await AsyncStorage.multiSet([
    [PUSH_DEVICE_ID_KEY, input.deviceId],
    [PUSH_TOKEN_KEY, input.expoPushToken],
  ]);
}

export async function clearStoredPushRegistration(): Promise<void> {
  await AsyncStorage.multiRemove([PUSH_DEVICE_ID_KEY, PUSH_TOKEN_KEY]);
}

/**
 * Resolve Expo push token and upsert with backend for the current auth user.
 * Idempotent: safe on app focus / startup.
 */
export async function registerCurrentDeviceForPush(): Promise<{
  registered: boolean;
  reason?: string;
}> {
  const permitted = await ensureNotificationPermission();
  if (!permitted) {
    return { registered: false, reason: "permission_denied" };
  }

  const token = await getExpoPushTokenSafe();
  if (!token) {
    return { registered: false, reason: "token_unavailable" };
  }

  const platform = Platform.OS === "ios" ? "ios" : "android";
  const device = await registerPushDevice({
    expoPushToken: token,
    platform,
    deviceName: Device.deviceName ?? Device.modelName ?? null,
  });

  await storePushRegistration({
    deviceId: device.id,
    expoPushToken: token,
  });

  return { registered: true };
}

/**
 * Disable the current device token for the signed-in account, then clear local state.
 * Call before Firebase sign-out when possible.
 */
export async function unregisterCurrentDeviceForPush(): Promise<void> {
  const deviceId = await getStoredPushDeviceId();

  if (deviceId) {
    try {
      await unregisterPushDevice(deviceId);
    } catch {
      // Best-effort: still clear local association so the next login re-registers.
    }
  }

  await clearStoredPushRegistration();
}

export function extractNotificationIdFromPushData(
  data: unknown,
): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.notificationId === "string" && record.notificationId.trim()) {
    return record.notificationId.trim();
  }

  return null;
}
