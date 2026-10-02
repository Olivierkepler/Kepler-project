import React, { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

type Props = {
  size?: number;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  decorative?: boolean;
};

type RibbonDefinition = {
  key: string;
  path: string;
  gradientId: string;
  strokeWidth: number;
  opacity: number;
  duration: number;
  delay: number;
  rotationDirection: 1 | -1;
  scalePeak: number;
  translateXPeak: number;
  translateYPeak: number;
};

const COLORS = {
  navyDeep: "#050D33",
  navyDark: "#0B1550",
  navy: "#012169",
  navyBright: "#073D9A",

  blue: "#1E8FE0",
  blueBright: "#50B8FF",
  bluePale: "#B9E4FF",

  redDark: "#A90F28",
  red: "#E31837",
  redBright: "#FF3856",
  redSoft: "#FF7890",

  silver: "#F1F3F5",
  white: "#FFFFFF",
} as const;

const VIEWBOX_SIZE = 400;
const CENTER = VIEWBOX_SIZE / 2;

const ORB_RADIUS = 128;
const AURA_RADIUS = 174;

const RIBBONS: readonly RibbonDefinition[] = [
  {
    key: "red-primary",
    path:
      "M66 220 C94 102 194 54 299 97 C353 119 358 190 324 242 C280 309 171 335 89 278 C57 256 54 239 66 220",
    gradientId: "redEnergy",
    strokeWidth: 10,
    opacity: 0.98,
    duration: 8200,
    delay: 0,
    rotationDirection: 1,
    scalePeak: 1.025,
    translateXPeak: 3,
    translateYPeak: -3,
  },
  {
    key: "blue-orbit",
    path:
      "M82 247 C132 300 218 307 290 257 C350 215 346 143 295 108 C245 74 176 92 137 137 C102 178 95 220 66 210",
    gradientId: "blueOrbit",
    strokeWidth: 6,
    opacity: 0.9,
    duration: 10400,
    delay: 340,
    rotationDirection: -1,
    scalePeak: 1.035,
    translateXPeak: -4,
    translateYPeak: 2,
  },
  {
    key: "red-secondary",
    path:
      "M106 124 C163 79 247 69 300 119 C332 150 320 205 278 232 C225 266 144 250 109 288 C91 308 96 329 107 340",
    gradientId: "redSecondary",
    strokeWidth: 5,
    opacity: 0.74,
    duration: 12600,
    delay: 700,
    rotationDirection: 1,
    scalePeak: 1.03,
    translateXPeak: 2,
    translateYPeak: 4,
  },
  {
    key: "light-orbit",
    path:
      "M76 179 C117 215 177 225 222 193 C263 164 278 113 319 101 C338 95 350 100 360 108",
    gradientId: "lightOrbit",
    strokeWidth: 3.5,
    opacity: 0.9,
    duration: 13800,
    delay: 900,
    rotationDirection: -1,
    scalePeak: 1.018,
    translateXPeak: -2,
    translateYPeak: -2,
  },
];

function RibbonGradients() {
  return (
    <Defs>
      <LinearGradient
        id="redEnergy"
        x1="0%"
        y1="20%"
        x2="100%"
        y2="80%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.redDark}
          stopOpacity={0.05}
        />
        <Stop
          offset="20%"
          stopColor={COLORS.red}
          stopOpacity={0.88}
        />
        <Stop
          offset="50%"
          stopColor={COLORS.redBright}
          stopOpacity={1}
        />
        <Stop
          offset="74%"
          stopColor={COLORS.red}
          stopOpacity={0.95}
        />
        <Stop
          offset="100%"
          stopColor={COLORS.redSoft}
          stopOpacity={0.08}
        />
      </LinearGradient>

      <LinearGradient
        id="blueOrbit"
        x1="100%"
        y1="0%"
        x2="0%"
        y2="100%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.bluePale}
          stopOpacity={0.04}
        />
        <Stop
          offset="24%"
          stopColor={COLORS.blueBright}
          stopOpacity={0.72}
        />
        <Stop
          offset="50%"
          stopColor={COLORS.blue}
          stopOpacity={1}
        />
        <Stop
          offset="78%"
          stopColor={COLORS.navyBright}
          stopOpacity={0.86}
        />
        <Stop
          offset="100%"
          stopColor={COLORS.navy}
          stopOpacity={0.05}
        />
      </LinearGradient>

      <LinearGradient
        id="redSecondary"
        x1="0%"
        y1="100%"
        x2="100%"
        y2="0%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.navy}
          stopOpacity={0}
        />
        <Stop
          offset="25%"
          stopColor={COLORS.red}
          stopOpacity={0.56}
        />
        <Stop
          offset="55%"
          stopColor={COLORS.redBright}
          stopOpacity={0.9}
        />
        <Stop
          offset="78%"
          stopColor={COLORS.blue}
          stopOpacity={0.48}
        />
        <Stop
          offset="100%"
          stopColor={COLORS.navy}
          stopOpacity={0}
        />
      </LinearGradient>

      <LinearGradient
        id="lightOrbit"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.white}
          stopOpacity={0}
        />
        <Stop
          offset="28%"
          stopColor={COLORS.bluePale}
          stopOpacity={0.58}
        />
        <Stop
          offset="52%"
          stopColor={COLORS.white}
          stopOpacity={0.96}
        />
        <Stop
          offset="72%"
          stopColor={COLORS.blueBright}
          stopOpacity={0.58}
        />
        <Stop
          offset="100%"
          stopColor={COLORS.white}
          stopOpacity={0}
        />
      </LinearGradient>
    </Defs>
  );
}

