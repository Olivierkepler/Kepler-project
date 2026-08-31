import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { typography } from "../../theme/typography";
import BuildSigmaMark from "./BuildSigmaMark";
import { BRAND_COLORS } from "./brandGeometry";

export type BuildSigmaLogoProps = {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  tagline?: string;
  /** Defaults to logo paint for dark surfaces; override for light themes. */
  wordmarkColor?: string;
  taglineColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Static BuildSigma brand lockup for Home/header contexts.
 * Never animates — use BuildSigmaAnimatedLogo for reveal.
 */
export default function BuildSigmaLogo({
  size = 40,
  showWordmark = true,
  showTagline = false,
  tagline = "PLAN ↔ REALITY",
  wordmarkColor = BRAND_COLORS.wordmark,
  taglineColor = BRAND_COLORS.tagline,
  style,
  accessibilityLabel = "BuildSigma",
}: BuildSigmaLogoProps) {
  return (
    <View
      style={[styles.row, style]}
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      <BuildSigmaMark size={size} accessible={false} />
      {showWordmark ? (
        <View style={styles.textBlock} accessibilityElementsHidden>
          <Text
            style={[
              styles.wordmark,
              { color: wordmarkColor, fontSize: Math.max(14, size * 0.38) },
            ]}
          >
            BuildSigma
          </Text>
          {showTagline ? (
            <Text style={[styles.tagline, { color: taglineColor }]}>{tagline}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textBlock: {
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: "Poppins_500Medium",
    letterSpacing: 0.4,
  },
  tagline: {
    ...typography.metadata,
    marginTop: 2,
    fontFamily: "Poppins_500Medium",
    letterSpacing: 1.2,
  },
});
