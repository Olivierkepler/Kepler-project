import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { typography } from "../../theme/colors";

const KEPLER_NAVY = "#012169";

type Props = {
  onPress: () => void;
  onComposePress?: () => void;
};

/**
 * Compact Home search entry point (Phase Feed 2F).
 * Visual search field — navigates to dedicated Search screen on press.
 * Optional compose control opens the existing project update composer.
 */
export default function HomeSearchEntry({
  onPress,
  onComposePress,
}: Props) {
  return (
    <View style={styles.row}>
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

      {onComposePress ? (
        <Pressable
          style={({ pressed }) => [
            styles.composeButton,
            pressed && styles.pressed,
          ]}
          onPress={onComposePress}
          accessibilityRole="button"
          accessibilityLabel="Create project update"
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={KEPLER_NAVY}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 10,
  },

  field: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
  },

  composeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.10)",
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
