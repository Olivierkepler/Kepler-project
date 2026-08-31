import { useEffect, useRef } from "react";

import * as Notifications from "expo-notifications";
import type { NavigationProp } from "@react-navigation/native";

import { useAuth } from "../auth/AuthProvider";
import {
  getNotificationById,
  markNotificationRead,
} from "../services/api/notifications";
import {
  extractNotificationIdFromPushData,
  registerCurrentDeviceForPush,
} from "../services/notifications/pushNotifications";
import type { RootStackParamList } from "../navigation/types";
import {
  isNavigationReady,
  navigationRef,
} from "../navigation/navigationRef";
import { handleNotificationPress } from "../utils/navigation/notificationDeepLink";
import { emitNotificationUnreadChanged } from "../utils/notifications/unreadBadgeEvents";

type Nav = NavigationProp<RootStackParamList>;

const pendingNotificationIds: string[] = [];
const handledResponseKeys = new Set<string>();

function enqueuePending(notificationId: string): void {
  if (!pendingNotificationIds.includes(notificationId)) {
    pendingNotificationIds.push(notificationId);
  }
}

function responseKey(response: Notifications.NotificationResponse): string {
  return (
    response.notification.request.identifier ||
    extractNotificationIdFromPushData(
      response.notification.request.content.data,
    ) ||
    `${response.actionIdentifier}:${response.notification.date}`
  );
}

async function resolveAndNavigate(input: {
  notificationId: string;
  currentUid: string;
  navigation: Nav;
}): Promise<void> {
  try {
    const notification = await getNotificationById(input.notificationId);

    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id);
        emitNotificationUnreadChanged();
      } catch {
        // Navigation still proceeds; unread reconciles on focus.
      }
    }

    await handleNotificationPress({
      navigation: input.navigation,
      notification,
      currentUid: input.currentUid,
    });
  } catch {
    // Stale/deleted/unauthorized targets fail safely — destination auth still applies.
  }
}

async function handlePushResponse(input: {
  response: Notifications.NotificationResponse;
  currentUid: string;
}): Promise<void> {
  const key = responseKey(input.response);
  if (handledResponseKeys.has(key)) {
    return;
  }
  handledResponseKeys.add(key);

  const notificationId = extractNotificationIdFromPushData(
    input.response.notification.request.content.data,
  );

  if (!notificationId) {
    return;
  }

  if (!isNavigationReady() || !navigationRef.current) {
    enqueuePending(notificationId);
    return;
  }

  await resolveAndNavigate({
    notificationId,
    currentUid: input.currentUid,
    navigation: navigationRef.current as unknown as Nav,
  });
}

async function flushPending(currentUid: string): Promise<void> {
  if (!isNavigationReady() || !navigationRef.current) {
    return;
  }

  while (pendingNotificationIds.length > 0) {
    const notificationId = pendingNotificationIds.shift();
    if (!notificationId) {
      continue;
    }

    await resolveAndNavigate({
      notificationId,
      currentUid,
      navigation: navigationRef.current as unknown as Nav,
    });
  }
}

/**
 * Mount once under authenticated navigation.
 * Registers Expo push token and wires tap → persisted notification → deep link.
 */
export default function usePushNotifications(): void {
  const { user } = useAuth();
  const registeringRef = useRef(false);
  const lastRegisteredUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      lastRegisteredUidRef.current = null;
      return;
    }

    let cancelled = false;

    const runRegister = async () => {
      if (registeringRef.current) {
        return;
      }

      registeringRef.current = true;
      try {
        await registerCurrentDeviceForPush();
        if (!cancelled) {
          lastRegisteredUidRef.current = user.uid;
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: "push_registration_failed",
            message:
              error instanceof Error
                ? error.message.slice(0, 160)
                : "unknown",
          }),
        );
      } finally {
        registeringRef.current = false;
      }
    };

    void runRegister();

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      emitNotificationUnreadChanged();
    });

    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void handlePushResponse({
          response,
          currentUid: user.uid,
        });
      });

    void (async () => {
      const last =
        await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !last) {
        return;
      }
      await handlePushResponse({
        response: last,
        currentUid: user.uid,
      });
    })();

    const flushTimer = setInterval(() => {
      void flushPending(user.uid);
    }, 750);

    return () => {
      cancelled = true;
      clearInterval(flushTimer);
      receivedSub.remove();
      responseSub.remove();
    };
  }, [user?.uid]);
}
