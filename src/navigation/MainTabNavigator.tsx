import React, {
  useEffect,
  useRef,
} from "react";

import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";

import { BlurView } from "expo-blur";

import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import DeltasScreen from "../screens/DeltasScreen";
import HomeScreen from "../screens/HomeScreen";
import KeplerAIScreen from "../screens/KeplerAIScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ProjectsScreen from "../screens/ProjectsScreen";
import OrbGlow from "../components/visuals/OrbGlow";

import {
  colors,
  typography,
} from "../theme/colors";

import type {
  MainTabParamList,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Navigator                                                                  */
/* -------------------------------------------------------------------------- */

const Tab =
  createBottomTabNavigator<MainTabParamList>();

/* -------------------------------------------------------------------------- */
/* Kepler Navigation Tokens                                                   */
/* -------------------------------------------------------------------------- */

const KEPLER_NAVY =
  "#012169";

const ICON_MUTED =
  "#7A8494";

const TAB_HEIGHT =
  62;

const TAB_RADIUS =
  31;

const TAB_SIDE_MARGIN =
  12;

/* -------------------------------------------------------------------------- */
/* Icon                                                                       */
/* -------------------------------------------------------------------------- */

type GlassTabIconProps = {
  name:
    keyof typeof Ionicons.glyphMap;

  focusedName?:
    keyof typeof Ionicons.glyphMap;

  focused:
    boolean;

  color:
    string;

  size:
    number;

};

function GlassTabIcon({
  name,
  focusedName,
  focused,
  color,
  size,
}: GlassTabIconProps) {
  const activeProgress =
    useRef(
      new Animated.Value(
        focused
          ? 1
          : 0,
      ),
    ).current;

  useEffect(() => {
    const animation =
      Animated.timing(
        activeProgress,
        {
          toValue:
            focused
              ? 1
              : 0,

          duration:
            focused
              ? 240
              : 170,

          easing:
            focused
              ? Easing.out(
                  Easing.cubic,
                )
              : Easing.inOut(
                  Easing.quad,
                ),

          useNativeDriver:
            true,
        },
      );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    activeProgress,
    focused,
  ]);

  const iconName =
    focused
      ? focusedName ?? name
      : name;

  /* ------------------------------------------------------------------------ */
  /* Standard Tab                                                             */
  /* ------------------------------------------------------------------------ */

  const glassOpacity =
    activeProgress.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        0,
        1,
      ],
    });

  const glassScale =
    activeProgress.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        0.9,
        1,
      ],
    });

  const glassTranslateY =
    activeProgress.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        2,
        0,
      ],
    });

  const iconScale =
    activeProgress.interpolate({
      inputRange: [
        0,
        1,
      ],

      outputRange: [
        1,
        1.055,
      ],
    });

  return (
    <View
      style={
        styles.standardTabWrapper
      }
    >
      {/* ---------------------------------------------------------- */}
      {/* Active selection                                          */}
      {/* ---------------------------------------------------------- */}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.activeGlassPill,

          {
            opacity:
              glassOpacity,

            transform: [
              {
                scale:
                  glassScale,
              },

              {
                translateY:
                  glassTranslateY,
              },
            ],
          },
        ]}
      >
        <BlurView
          intensity={
            Platform.OS ===
            "ios"
              ? 46
              : 20
          }
          tint="light"
          style={
            StyleSheet.absoluteFill
          }
        />

        <View
          style={
            styles.activeGlassPillTint
          }
        />

        <View
          style={
            styles.activeGlassPillBorder
          }
        />
      </Animated.View>

      {/* ---------------------------------------------------------- */}
      {/* Icon                                                       */}
      {/* ---------------------------------------------------------- */}

      <Animated.View
        style={[
          styles.iconContainer,

          {
            transform: [
              {
                scale:
                  iconScale,
              },
            ],
          },
        ]}
      >
        <Ionicons
          name={iconName}
          color={color}
          size={size}
        />
      </Animated.View>
    </View>
  );
}

