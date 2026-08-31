import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  ACCENT_BLOCKS,
  BRAND_COLORS,
  MARK_VIEWBOX,
  SIGMA_PATH,
  resolveBrandMotionMode,
} from "./brandGeometry";
import BuildSigmaMark from "./BuildSigmaMark";
import { useReduceMotion } from "./useReduceMotion";
import { typography } from "../../theme/typography";

export type BuildSigmaLoaderProps = {
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact looping loader for TRUE waiting states only.
 * Distinct from reveal: assembled Σ + sequential accent pulse (~1.6s loop).
 * Never flies accents from off-screen or redraws the full splash.
 */
export default function BuildSigmaLoader({
  size = 56,
  label,
  style,
}: BuildSigmaLoaderProps) {
  const reduceMotion = useReduceMotion();
  const mode = resolveBrandMotionMode({
    requested: "loader",
    reduceMotion,
  });

  const pulse = useRef(new Animated.Value(0)).current;
  const accentOpacities = useRef(
    ACCENT_BLOCKS.map(() => new Animated.Value(0.55)),
  ).current;

  useEffect(() => {
    if (mode === "static") {
      return;
    }

    const sigmaPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const accentLoop = Animated.loop(
      Animated.stagger(
        200,
        accentOpacities.map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 300,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0.4,
              duration: 500,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );

    sigmaPulse.start();
    accentLoop.start();

    return () => {
      sigmaPulse.stop();
      accentLoop.stop();
    };
  }, [mode, pulse, accentOpacities]);

  if (mode === "static") {
    return (
      <View
        style={[styles.column, style]}
        accessibilityRole="progressbar"
        accessibilityLabel={label ?? "Loading"}
      >
        <BuildSigmaMark size={size} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    );
  }

  const sigmaOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const sigmaScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });
  const unit = size / MARK_VIEWBOX;

  return (
    <View
      style={[styles.column, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Loading"}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          opacity: sigmaOpacity,
          transform: [{ scale: sigmaScale }],
        }}
      >
        {ACCENT_BLOCKS.map((block, index) => (
          <Animated.View
            key={block.id}
            pointerEvents="none"
            accessibilityElementsHidden
            style={{
              position: "absolute",
              left: block.x * unit,
              top: block.y * unit,
              width: block.width * unit,
              height: block.height * unit,
              borderRadius: 3 * unit,
              backgroundColor: block.color,
              opacity: accentOpacities[index],
            }}
          />
        ))}
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
          style={StyleSheet.absoluteFill}
        >
          <Path
            d={SIGMA_PATH}
            stroke={BRAND_COLORS.cyan}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.bodyMedium,
    marginTop: 14,
    color: "#8C98A8",
    textAlign: "center",
  },
});
