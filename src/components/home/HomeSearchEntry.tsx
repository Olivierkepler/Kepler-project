import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { typography } from "../../theme/colors";

const KEPLER_NAVY = "#012169";

type Props = {
  onPress: () => void;
};

/**
 * Compact Home search entry point (Phase Feed 2F).
 * Visual search field — navigates to dedicated Search screen on press.
 */
export default function HomeSearchEntry({ onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.field,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="Search BuildSigma"
    >
      <Ionicons
        name="search-outline"
        size={18}
        color={KEPLER_NAVY}
      />
      <Text style={styles.placeholder} numberOfLines={1}>
        Search updates, projects, people...
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
    marginTop: 6,
    marginBottom: 10,
  },

  pressed: {
    opacity: 0.88,
  },

  placeholder: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
    fontSize: 14.5,
    color: "#5B6B7C",
  },
});
