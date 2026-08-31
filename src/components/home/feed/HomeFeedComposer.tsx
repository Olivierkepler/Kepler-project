import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  typography,
} from "../../../theme/colors";

import FeedAvatar from "./FeedAvatar";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

export type ComposerLaunchMode =
  | "text"
  | "photo"
  | "video";

type Props = {
  userInitial: string;

  onOpenComposer: (
    mode: ComposerLaunchMode,
  ) => void;
};

export default function HomeFeedComposer({
  userInitial,
  onOpenComposer,
}: Props) {
  return (
    <View style={styles.card}>
      {/* Kepler navy + red top accent */}
      <View
        pointerEvents="none"
        style={styles.cardTopAccent}
      >
        <View style={styles.cardTopAccentNavy} />
        <View style={styles.cardTopAccentRed} />
      </View>

      <Pressable
        onPress={() =>
          onOpenComposer("text")
        }
        accessibilityRole="button"
        accessibilityLabel="Share a project update"
        style={({ pressed }) => [
          styles.promptRow,
          pressed && styles.pressed,
        ]}
      >
        <FeedAvatar
          initial={userInitial}
          size={36}
        />

        <Text style={styles.prompt}>
          Share a project update...
        </Text>
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.actions}>
        <ComposerAction
          icon="image-outline"
          label="Photo"
          onPress={() =>
            onOpenComposer("photo")
          }
        />

        <ComposerAction
          icon="videocam-outline"
          label="Video"
          onPress={() =>
            onOpenComposer("video")
          }
        />

        <ComposerAction
          icon="create-outline"
          label="Update"
          onPress={() =>
            onOpenComposer("text")
          }
        />
      </View>
    </View>
  );
}

function ComposerAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={KEPLER_NAVY}
      />

      <Text style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,

    borderRadius: 18,

    backgroundColor:
      "rgba(255,255,255,0.8)",

    borderWidth:
      StyleSheet.hairlineWidth,

    borderColor:
      "rgba(15,23,42,0.07)",

    overflow: "hidden",

    // Required so the accent can sit
    // directly against the card's top edge.
    position: "relative",
  },

  /* ---------------------------------------------------------------------- */
  /* Kepler top accent                                                      */
  /* ---------------------------------------------------------------------- */

  cardTopAccent: {
    position: "absolute",

    top: 0,
    left: 0,
    right: 0,

    height: 2,

    flexDirection: "row",

    zIndex: 10,
  },

  cardTopAccentNavy: {
    flex: 1,

    backgroundColor: KEPLER_NAVY,
  },

  cardTopAccentRed: {
    width: 34,

    backgroundColor: KEPLER_RED,
  },

  /* ---------------------------------------------------------------------- */
  /* Composer                                                               */
  /* ---------------------------------------------------------------------- */

  promptRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 10,

    paddingHorizontal: 14,

    // Gives the content a little breathing
    // room beneath the 2px brand accent.
    paddingTop: 10,
    paddingBottom: 8,

    minHeight: 46,
  },

  prompt: {
    ...typography.body,

    flex: 1,

    color: "#667085",

    fontSize: 14.5,
  },

  divider: {
    height:
      StyleSheet.hairlineWidth,

    backgroundColor:
      "rgba(15,23,42,0.06)",

    marginHorizontal: 14,
  },

  actions: {
    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-around",

    paddingVertical: 4,

    paddingHorizontal: 6,
  },

  action: {
    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: 5,

    minHeight: 44,

    borderRadius: 8,
  },

  actionLabel: {
    ...typography.caption,

    color: KEPLER_NAVY,

    fontWeight: "600",

    fontSize: 12.5,
  },

  pressed: {
    opacity: 0.68,
  },
});