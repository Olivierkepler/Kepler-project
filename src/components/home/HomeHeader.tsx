import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Animated,
  DeviceEventEmitter,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";

import type {
  NavigationProp,
} from "@react-navigation/native";

import { useAuth } from "../../auth/AuthProvider";

import type {
  RootStackParamList,
} from "../../navigation/types";

import {
  getNotificationUnreadCount,
} from "../../services/api/notifications";

import {
  typography,
} from "../../theme/colors";

import {
  formatUnreadBadgeCount,
} from "../../utils/domain/notificationPresentation";

import {
  NOTIFICATION_UNREAD_CHANGED_EVENT,
} from "../../utils/notifications/unreadBadgeEvents";

import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../../utils/domain/memberDisplay";

import FeedAvatar from "../home/feed/FeedAvatar";
import KeplerLogo from "../branding/KeplerLogo1";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type HomeHeaderProps = {
  /**
   * Pass the scroll position from the parent screen.
   *
   * At scrollY = 0:
   * header is transparent.
   *
   * As the screen scrolls:
   * header transitions to white.
   */
  scrollY?: Animated.Value;
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function HomeHeader({
  scrollY,
}: HomeHeaderProps) {
  const navigation =
    useNavigation<
      NavigationProp<RootStackParamList>
    >();

  const { user } = useAuth();

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

  /**
   * Fallback value keeps HomeHeader backwards-compatible
   * on screens that do not provide scrollY yet.
   */
  const fallbackScrollY =
    useRef(
      new Animated.Value(0),
    ).current;

  const activeScrollY =
    scrollY ?? fallbackScrollY;

  /* ------------------------------------------------------------------------ */
  /* Scroll-driven header                                                     */
  /* ------------------------------------------------------------------------ */

  /**
   * Transparent:
   *
   * scroll = 0
   *
   * Fully white:
   *
   * scroll >= 56
   */
  const headerBackgroundColor =
    useMemo(
      () =>
        activeScrollY.interpolate({
          inputRange: [
            0,
            12,
            32,
            56,
          ],

          outputRange: [
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.18)",
            "rgba(255,255,255,0.68)",
            "rgba(255,255,255,0.96)",
          ],

          extrapolate: "clamp",
        }),
      [activeScrollY],
    );

  /**
   * Bottom divider stays invisible at the top
   * and gradually appears while scrolling.
   */
  const dividerOpacity =
    useMemo(
      () =>
        activeScrollY.interpolate({
          inputRange: [
            0,
            18,
            48,
          ],

          outputRange: [
            0,
            0.2,
            1,
          ],

          extrapolate: "clamp",
        }),
      [activeScrollY],
    );

  /**
   * Shadow only becomes visible once
   * content starts moving underneath.
   */
  const headerShadowOpacity =
    useMemo(
      () =>
        activeScrollY.interpolate({
          inputRange: [
            0,
            24,
            64,
          ],

          outputRange: [
            0,
            0.015,
            Platform.OS === "ios"
              ? 0.04
              : 0,
          ],

          extrapolate: "clamp",
        }),
      [activeScrollY],
    );

  /* ------------------------------------------------------------------------ */
  /* Notifications                                                            */
  /* ------------------------------------------------------------------------ */

  const refreshUnread =
    useCallback(async () => {
      if (!user?.uid) {
        setUnreadCount(0);

        return;
      }

      try {
        const count =
          await getNotificationUnreadCount();

        setUnreadCount(
          count,
        );
      } catch {
        /**
         * Keep the last known unread count.
         *
         * A failed request should not
         * clear the notification state.
         */
      }
    }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void refreshUnread();
    }, [refreshUnread]),
  );

  useEffect(() => {
    const subscription =
      DeviceEventEmitter.addListener(
        NOTIFICATION_UNREAD_CHANGED_EVENT,
        () => {
          void refreshUnread();
        },
      );

    return () => {
      subscription.remove();
    };
  }, [refreshUnread]);

  const badgeLabel =
    formatUnreadBadgeCount(
      unreadCount,
    );

  const bellAccessibilityLabel =
    unreadCount > 0
      ? `Notifications, ${
          unreadCount > 99
            ? "99 plus"
            : unreadCount
        } unread`
      : "Notifications";

  /* ------------------------------------------------------------------------ */
  /* Actions                                                                  */
  /* ------------------------------------------------------------------------ */

  const handleNotificationsPress =
    useCallback(() => {
      const parent =
        navigation.getParent();

      if (parent) {
        parent.navigate(
          "Notifications",
        );

        return;
      }

      navigation.navigate(
        "Notifications",
      );
    }, [navigation]);

  const handleProfilePress =
    useCallback(() => {
      navigation.navigate("MainTabs", {
        screen: "Profile",
      });
    }, [navigation]);

  const handleKeplerShowcaseLongPress =
    useCallback(() => {
      const parent =
        navigation.getParent();

      if (parent) {
        parent.navigate(
          "KeplerShowcase",
        );

        return;
      }

      navigation.navigate(
        "KeplerShowcase",
      );
    }, [navigation]);

  const userInitial = memberDisplayInitial(
    formatMemberDisplayLabel({
      displayName: user?.displayName,
      email: user?.email,
      userId: user?.uid,
    }),
  );

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <Animated.View
      style={[
        styles.header,

        {
          backgroundColor:
            headerBackgroundColor,

          shadowOpacity:
            headerShadowOpacity,
        },
      ]}
    >
      <View
        style={styles.inner}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Kepler Brand                                                      */}
        {/* ------------------------------------------------------------------ */}

        <View
          style={
            styles.brandContainer
          }
        >
          <Pressable
            onLongPress={
              handleKeplerShowcaseLongPress
            }
            delayLongPress={450}
            accessibilityRole="image"
            accessibilityLabel="Kepler"
            accessibilityHint="Long press to open Kepler showcase"
          >
            <KeplerLogo
              width={108}
              height={46}
              autoPlay
            />
          </Pressable>
        </View>

        <View
          style={
            styles.headerActions
          }
        >
          <Pressable
            style={({
              pressed,
            }) => [
              styles.actionButton,

              pressed &&
                styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              bellAccessibilityLabel
            }
            hitSlop={8}
            onPress={
              handleNotificationsPress
            }
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color="#012169"
            />

            <View
              style={
                styles.badgeSlot
              }
              pointerEvents="none"
            >
              {badgeLabel ? (
                <View
                  style={
                    styles.badge
                  }
                >
                  <Text
                    style={
                      styles.badgeText
                    }
                  >
                    {badgeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          <Pressable
            style={({
              pressed,
            }) => [
              styles.profileButton,
              pressed &&
                styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={8}
            onPress={
              handleProfilePress
            }
          >
            <FeedAvatar
              initial={userInitial}
              size={31}
            />
          </Pressable>
        </View>
      </View>

      {/* <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>
          Updates
        </Text>
      </View> */}

      {/* -------------------------------------------------------------------- */}
      {/* Scroll divider                                                       */}
      {/* -------------------------------------------------------------------- */}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.bottomGlow,

          {
            opacity:
              dividerOpacity,
          },
        ]}
      />
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Header                                                                 */
    /* ---------------------------------------------------------------------- */

    header: {
      zIndex: 100,

      /**
       * IMPORTANT:
       *
       * backgroundColor is intentionally NOT
       * defined here.
       *
       * Animated.View controls it based
       * on scrollY.
       */

      shadowColor:
        "#101828",

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowRadius: 8,

      /**
       * Android elevation cannot fade as
       * smoothly as iOS shadowOpacity.
       *
       * Keep it restrained.
       */
      elevation:
        Platform.OS ===
        "android"
          ? 2
          : 0,
    },

    inner: {
      width: "100%",

      height: 56,

      paddingHorizontal: 18,

      flexDirection: "row",

      alignItems: "center",
    },

    titleRow: {
      paddingHorizontal: 18,
      marginTop: -2,
      paddingBottom: 0,
    },

    screenTitle: {
      ...typography.bodyLarge,
      color: "#101828",
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.3,
      lineHeight: 26,
    },

    /* ---------------------------------------------------------------------- */
    /* Brand                                                                  */
    /* ---------------------------------------------------------------------- */

    brandContainer: {
      flex: 1,

      minWidth: 0,

      height: 46,

      alignItems:
        "flex-start",

      justifyContent:
        "center",

      overflow:
        "visible",
    },

    /* ---------------------------------------------------------------------- */
    /* Header Actions                                                         */
    /* ---------------------------------------------------------------------- */

    headerActions: {
      marginLeft: 12,

      flexDirection: "row",

      alignItems: "center",

      gap: 6,

      flexShrink: 0,
    },

    actionButton: {
      width: 36,
      height: 36,

      borderRadius: 12,

      alignItems: "center",

      justifyContent:
        "center",

      backgroundColor:
        // "rgba(255,255,255,0.88)",
        "transparent",

      // borderWidth:
      //   StyleSheet.hairlineWidth,

      // borderColor:
      //   "rgba(1,33,105,0.06)",
    },

    profileButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        // "rgba(255,255,255,0.88)",
        "transparent",
      // borderWidth:
      //   StyleSheet.hairlineWidth,
      // borderColor:
      //   "rgba(1,33,105,0.06)",
    },

    buttonPressed: {
      opacity: 0.74,

      transform: [
        {
          scale: 0.94,
        },
      ],
    },

    /* ---------------------------------------------------------------------- */
    /* Notification Badge                                                     */
    /* ---------------------------------------------------------------------- */

    badgeSlot: {
      position: "absolute",

      top: -4,
      right: -4,

      minWidth: 19,
      height: 19,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    badge: {
      minWidth: 19,

      height: 19,

      paddingHorizontal: 4,

      borderRadius: 10,

      backgroundColor:
        "#E31837",

      borderWidth: 2,

      borderColor:
        "#FFFFFF",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    badgeText: {
      ...typography.metadata,

      fontSize: 9,

      lineHeight: 10,

      fontWeight:
        "700",

      color:
        "#FFFFFF",

      textAlign:
        "center",
    },

    /* ---------------------------------------------------------------------- */
    /* Bottom Edge                                                            */
    /* ---------------------------------------------------------------------- */

    bottomGlow: {
      position:
        "absolute",

      left: 18,
      right: 18,
      bottom: 0,

      height:
        StyleSheet.hairlineWidth,

      backgroundColor:
        "rgba(1,33,105,0.08)",
    },
  });