const AnimatedRibbon = memo(function AnimatedRibbon({
  ribbon,
  animated,
}: {
  ribbon: RibbonDefinition;
  animated: boolean;
}) {
  const progress = useRef(
    new Animated.Value(animated ? 0 : 0.5),
  ).current;

  const animationRef =
    useRef<Animated.CompositeAnimation | null>(null);

  const delayRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    animationRef.current?.stop();

    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }

    progress.stopAnimation();

    if (!animated) {
      progress.setValue(0.5);
      return;
    }

    progress.setValue(0);

    const halfDuration = ribbon.duration / 2;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: halfDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: halfDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      { iterations: -1 },
    );

    delayRef.current = setTimeout(() => {
      animationRef.current = animation;
      animation.start();
    }, ribbon.delay);

    return () => {
      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }

      animationRef.current?.stop();
      animationRef.current = null;
      progress.stopAnimation();
    };
  }, [
    animated,
    progress,
    ribbon.delay,
    ribbon.duration,
  ]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange:
      ribbon.rotationDirection === 1
        ? ["-2deg", "3deg"]
        : ["2deg", "-3deg"],
  });

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, ribbon.scalePeak],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ribbon.translateXPeak],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ribbon.translateYPeak],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      ribbon.opacity * 0.9,
      ribbon.opacity,
      ribbon.opacity * 0.94,
    ],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          transform: [
            { translateX },
            { translateY },
            { scale },
            { rotate },
          ],
        },
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      >
        <RibbonGradients />

        <Path
          d={ribbon.path}
          fill="none"
          stroke={`url(#${ribbon.gradientId})`}
          strokeWidth={ribbon.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
});

