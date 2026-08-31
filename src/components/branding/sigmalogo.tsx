import React, {
    useEffect,
    useRef,
  } from "react";
  
  import {
    Animated,
    Easing,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
  } from "react-native";
  
  import Svg, {
    Path,
  } from "react-native-svg";
  
  /* -------------------------------------------------------------------------- */
  /*                                   Brand                                    */
  /* -------------------------------------------------------------------------- */
  
  const SIGMA_ORANGE = "#FF641A";
  
  const SIGMA_D =
    "M 235 70 L 90 70 L 175 170 L 90 270 L 235 270";
  
  /* -------------------------------------------------------------------------- */
  /*                              Accent Pieces                                 */
  /* -------------------------------------------------------------------------- */
  
  type Piece = {
    key: string;
  
    size: number;
  
    top: number;
    left: number;
  
    color: string;
  };
  
  const PIECES: Piece[] = [
    {
      key: "p1",
  
      size: 64,
  
      top: 70,
      left: 250,
  
      // Cyan
      color: "#20CFE3",
    },
  
    {
      key: "p2",
  
      size: 58,
  
      top: 150,
      left: 236,
  
      // Green
      color: "#22C55E",
    },
  
    {
      key: "p3",
  
      size: 46,
  
      top: 220,
      left: 270,
  
      // Pink / Red
      color: "#E11D48",
    },
  
    {
      key: "p4",
  
      size: 64,
  
      top: 238,
      left: 196,
  
      // Purple
      color: "#7C3AED",
    },
  ];
  
  /* -------------------------------------------------------------------------- */
  /*                              Floating Motion                               */
  /* -------------------------------------------------------------------------- */
  
  type FloatMotion = {
    duration: number;
  
    delay: number;
  
    translateYPeak: number;
  
    scalePeak: number;
  
    rotatePeak: number;
  };
  
  const FLOAT_MOTIONS: FloatMotion[] = [
    {
      duration: 1800,
  
      delay: 0,
  
      translateYPeak: -2.5,
  
      scalePeak: 1.035,
  
      rotatePeak: 1.5,
    },
  
    {
      duration: 2100,
  
      delay: 180,
  
      translateYPeak: -1.8,
  
      scalePeak: 1.025,
  
      rotatePeak: -1,
    },
  
    {
      duration: 1950,
  
      delay: 320,
  
      translateYPeak: -2.2,
  
      scalePeak: 1.04,
  
      rotatePeak: 1,
    },
  
    {
      duration: 2250,
  
      delay: 90,
  
      translateYPeak: -1.5,
  
      scalePeak: 1.03,
  
      rotatePeak: -1.5,
    },
  ];
  
  const FLOAT_EASING =
    Easing.inOut(
      Easing.sin,
    );
  
  /* -------------------------------------------------------------------------- */
  /*                                   Props                                    */
  /* -------------------------------------------------------------------------- */
  
  type Props = {
    /**
     * Final width / height
     * of the logo.
     */
    size?: number;
  
    /**
     * Enables or disables
     * the floating micro-animation.
     *
     * false = boxes stay still.
     */
    animated?: boolean;
  
    /**
     * Optional external style.
     */
    style?: StyleProp<ViewStyle>;
  
    /**
     * Accessibility-only label.
     *
     * No visible text is rendered.
     */
    accessibilityLabel?: string;
  };
  
  /* -------------------------------------------------------------------------- */
  /*                               Animated Logo                                */
  /* -------------------------------------------------------------------------- */
  
  export default function BuildSigmaAnimatedLogo({
    size = 72,
  
    animated = true,
  
    style,
  
    accessibilityLabel = "BuildSigma",
  }: Props) {
    /**
     * Each box gets its own
     * independent animation value.
     *
     * 0 = resting
     * 1 = floating peak
     */
    const floatAnims = useRef(
      PIECES.map(
        () =>
          new Animated.Value(0),
      ),
    ).current;
  
    /**
     * Keep references to active loops
     * so they can be stopped safely.
     */
    const runningAnimations =
      useRef<
        Animated.CompositeAnimation[]
      >([]);
  
    /**
     * Keep references to staggered
     * start timers.
     */
    const delayTimeouts =
      useRef<
        ReturnType<
          typeof setTimeout
        >[]
      >([]);
  
    /* ------------------------------------------------------------------------ */
    /*                         Continuous Box Animation                          */
    /* ------------------------------------------------------------------------ */
  
    useEffect(() => {
      /**
       * Stop anything left from a
       * previous render/configuration.
       */
      runningAnimations.current.forEach(
        (animation) => {
          animation.stop();
        },
      );
  
      runningAnimations.current =
        [];
  
      delayTimeouts.current.forEach(
        (timeout) => {
          clearTimeout(timeout);
        },
      );
  
      delayTimeouts.current =
        [];
  
      /**
       * Static mode.
       */
      if (!animated) {
        floatAnims.forEach(
          (value) => {
            value.stopAnimation();
  
            value.setValue(0);
          },
        );
  
        return;
      }
  
      /**
       * Give every colored box
       * an independent breathing loop.
       */
      FLOAT_MOTIONS.forEach(
        (motion, index) => {
          const value =
            floatAnims[index];
  
          const halfDuration =
            motion.duration / 2;
  
          /**
           * 0 → 1 → 0
           *
           * Smoothly rises,
           * gently peaks,
           * then returns home.
           */
          const loop =
            Animated.loop(
              Animated.sequence([
                Animated.timing(
                  value,
                  {
                    toValue: 1,
  
                    duration:
                      halfDuration,
  
                    easing:
                      FLOAT_EASING,
  
                    useNativeDriver:
                      true,
                  },
                ),
  
                Animated.timing(
                  value,
                  {
                    toValue: 0,
  
                    duration:
                      halfDuration,
  
                    easing:
                      FLOAT_EASING,
  
                    useNativeDriver:
                      true,
                  },
                ),
              ]),
              {
                iterations: -1,
              },
            );
  
          /**
           * Small independent start
           * delays prevent synchronized
           * movement.
           */
          const timeout =
            setTimeout(() => {
              loop.start();
  
              runningAnimations.current.push(
                loop,
              );
            }, motion.delay);
  
          delayTimeouts.current.push(
            timeout,
          );
        },
      );
  
      /**
       * Cleanup.
       */
      return () => {
        runningAnimations.current.forEach(
          (animation) => {
            animation.stop();
          },
        );
  
        runningAnimations.current =
          [];
  
        delayTimeouts.current.forEach(
          (timeout) => {
            clearTimeout(timeout);
          },
        );
  
        delayTimeouts.current =
          [];
  
        floatAnims.forEach(
          (value) => {
            value.stopAnimation();
          },
        );
      };
    }, [
      animated,
      floatAnims,
    ]);
  
    /* ------------------------------------------------------------------------ */
    /*                                   Scale                                  */
    /* ------------------------------------------------------------------------ */
  
    /**
     * Original BuildSigma geometry
     * uses a 340 × 340 coordinate system.
     */
    const markScale =
      size / 340;
  
    const markSize =
      340 * markScale;
  
    /* ------------------------------------------------------------------------ */
    /*                                    UI                                    */
    /* ------------------------------------------------------------------------ */
  
    return (
      <View
        style={[
          styles.root,
  
          {
            width: markSize,
            height: markSize,
          },
  
          style,
        ]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          accessibilityLabel
        }
      >
        {/* ---------------------------------------------------------------
            STATIC ORANGE SIGMA
  
            The Sigma does not move,
            disappear, scale or rotate.
        --------------------------------------------------------------- */}
  
        <Svg
          width={markSize}
          height={markSize}
          viewBox="0 0 340 340"
          style={
            StyleSheet.absoluteFill
          }
        >
          <Path
            d={SIGMA_D}
            fill="none"
            stroke={
              SIGMA_ORANGE
            }
            strokeWidth={34}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
  
        {/* ---------------------------------------------------------------
            FOUR SUBTLY ANIMATED BOXES
        --------------------------------------------------------------- */}
  
        {PIECES.map(
          (
            piece,
            index,
          ) => {
            const motion =
              FLOAT_MOTIONS[
                index
              ];
  
            const anim =
              floatAnims[
                index
              ];
  
            /**
             * Tiny vertical float.
             */
            const translateY =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
  
                outputRange: [
                  0,
  
                  motion.translateYPeak *
                    markScale,
                ],
              });
  
            /**
             * Tiny breathing scale.
             */
            const scale =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
  
                outputRange: [
                  1,
  
                  motion.scalePeak,
                ],
              });
  
            /**
             * Tiny organic rotation.
             */
            const rotate =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
  
                outputRange: [
                  "0deg",
  
                  `${motion.rotatePeak}deg`,
                ],
              });
  
            return (
              <Animated.View
                key={
                  piece.key
                }
                style={[
                  styles.piece,
  
                  {
                    width:
                      piece.size *
                      markScale,
  
                    height:
                      piece.size *
                      markScale,
  
                    top:
                      piece.top *
                      markScale,
  
                    left:
                      piece.left *
                      markScale,
  
                    borderRadius:
                      Math.max(
                        2,
  
                        10 *
                          markScale,
                      ),
  
                    backgroundColor:
                      piece.color,
  
                    /**
                     * Always fully visible.
                     *
                     * There is intentionally
                     * no opacity animation.
                     */
                    opacity: 1,
  
                    transform: [
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
              />
            );
          },
        )}
      </View>
    );
  }
  
  /* -------------------------------------------------------------------------- */
  /*                                   Styles                                   */
  /* -------------------------------------------------------------------------- */
  
  const styles =
    StyleSheet.create({
      root: {
        position:
          "relative",
  
        alignItems:
          "center",
  
        justifyContent:
          "center",
      },
  
      piece: {
        position:
          "absolute",
      },
    });