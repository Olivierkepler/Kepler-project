import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { useAuth } from "../../auth/AuthProvider";
import { runCloudSyncCycle } from "./cloudSyncCycle";

function isOnline(state: NetInfoState): boolean {
  if (state.isConnected !== true) {
    return false;
  }

  // null/unknown reachability should not aggressively trigger retries.
  if (state.isInternetReachable === false) {
    return false;
  }

  return true;
}

function wasNonActive(state: AppStateStatus): boolean {
  return state === "background" || state === "inactive";
}

/**
 * Single authenticated lifecycle coordinator for narrow cloud sync:
 * - pending Project updates
 * - pending PlanItem updates
 * - pending Evidence deletes
 * - pending Evidence uploads
 * - pending Measurement uploads (ensures Project + PlanItem prerequisites)
 * - pending Delta creation uploads
 * - pending Delta disposition push + reconcile
 *
 * Silent. Manual Profile retries remain available.
 */
export default function CloudSyncCoordinator() {
  const { user } = useAuth();
  const previousOnlineRef = useRef<boolean | null>(null);
  const currentOnlineRef = useRef<boolean | null>(null);
  const sessionInitialRetryUidRef = useRef<string | null>(null);
  const previousAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!user) {
      previousOnlineRef.current = null;
      currentOnlineRef.current = null;
      sessionInitialRetryUidRef.current = null;
      previousAppStateRef.current = AppState.currentState;
      return;
    }

    const uid = user.uid;

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const online = isOnline(state);
      const previousOnline = previousOnlineRef.current;
      previousOnlineRef.current = online;
      currentOnlineRef.current = online;

      if (!online) {
        return;
      }

      // Once per signed-in session when already/first online.
      if (sessionInitialRetryUidRef.current !== uid) {
        sessionInitialRetryUidRef.current = uid;
        void runCloudSyncCycle(uid);
        return;
      }

      // Only on a real offline → online transition.
      if (previousOnline === false) {
        void runCloudSyncCycle(uid);
      }
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        const previousAppState = previousAppStateRef.current;
        previousAppStateRef.current = nextState;

        if (!wasNonActive(previousAppState) || nextState !== "active") {
          return;
        }

        // Refresh connectivity once on true foregrounding (no second subscription).
        void NetInfo.fetch().then((state) => {
          const online = isOnline(state);
          previousOnlineRef.current = online;
          currentOnlineRef.current = online;

          if (!online) {
            return;
          }

          void runCloudSyncCycle(uid);
        });
      },
    );

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, [user]);

  return null;
}