export default function OrbGlow({
  size = 220,
  animated = true,
  style,
  accessibilityLabel = "Kepler AI",
  decorative = false,
}: Props) {
  const breathing = useRef(
    new Animated.Value(0),
  ).current;

  const breathingLoop =
    useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    breathingLoop.current?.stop();
    breathing.stopAnimation();

    if (!animated) {
      breathing.setValue(0);
      return;
    }

    breathing.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      { iterations: -1 },
    );

    breathingLoop.current = animation;
    animation.start();

    return () => {
      breathingLoop.current?.stop();
      breathingLoop.current = null;
      breathing.stopAnimation();
    };
  }, [animated, breathing]);

  const auraScale = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.045],
  });

  const auraOpacity = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.58, 0.78],
  });

  const orbScale = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
        },
        style,
      ]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={
        decorative ? undefined : accessibilityLabel
      }
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.blueAura,
          {
            opacity: auraOpacity,
            transform: [{ scale: auraScale }],
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.redAura,
          {
            opacity: auraOpacity,
            transform: [{ scale: auraScale }],
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ scale: orbScale }],
          },
        ]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        >
          <Defs>
            <RadialGradient
              id="sphereCore"
              cx="34%"
              cy="27%"
              rx="72%"
              ry="72%"
              fx="30%"
              fy="23%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.blueBright}
                stopOpacity={0.92}
              />
              <Stop
                offset="12%"
                stopColor={COLORS.blue}
                stopOpacity={0.92}
              />
              <Stop
                offset="34%"
                stopColor={COLORS.navyBright}
                stopOpacity={1}
              />
              <Stop
                offset="67%"
                stopColor={COLORS.navy}
                stopOpacity={1}
              />
              <Stop
                offset="100%"
                stopColor={COLORS.navyDeep}
                stopOpacity={1}
              />
            </RadialGradient>

            <RadialGradient
              id="sphereLight"
              cx="29%"
              cy="20%"
              rx="45%"
              ry="45%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.white}
                stopOpacity={0.75}
              />
              <Stop
                offset="22%"
                stopColor={COLORS.bluePale}
                stopOpacity={0.38}
              />
              <Stop
                offset="100%"
                stopColor={COLORS.blue}
                stopOpacity={0}
              />
            </RadialGradient>

            <RadialGradient
              id="ambientBlue"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.blue}
                stopOpacity={0.22}
              />
              <Stop
                offset="55%"
                stopColor={COLORS.blue}
                stopOpacity={0.08}
              />
              <Stop
                offset="100%"
                stopColor={COLORS.blue}
                stopOpacity={0}
              />
            </RadialGradient>

            <LinearGradient
              id="sphereEdge"
              x1="0%"
              y1="15%"
              x2="100%"
              y2="85%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.blueBright}
                stopOpacity={0.9}
              />
              <Stop
                offset="34%"
                stopColor={COLORS.navy}
                stopOpacity={0.98}
              />
              <Stop
                offset="68%"
                stopColor={COLORS.red}
                stopOpacity={0.56}
              />
              <Stop
                offset="100%"
                stopColor={COLORS.blue}
                stopOpacity={0.8}
              />
            </LinearGradient>
          </Defs>

          <Ellipse
            cx={CENTER}
            cy={CENTER}
            rx={AURA_RADIUS}
            ry={AURA_RADIUS}
            fill="url(#ambientBlue)"
          />

          <Ellipse
            cx={CENTER}
            cy={CENTER}
            rx={ORB_RADIUS}
            ry={ORB_RADIUS}
            fill="url(#sphereCore)"
          />

          <Ellipse
            cx={CENTER - 20}
            cy={CENTER - 32}
            rx={ORB_RADIUS * 0.76}
            ry={ORB_RADIUS * 0.62}
            fill="url(#sphereLight)"
          />

          <Ellipse
            cx={CENTER}
            cy={CENTER}
            rx={ORB_RADIUS}
            ry={ORB_RADIUS}
            fill="none"
            stroke="url(#sphereEdge)"
            strokeWidth={5}
            opacity={0.94}
          />
        </Svg>
      </Animated.View>

      {RIBBONS.map((ribbon) => (
        <AnimatedRibbon
          key={ribbon.key}
          ribbon={ribbon}
          animated={animated}
        />
      ))}

      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient
            id="frontHighlight"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor={COLORS.white}
              stopOpacity={0}
            />
            <Stop
              offset="25%"
              stopColor={COLORS.bluePale}
              stopOpacity={0.38}
            />
            <Stop
              offset="52%"
              stopColor={COLORS.white}
              stopOpacity={0.94}
            />
            <Stop
              offset="72%"
              stopColor={COLORS.blueBright}
              stopOpacity={0.5}
            />
            <Stop
              offset="100%"
              stopColor={COLORS.white}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>

        <Path
          d="
            M98 259
            C144 236 202 245 250 220
            C291 198 310 160 322 126
          "
          fill="none"
          stroke="url(#frontHighlight)"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.92}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "transparent",
  },

  blueAura: {
    position: "absolute",
    width: "72%",
    height: "72%",
    borderRadius: 9999,
    backgroundColor: "rgba(30, 143, 224, 0.13)",
    shadowColor: "#1E8FE0",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.38,
    shadowRadius: 22,
    elevation: 4,
  },

  redAura: {
    position: "absolute",
    width: "54%",
    height: "54%",
    right: "8%",
    top: "9%",
    borderRadius: 9999,
    backgroundColor: "rgba(227, 24, 55, 0.06)",
    shadowColor: "#E31837",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 2,
  },
});