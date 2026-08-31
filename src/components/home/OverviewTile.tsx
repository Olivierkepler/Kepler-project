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
  icon: keyof typeof Ionicons.glyphMap;

  label: string;

  value: string | number;

  subtitle: string;

  iconColor?: string;

  iconBackground?: string;

  onPress?: () => void;
};

export default function OverviewTile({
  icon,
  label,
  value,
  subtitle,

  iconColor = colors.brand.blue,

  iconBackground = "#F1F8FD",

  onPress,
}: Props) {
  const content = (
    <>
      <View style={styles.top}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor:
                iconBackground,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={19}
            color={iconColor}
          />
        </View>

        {onPress ? (
          <Ionicons
            name="arrow-forward"
            size={16}
            color={colors.text.primary}
          />
        ) : null}
      </View>

      <Text style={styles.value}>
        {value}
      </Text>

      <Text style={styles.label}>
        {label}
      </Text>

      <Text style={styles.subtitle}>
        {subtitle}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.tile}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: "48%",
    minHeight: 156,

    padding: 16,

    borderRadius: 22,

    backgroundColor:
      "rgba(255,255,255,0.90)",

    shadowColor:
      colors.shadow.soft,

    shadowOffset: {
      width: 0,
      height: 6,
    },

    shadowOpacity: 0.82,
    shadowRadius: 17,

    elevation: 3,
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  icon: {
    width: 38,
    height: 38,

    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",
  },

  value: {
    ...typography.display,

    marginTop: 16,

    color: colors.text.primary,
  },

  label: {
    ...typography.caption,

    marginTop: 5,

    color: colors.text.primary,
  },

  subtitle: {
    ...typography.metadata,

    marginTop: 4,

    color: colors.text.primary,
  },

  pressed: {
    opacity: 0.82,

    transform: [
      {
        scale: 0.985,
      },
    ],
  },
});