function KeplerAiTabIcon() {
  return (
    <View
      style={styles.captureIconContainer}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <OrbGlow
        size={72}
        animated={true}
        style={styles.captureOrb}
        accessibilityLabel=""
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab Background                                                             */
/* -------------------------------------------------------------------------- */

function GlassTabBackground() {
  return (
    <View
      style={
        styles.glassBackground
      }
    >
      <BlurView
        intensity={
          Platform.OS ===
          "ios"
            ? 52
            : 26
        }
        tint="light"
        style={
          StyleSheet.absoluteFill
        }
      />

      <View
        style={
          styles.glassTint
        }
      />

      <View
        style={
          styles.glassHighlight
        }
      />

      <View
        style={
          styles.glassBorder
        }
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Navigator                                                             */
/* -------------------------------------------------------------------------- */

export default function MainTabNavigator() {
  const insets =
    useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Projects"
      screenOptions={{
        headerShown:
          false,

        tabBarHideOnKeyboard:
          true,

        tabBarActiveTintColor:
          KEPLER_NAVY,

        tabBarInactiveTintColor:
          ICON_MUTED,

        tabBarBackground:
          () => (
            <GlassTabBackground />
          ),

        /* ------------------------------------------------------------------ */
        /* Bar                                                                */
        /* ------------------------------------------------------------------ */

        tabBarStyle: {
          position:
            "absolute",

          left:
            TAB_SIDE_MARGIN,

          right:
            TAB_SIDE_MARGIN,

          bottom:
            Math.max(
              insets.bottom,
              8,
            ),

          height:
            TAB_HEIGHT,

          paddingTop:
            5,

          paddingBottom:
            4,

          paddingHorizontal:
            5,

          backgroundColor:
            "transparent",

          borderTopWidth:
            0,

          borderRadius:
            TAB_RADIUS,

          shadowColor:
            KEPLER_NAVY,

          shadowOffset: {
            width: 0,
            height: 7,
          },

          shadowOpacity:
            Platform.OS ===
            "ios"
              ? 0.08
              : 0,

          shadowRadius:
            20,

          elevation:
            8,
        },

        tabBarItemStyle: {
          borderRadius:
            18,

          paddingVertical:
            0,
        },

        tabBarLabelStyle: {
          ...typography.metadata,

          fontSize:
            9,

          lineHeight:
            11,

          fontWeight:
            "600",

          letterSpacing:
            0.2,

          marginTop:
            -1,
        },

        tabBarIconStyle: {
          marginTop:
            0,
        },
      }}
    >
      {/* ==================================================================== */}
      {/* UPDATES                                                              */}
      {/* ==================================================================== */}

      <Tab.Screen
        name="Home"
        component={
          HomeScreen
        }
        options={{
          tabBarLabel:
            "Updates",

          tabBarAccessibilityLabel:
            "Updates",

          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <GlassTabIcon
              name="notifications-outline"
              focusedName="notifications"
              focused={
                focused
              }
              color={
                color
              }
              size={Math.min(
                size,
                22,
              )}
            />
          ),
        }}
      />

      {/* ==================================================================== */}
      {/* PROJECTS                                                             */}
      {/* ==================================================================== */}

      <Tab.Screen
        name="Projects"
        component={
          ProjectsScreen
        }
        options={{
          tabBarLabel:
            "Projects",

          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <GlassTabIcon
              name="business-outline"
              focusedName="business"
              focused={
                focused
              }
              color={
                color
              }
              size={Math.min(
                size,
                22,
              )}
            />
          ),
        }}
      />

      {/* ==================================================================== */}
      {/* CAPTURE                                                              */}
      {/* ==================================================================== */}

      <Tab.Screen
        name="Capture"
        component={KeplerAIScreen}
        options={{
          tabBarLabel:
            () => (
              <Text style={styles.keplerAiLabel}>
                Kepler AI
              </Text>
            ),

          tabBarAccessibilityLabel:
            "Kepler AI Capture",

          tabBarIcon: KeplerAiTabIcon,
        }}
      />

      {/* ==================================================================== */}
      {/* DELTAS                                                               */}
      {/* ==================================================================== */}

      <Tab.Screen
        name="Deltas"
        component={
          DeltasScreen
        }
        options={{
          tabBarLabel:
            "Deltas",

          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <GlassTabIcon
              name="git-compare-outline"
              focusedName="git-compare"
              focused={
                focused
              }
              color={
                color
              }
              size={Math.min(
                size,
                22,
              )}
            />
          ),
        }}
      />

      {/* ==================================================================== */}
      {/* PROFILE                                                              */}
      {/* ==================================================================== */}

      <Tab.Screen
        name="Profile"
        component={
          ProfileScreen
        }
        options={{
          tabBarLabel:
            "Profile",

          tabBarIcon: ({
            color,
            size,
            focused,
          }) => (
            <GlassTabIcon
              name="person-outline"
              focusedName="person"
              focused={
                focused
              }
              color={
                color
              }
              size={Math.min(
                size,
                22,
              )}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles =
  StyleSheet.create({
    /* ---------------------------------------------------------------------- */
    /* Main Glass Bar                                                         */
    /* ---------------------------------------------------------------------- */

    glassBackground: {
      ...StyleSheet.absoluteFill,

      marginHorizontal:
        4,

      borderRadius:
        TAB_RADIUS,

      overflow:
        "hidden",

      backgroundColor:
        Platform.OS ===
        "ios"
          ? "rgba(255,255,255,0.72)"
          : "rgba(255,255,255,0.96)",
    },

    glassTint: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        Platform.OS ===
        "ios"
          ? "rgba(255,255,255,0.14)"
          : "rgba(255,255,255,0.06)",
    },

    /* ---------------------------------------------------------------------- */
    /* Upper Glass Highlight                                                  */
    /* ---------------------------------------------------------------------- */

    glassHighlight: {
      position:
        "absolute",

      top:
        0,

      left:
        22,

      right:
        22,

      height:
        StyleSheet.hairlineWidth,

      backgroundColor:
        "rgba(255,255,255,0.90)",
    },

    /* ---------------------------------------------------------------------- */
    /* Glass Border                                                           */
    /* ---------------------------------------------------------------------- */

    glassBorder: {
      ...StyleSheet.absoluteFill,

      borderRadius:
        TAB_RADIUS,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        Platform.OS ===
        "ios"
          ? "rgba(1,33,105,0.09)"
          : "rgba(1,33,105,0.07)",
    },

    /* ---------------------------------------------------------------------- */
    /* Standard Tab                                                           */
    /* ---------------------------------------------------------------------- */

    standardTabWrapper: {
      width:
        52,

      height:
        36,

      alignItems:
        "center",

      justifyContent:
        "center",

      position:
        "relative",
    },

    /* ---------------------------------------------------------------------- */
    /* Active Pill                                                            */
    /* ---------------------------------------------------------------------- */

    activeGlassPill: {
      position:
        "absolute",

      width:
        44,

      height:
        32,

      borderRadius:
        16,

      overflow:
        "hidden",

      backgroundColor:
        Platform.OS ===
        "ios"
          ? "rgba(1,33,105,0.055)"
          : "rgba(1,33,105,0.065)",

      shadowColor:
        KEPLER_NAVY,

      shadowOffset: {
        width:
          0,

        height:
          2,
      },

      shadowOpacity:
        Platform.OS ===
        "ios"
          ? 0.06
          : 0,

      shadowRadius:
        6,

      elevation:
        2,
    },

    activeGlassPillTint: {
      ...StyleSheet.absoluteFill,

      backgroundColor:
        Platform.OS ===
        "ios"
          ? "rgba(255,255,255,0.32)"
          : "rgba(255,255,255,0.46)",
    },

    activeGlassPillBorder: {
      ...StyleSheet.absoluteFill,

      borderRadius:
        16,

      borderWidth:
        StyleSheet.hairlineWidth,

      borderColor:
        "rgba(1,33,105,0.10)",
    },

    /* ---------------------------------------------------------------------- */
    /* Standard Icon                                                          */
    /* ---------------------------------------------------------------------- */

    iconContainer: {
      width:
        34,

      height:
        27,

      alignItems:
        "center",

      justifyContent:
        "center",

      zIndex:
        2,
    },

    /* ---------------------------------------------------------------------- */
    /* Capture                                                                */
    /* ---------------------------------------------------------------------- */

    captureIconContainer: {
      width: 46,

      height: 46,

      marginTop: -10,

      marginBottom: 10,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    captureOrb: {
      position: "absolute",
      width: 72,
      height: 72,
      top: -13,
      left: -13,
    },

    keplerAiLabel: {
      ...typography.metadata,
      color: KEPLER_NAVY,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: "600",
      letterSpacing: 0.2,
      marginTop: -1,
      textAlign: "center",
    },
  });
