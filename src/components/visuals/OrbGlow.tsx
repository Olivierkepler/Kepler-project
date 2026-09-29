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

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type Props = {
  /**
   * Width and height of the complete orb.
   */
  size?: number;

  /**
   * Enable or disable animation.
   */
  animated?: boolean;

  /**
   * Optional external styling.
   */
  style?: StyleProp<ViewStyle>;

  /**
   * Accessibility description.
   */
  accessibilityLabel?: string;
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

/* -------------------------------------------------------------------------- */
/*                              Brand Colors                                  */
/* -------------------------------------------------------------------------- */

/**
 * Primary EH orange:
 * #FF641A
 *
 * The surrounding colors are intentionally derived
 * from the same orange family to create depth without
 * introducing blue, purple, yellow, or unrelated hues.
 */
const COLORS = {
  primary: "#FF641A",

  deep: "#B83200",
  dark: "#D94308",
  strong: "#EB4F0D",

  bright: "#FF7A3A",
  light: "#FF9A68",
  soft: "#FFC0A0",
  pale: "#FFE1D2",
} as const;

/* -------------------------------------------------------------------------- */
/*                                Configuration                               */
/* -------------------------------------------------------------------------- */

const VIEWBOX_SIZE = 400;
const CENTER = VIEWBOX_SIZE / 2;

const ORB_RADIUS = 128;
const AMBIENT_RADIUS = 172;

/**
 * Thicker strokes + stronger opacity make the orb
 * easier to read at small sizes on light backgrounds.
 */
const RIBBONS: readonly RibbonDefinition[] = [
  {
    key: "ribbon-1",

    path:
      "M74 203 C84 100 178 48 278 84 C354 111 351 210 296 267 C247 318 150 327 91 269 C63 241 61 218 74 203",

    gradientId: "primaryOrangeGradient",

    strokeWidth: 8,
    opacity: 0.96,

    duration: 8200,
    delay: 0,

    rotationDirection: 1,

    scalePeak: 1.025,

    translateXPeak: 3,
    translateYPeak: -4,
  },

  {
    key: "ribbon-2",

    path:
      "M89 241 C119 287 192 308 259 279 C330 247 350 174 311 128 C278 88 206 92 163 128 C118 165 104 223 70 210",

    gradientId: "brightOrangeGradient",

    strokeWidth: 7,
    opacity: 0.9,

    duration: 10400,
    delay: 420,

    rotationDirection: -1,

    scalePeak: 1.04,

    translateXPeak: -5,
    translateYPeak: 2,
  },

  {
    key: "ribbon-3",

    path:
      "M102 127 C151 82 234 60 290 112 C329 149 314 206 273 231 C220 264 142 249 110 287 C94 306 99 324 109 337",

    gradientId: "deepOrangeGradient",

    strokeWidth: 6,
    opacity: 0.84,

    duration: 12600,
    delay: 700,

    rotationDirection: 1,

    scalePeak: 1.035,

    translateXPeak: 2,
    translateYPeak: 5,
  },

  {
    key: "ribbon-4",

    path:
      "M78 178 C118 212 175 222 219 192 C260 165 271 113 316 101 C334 96 346 101 356 109",

    gradientId: "highlightOrangeGradient",

    strokeWidth: 5,
    opacity: 0.8,

    duration: 13800,
    delay: 900,

    rotationDirection: -1,

    scalePeak: 1.02,

    translateXPeak: -3,
    translateYPeak: -3,
  },
];

/* -------------------------------------------------------------------------- */
/*                                  Gradients                                 */
/* -------------------------------------------------------------------------- */

function RibbonGradients() {
  return (
    <Defs>
      {/* ------------------------------------------------------------ */}
      {/* Primary #FF641A ribbon                                       */}
      {/* ------------------------------------------------------------ */}

      <LinearGradient
        id="primaryOrangeGradient"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.deep}
          stopOpacity={0.22}
        />

        <Stop
          offset="24%"
          stopColor={COLORS.strong}
          stopOpacity={0.8}
        />

        <Stop
          offset="50%"
          stopColor={COLORS.primary}
          stopOpacity={1}
        />

        <Stop
          offset="74%"
          stopColor={COLORS.bright}
          stopOpacity={0.9}
        />

        <Stop
          offset="100%"
          stopColor={COLORS.soft}
          stopOpacity={0.22}
        />
      </LinearGradient>

      {/* ------------------------------------------------------------ */}
      {/* Brighter orange ribbon                                       */}
      {/* ------------------------------------------------------------ */}

      <LinearGradient
        id="brightOrangeGradient"
        x1="100%"
        y1="0%"
        x2="0%"
        y2="100%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.soft}
          stopOpacity={0.18}
        />

        <Stop
          offset="28%"
          stopColor={COLORS.bright}
          stopOpacity={0.82}
        />

        <Stop
          offset="52%"
          stopColor={COLORS.primary}
          stopOpacity={1}
        />

        <Stop
          offset="76%"
          stopColor={COLORS.strong}
          stopOpacity={0.78}
        />

        <Stop
          offset="100%"
          stopColor={COLORS.dark}
          stopOpacity={0.18}
        />
      </LinearGradient>

      {/* ------------------------------------------------------------ */}
      {/* Deeper dimensional ribbon                                    */}
      {/* ------------------------------------------------------------ */}

      <LinearGradient
        id="deepOrangeGradient"
        x1="0%"
        y1="100%"
        x2="100%"
        y2="0%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.deep}
          stopOpacity={0.2}
        />

        <Stop
          offset="30%"
          stopColor={COLORS.dark}
          stopOpacity={0.72}
        />

        <Stop
          offset="52%"
          stopColor={COLORS.primary}
          stopOpacity={0.98}
        />

        <Stop
          offset="76%"
          stopColor={COLORS.bright}
          stopOpacity={0.72}
        />

        <Stop
          offset="100%"
          stopColor={COLORS.light}
          stopOpacity={0.16}
        />
      </LinearGradient>

      {/* ------------------------------------------------------------ */}
      {/* Light-catching ribbon                                        */}
      {/* ------------------------------------------------------------ */}

      <LinearGradient
        id="highlightOrangeGradient"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <Stop
          offset="0%"
          stopColor={COLORS.pale}
          stopOpacity={0.08}
        />

        <Stop
          offset="28%"
          stopColor={COLORS.soft}
          stopOpacity={0.6}
        />

        <Stop
          offset="50%"
          stopColor={COLORS.light}
          stopOpacity={0.95}
        />

        <Stop
          offset="68%"
          stopColor={COLORS.primary}
          stopOpacity={0.86}
        />

        <Stop
          offset="100%"
          stopColor={COLORS.strong}
          stopOpacity={0.08}
        />
      </LinearGradient>
    </Defs>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Animated Ribbon                                */
/* -------------------------------------------------------------------------- */

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

      {
        iterations: -1,
      },
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
      ribbon.opacity * 0.88,
      ribbon.opacity,
      ribbon.opacity * 0.92,
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
            {
              translateX,
            },

            {
              translateY,
            },

            {
              scale,
            },

            {
              rotate,
            },
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

/* -------------------------------------------------------------------------- */
/*                                  Orb Glow                                  */
/* -------------------------------------------------------------------------- */

export default function OrbGlow({
  size = 220,
  animated = true,
  style,

  accessibilityLabel = "BuildSigma intelligence orb",
}: Props) {
  const breathing = useRef(
    new Animated.Value(0),
  ).current;

  const breathingLoop =
    useRef<Animated.CompositeAnimation | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                            Breathing Animation                           */
  /* ------------------------------------------------------------------------ */

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

          duration: 3200,

          easing: Easing.inOut(Easing.sin),

          useNativeDriver: true,
        }),

        Animated.timing(breathing, {
          toValue: 0,

          duration: 3200,

          easing: Easing.inOut(Easing.sin),

          useNativeDriver: true,
        }),
      ]),

      {
        iterations: -1,
      },
    );

    breathingLoop.current = animation;

    animation.start();

    return () => {
      breathingLoop.current?.stop();

      breathingLoop.current = null;

      breathing.stopAnimation();
    };
  }, [animated, breathing]);

  /* ------------------------------------------------------------------------ */
  /*                             Animated Values                              */
  /* ------------------------------------------------------------------------ */

  const glowScale = breathing.interpolate({
    inputRange: [0, 1],

    outputRange: [0.97, 1.05],
  });

  const glowOpacity = breathing.interpolate({
    inputRange: [0, 1],

    outputRange: [0.5, 0.86],
  });

  const orbScale = breathing.interpolate({
    inputRange: [0, 1],

    outputRange: [1, 1.02],
  });

  return (
    <View
      style={[
        styles.wrapper,

        {
          width: size,
          height: size,
        },

        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Ambient orange glow                                                */}
      {/* ------------------------------------------------------------------ */}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerGlow,

          {
            opacity: glowOpacity,

            transform: [
              {
                scale: glowScale,
              },
            ],
          },
        ]}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Main orb                                                           */}
      {/* ------------------------------------------------------------------ */}

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,

          {
            transform: [
              {
                scale: orbScale,
              },
            ],
          },
        ]}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        >
          <Defs>
            {/* ---------------------------------------------------------- */}
            {/* Center glow                                                */}
            {/* ---------------------------------------------------------- */}

            <RadialGradient
              id="ambientGlow"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.primary}
                stopOpacity={0.2}
              />

              <Stop
                offset="35%"
                stopColor={COLORS.primary}
                stopOpacity={0.14}
              />

              <Stop
                offset="65%"
                stopColor={COLORS.bright}
                stopOpacity={0.07}
              />

              <Stop
                offset="100%"
                stopColor={COLORS.primary}
                stopOpacity={0}
              />
            </RadialGradient>

            {/* ---------------------------------------------------------- */}
            {/* Orb perimeter                                              */}
            {/* ---------------------------------------------------------- */}

            <LinearGradient
              id="orbEdge"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop
                offset="0%"
                stopColor={COLORS.deep}
                stopOpacity={0.9}
              />

              <Stop
                offset="25%"
                stopColor={COLORS.strong}
                stopOpacity={0.94}
              />

              <Stop
                offset="50%"
                stopColor={COLORS.primary}
                stopOpacity={1}
              />

              <Stop
                offset="75%"
                stopColor={COLORS.light}
                stopOpacity={0.92}
              />

              <Stop
                offset="100%"
                stopColor={COLORS.primary}
                stopOpacity={0.96}
              />
            </LinearGradient>
          </Defs>

          {/* Soft center illumination */}

          <Ellipse
            cx={CENTER}
            cy={CENTER}
            rx={AMBIENT_RADIUS}
            ry={AMBIENT_RADIUS}
            fill="url(#ambientGlow)"
          />

          {/* Stronger perimeter */}

          <Ellipse
            cx={CENTER}
            cy={CENTER}
            rx={ORB_RADIUS}
            ry={ORB_RADIUS}
            fill="none"
            stroke="url(#orbEdge)"
            strokeWidth={4}
            opacity={0.92}
          />
        </Svg>
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Independent ribbons                                                */}
      {/* ------------------------------------------------------------------ */}

      {RIBBONS.map((ribbon) => (
        <AnimatedRibbon
          key={ribbon.key}
          ribbon={ribbon}
          animated={animated}
        />
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Foreground highlight                                               */}
      {/* ------------------------------------------------------------------ */}

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
              stopColor={COLORS.primary}
              stopOpacity={0}
            />

            <Stop
              offset="25%"
              stopColor={COLORS.primary}
              stopOpacity={0.38}
            />

            <Stop
              offset="52%"
              stopColor={COLORS.soft}
              stopOpacity={1}
            />

            <Stop
              offset="72%"
              stopColor={COLORS.primary}
              stopOpacity={0.74}
            />

            <Stop
              offset="100%"
              stopColor={COLORS.deep}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>

        <Path
          d="
            M92 260
            C142 235 205 245 253 218
            C299 192 313 150 324 118
          "
          fill="none"
          stroke="url(#frontHighlight)"
          strokeWidth={5}
          strokeLinecap="round"
          opacity={1}
        />
      </Svg>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",

    alignItems: "center",

    justifyContent: "center",

    overflow: "visible",

    backgroundColor: "transparent",
  },

  outerGlow: {
    position: "absolute",

    width: "72%",

    height: "72%",

    borderRadius: 9999,

    /**
     * Same #FF641A orange with transparency.
     */
    backgroundColor: "rgba(255, 100, 26, 0.12)",

    shadowColor: "#FF641A",

    shadowOffset: {
      width: 0,
      height: 0,
    },

    shadowOpacity: 0.42,

    shadowRadius: 38,

    elevation: 5,
  },
});