import React from "react";

import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  typography,
} from "../../../theme/colors";

const KEPLER_NAVY = "#012169";

type Props = {
  initial: string;
  size?: number;
};

export default function FeedAvatar({
  initial,
  size = 42,
}: Props) {
  const fontSize =
    size < 36 ? 13 : size < 42 ? 14 : 15;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      accessibilityLabel={`${initial} avatar`}
    >
      <Text
        style={[
          styles.initial,
          { fontSize },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(1,33,105,0.07)",
  },

  initial: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontWeight: "600",
  },
});
