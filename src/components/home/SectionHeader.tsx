import React from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  colors,
  typography,
} from "../../theme/colors";

type Props = {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
};

export default function SectionHeader({
  title,
  actionLabel,
  onPress,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {title}
      </Text>

      {actionLabel && onPress ? (
        <Pressable
          style={({ pressed }) => [
            styles.action,
            pressed &&
              styles.actionPressed,
          ]}
          onPress={onPress}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>
            {actionLabel}
          </Text>

          <Ionicons
            name="arrow-forward"
            size={14}
            color={colors.brand.blue}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    marginBottom: 13,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    ...typography.caption,

    color: colors.text.primary,
  },

  action: {
    minHeight: 32,

    flexDirection: "row",
    alignItems: "center",

    gap: 4,

    paddingLeft: 10,
  },

  actionPressed: {
    opacity: 0.55,
  },

  actionText: {
    ...typography.button,

    color: colors.text.primary,
  },
});
