import React, { useEffect, useMemo } from "react";

import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Stop,
} from "react-native-svg";

import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import KeplerWordmark from "./KeplerWordmark";

const AnimatedPolygon =
  Animated.createAnimatedComponent(Polygon);

const AnimatedG =
  Animated.createAnimatedComponent(G);

type KeplerAnimatedLogoProps = {
  width?: number;
  height?: number;

  orange?: string;

  wordmarkColor?: string;
  taglineColor?: string;

  autoPlay?: boolean;
  showTagline?: boolean;

  style?: StyleProp<ViewStyle>;
};

const COLORS = {
  graphiteLight: "#59616D",
  graphiteMid: "#353D49",
  graphiteDark: "#171D26",

  silverLight: "#FFFFFF",
  silverMid: "#E8EBEF",
  silverDark: "#747D89",

  bankBlue: "#012169",
  bankBlueLight: "#123D83",
  bankBlueDark: "#001A52",

  bankRed: "#E31837",
  bankRedLight: "#F0445C",
  bankRedDark: "#B5122C",

  lowerArm: "#1F2927",
  lowerArmHighlight: "#46514E",
  lowerArmShadow: "#131A19",

  edgeLight: "#8993A0",
  edgeDark: "#151B23",

  tagline: "#64748B",
  wordmark: "#0A2540",
} as const;

const SPRING_STRUCTURE = {
  damping: 15,
  stiffness: 130,
} as const;

const SPRING_ACCENT = {
  damping: 13,
  stiffness: 150,
} as const;

const EASE_OUT =
  Easing.out(Easing.cubic);

export default function KeplerAnimatedLogo({
  width = 640,
  height = 260,

  orange = COLORS.bankRed,

  wordmarkColor = COLORS.wordmark,
  taglineColor = COLORS.tagline,

  autoPlay = true,
  showTagline = true,

  style,
}: KeplerAnimatedLogoProps) {
  /* -------------------------------------------------------------------------- */
  /* Layout                                                                     */
  /* -------------------------------------------------------------------------- */

  const dimensions = useMemo(() => {
    const emblemWidth =
      width * 0.34;

    /**
     * Reduced from 0.025.
     *
     * This pulls KEPLER / BUILD SMARTER
     * closer to the emblem while keeping
     * the spacing proportional.
     */
    const gap =
      width * 0.012;

    const brandWidth =
      width -
      emblemWidth -
      gap;

    const wordmarkWidth =
      brandWidth;

    const wordmarkHeight =
      Math.min(
        height * 0.34,
        height * 0.38,
      );

    /**
     * KeplerWordmark viewBox places the K stem at x=20 and the R tip at x=1040
     * of 1060. Match BUILD SMARTER to that same left/right axis.
     */
    const descriptorInset =
      wordmarkWidth *
      (20 / 1060);

    const descriptorFontSize =
      Math.max(
        6,
        width * 0.0125,
      );

    const descriptorLineHeight =
      descriptorFontSize *
      1.25;

    const descriptorMarginTop =
      Math.max(
        0,
        width * 0.0015625,
      );

    return {
      emblemWidth,
      brandWidth,
      gap,
      wordmarkWidth,
      wordmarkHeight,
      descriptorInset,
      descriptorFontSize,
      descriptorLineHeight,
      descriptorMarginTop,
    };
  }, [width, height]);

  /* -------------------------------------------------------------------------- */
  /* Main container                                                             */
  /* -------------------------------------------------------------------------- */

  const logoOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  const logoScale =
    useSharedValue(
      autoPlay ? 0.97 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* Tower                                                                      */
  /* -------------------------------------------------------------------------- */

  const towerY =
    useSharedValue(
      autoPlay ? 52 : 0,
    );

  const towerOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* Building bars                                                              */
  /* -------------------------------------------------------------------------- */

  const bar1Y =
    useSharedValue(
      autoPlay ? 68 : 0,
    );

  const bar2Y =
    useSharedValue(
      autoPlay ? 68 : 0,
    );

  const bar3Y =
    useSharedValue(
      autoPlay ? 68 : 0,
    );

  const bar1Opacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  const bar2Opacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  const bar3Opacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* Red center core                                                            */
  /* -------------------------------------------------------------------------- */

  const orangeY =
    useSharedValue(
      autoPlay ? 78 : 0,
    );

  const orangeOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* K arms                                                                     */
  /* -------------------------------------------------------------------------- */

  const upperArmX =
    useSharedValue(
      autoPlay ? -56 : 0,
    );

  const upperArmOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  const lowerArmX =
    useSharedValue(
      autoPlay ? -56 : 0,
    );

  const lowerArmOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* Brand                                                                      */
  /* -------------------------------------------------------------------------- */

  const wordmarkX =
    useSharedValue(
      autoPlay ? 28 : 0,
    );

  const wordmarkOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  const taglineX =
    useSharedValue(
      autoPlay ? 22 : 0,
    );

  const taglineOpacity =
    useSharedValue(
      autoPlay ? 0 : 1,
    );

  /* -------------------------------------------------------------------------- */
  /* Animation                                                                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!autoPlay) {
      logoOpacity.value = 1;
      logoScale.value = 1;

      towerY.value = 0;
      towerOpacity.value = 1;

      bar1Y.value = 0;
      bar2Y.value = 0;
      bar3Y.value = 0;

      bar1Opacity.value = 1;
      bar2Opacity.value = 1;
      bar3Opacity.value = 1;

      orangeY.value = 0;
      orangeOpacity.value = 1;

      upperArmX.value = 0;
      upperArmOpacity.value = 1;

      lowerArmX.value = 0;
      lowerArmOpacity.value = 1;

      wordmarkX.value = 0;
      wordmarkOpacity.value = 1;

      taglineX.value = 0;
      taglineOpacity.value = 1;

      return;
    }

    /* Reset */

    logoOpacity.value = 0;
    logoScale.value = 0.97;

    towerY.value = 52;
    towerOpacity.value = 0;

    bar1Y.value = 68;
    bar2Y.value = 68;
    bar3Y.value = 68;

    bar1Opacity.value = 0;
    bar2Opacity.value = 0;
    bar3Opacity.value = 0;

    orangeY.value = 78;
    orangeOpacity.value = 0;

    upperArmX.value = -56;
    upperArmOpacity.value = 0;

    lowerArmX.value = -56;
    lowerArmOpacity.value = 0;

    wordmarkX.value = 28;
    wordmarkOpacity.value = 0;

    taglineX.value = 22;
    taglineOpacity.value = 0;

    /* Main reveal */

    logoOpacity.value =
      withTiming(1, {
        duration: 240,
        easing: EASE_OUT,
      });

    /* Tower */

    towerOpacity.value =
      withTiming(1, {
        duration: 260,
        easing: EASE_OUT,
      });

    towerY.value =
      withSpring(0, {
        damping: 15,
        stiffness: 120,
      });

    /* Bar 1 */

    bar1Opacity.value =
      withDelay(
        150,
        withTiming(1, {
          duration: 170,
          easing: EASE_OUT,
        }),
      );

    bar1Y.value =
      withDelay(
        150,
        withSpring(
          0,
          SPRING_STRUCTURE,
        ),
      );

    /* Bar 2 */

    bar2Opacity.value =
      withDelay(
        225,
        withTiming(1, {
          duration: 170,
          easing: EASE_OUT,
        }),
      );

    bar2Y.value =
      withDelay(
        225,
        withSpring(
          0,
          SPRING_STRUCTURE,
        ),
      );

    /* Bar 3 */

    bar3Opacity.value =
      withDelay(
        300,
        withTiming(1, {
          duration: 170,
          easing: EASE_OUT,
        }),
      );

    bar3Y.value =
      withDelay(
        300,
        withSpring(
          0,
          SPRING_STRUCTURE,
        ),
      );

    /* Red core */

    orangeOpacity.value =
      withDelay(
        390,
        withTiming(1, {
          duration: 220,
          easing: EASE_OUT,
        }),
      );

    orangeY.value =
      withDelay(
        390,
        withSpring(
          0,
          SPRING_ACCENT,
        ),
      );

    /* Upper arm */

    upperArmOpacity.value =
      withDelay(
        580,
        withTiming(1, {
          duration: 220,
          easing: EASE_OUT,
        }),
      );

    upperArmX.value =
      withDelay(
        580,
        withTiming(0, {
          duration: 420,
          easing: EASE_OUT,
        }),
      );

    /* Lower arm */

    lowerArmOpacity.value =
      withDelay(
        720,
        withTiming(1, {
          duration: 220,
          easing: EASE_OUT,
        }),
      );

    lowerArmX.value =
      withDelay(
        720,
        withTiming(0, {
          duration: 420,
          easing: EASE_OUT,
        }),
      );

    /* KEPLER */

    wordmarkOpacity.value =
      withDelay(
        920,
        withTiming(1, {
          duration: 440,
          easing: EASE_OUT,
        }),
      );

    wordmarkX.value =
      withDelay(
        920,
        withTiming(0, {
          duration: 440,
          easing: EASE_OUT,
        }),
      );

    /* BUILD SMARTER */

    taglineOpacity.value =
      withDelay(
        1120,
        withTiming(1, {
          duration: 440,
          easing: EASE_OUT,
        }),
      );

    taglineX.value =
      withDelay(
        1120,
        withTiming(0, {
          duration: 440,
          easing: EASE_OUT,
        }),
      );

    /* Final settle */

    logoScale.value =
      withDelay(
        1180,
        withSequence(
          withSpring(1.012, {
            damping: 12,
            stiffness: 150,
          }),

          withSpring(1, {
            damping: 16,
            stiffness: 120,
          }),
        ),
      );
  }, [
    autoPlay,

    logoOpacity,
    logoScale,

    towerY,
    towerOpacity,

    bar1Y,
    bar2Y,
    bar3Y,

    bar1Opacity,
    bar2Opacity,
    bar3Opacity,

    orangeY,
    orangeOpacity,

    upperArmX,
    upperArmOpacity,

    lowerArmX,
    lowerArmOpacity,

    wordmarkX,
    wordmarkOpacity,

    taglineX,
    taglineOpacity,
  ]);

  /* -------------------------------------------------------------------------- */
  /* Animated styles                                                            */
  /* -------------------------------------------------------------------------- */

  const containerStyle =
    useAnimatedStyle(() => ({
      opacity:
        logoOpacity.value,

      transform: [
        {
          scale:
            logoScale.value,
        },
      ],
    }));

  const wordmarkStyle =
    useAnimatedStyle(() => ({
      opacity:
        wordmarkOpacity.value,

      transform: [
        {
          translateX:
            wordmarkX.value,
        },
      ],
    }));

  const descriptorStyle =
    useAnimatedStyle(() => ({
      opacity:
        taglineOpacity.value,

      transform: [
        {
          translateX:
            taglineX.value,
        },
      ],
    }));

  /* -------------------------------------------------------------------------- */
  /* SVG animation                                                              */
  /* -------------------------------------------------------------------------- */

  const towerProps =
    useAnimatedProps(() => ({
      transform:
        `translate(0 ${towerY.value})`,

      opacity:
        towerOpacity.value,
    }));

  const bar1Props =
    useAnimatedProps(() => ({
      transform:
        `translate(0 ${bar1Y.value})`,

      opacity:
        bar1Opacity.value,
    }));

  const bar2Props =
    useAnimatedProps(() => ({
      transform:
        `translate(0 ${bar2Y.value})`,

      opacity:
        bar2Opacity.value,
    }));

  const bar3Props =
    useAnimatedProps(() => ({
      transform:
        `translate(0 ${bar3Y.value})`,

      opacity:
        bar3Opacity.value,
    }));

  const orangeProps =
    useAnimatedProps(() => ({
      transform:
        `translate(0 ${orangeY.value})`,

      opacity:
        orangeOpacity.value,
    }));

  const upperArmProps =
    useAnimatedProps(() => ({
      transform:
        `translate(${upperArmX.value} 0)`,

      opacity:
        upperArmOpacity.value,
    }));

  const lowerArmProps =
    useAnimatedProps(() => ({
      transform:
        `translate(${lowerArmX.value} 0)`,

      opacity:
        lowerArmOpacity.value,
    }));

  void taglineColor;

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <Animated.View
      style={[
        styles.root,

        {
          width,
          height,
        },

        style,

        containerStyle,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Kepler — Build Smarter"
    >
      {/* ====================================================================== */}
      {/* EMBLEM                                                                */}
      {/* ====================================================================== */}

      <View
        style={{
          width:
            dimensions.emblemWidth,

          height: "100%",

          justifyContent:
            "flex-end",
        }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox="70 25 450 455"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            {/* Main graphite */}

            <LinearGradient
              id="graphite"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop
                offset="0"
                stopColor={
                  COLORS.graphiteLight
                }
              />

              <Stop
                offset="0.45"
                stopColor={
                  COLORS.graphiteMid
                }
              />

              <Stop
                offset="1"
                stopColor={
                  COLORS.graphiteDark
                }
              />
            </LinearGradient>

            {/* Building blue */}

            <LinearGradient
              id="buildingBlue"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop
                offset="0"
                stopColor={
                  COLORS.bankBlueLight
                }
              />

              <Stop
                offset="0.42"
                stopColor={
                  COLORS.bankBlue
                }
              />

              <Stop
                offset="1"
                stopColor={
                  COLORS.bankBlueDark
                }
              />
            </LinearGradient>

            {/* Red center core */}

            <LinearGradient
              id="redCore"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop
                offset="0"
                stopColor={
                  COLORS.bankRedLight
                }
              />

              <Stop
                offset="0.42"
                stopColor={orange}
              />

              <Stop
                offset="1"
                stopColor={
                  COLORS.bankRedDark
                }
              />
            </LinearGradient>

            {/* Silver */}

            <LinearGradient
              id="silver"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop
                offset="0"
                stopColor={
                  COLORS.silverLight
                }
              />

              <Stop
                offset="0.28"
                stopColor={
                  COLORS.silverMid
                }
              />

              <Stop
                offset="1"
                stopColor={
                  COLORS.silverDark
                }
              />
            </LinearGradient>
          </Defs>

          {/* ================================================================== */}
          {/* LEFT TOWER                                                         */}
          {/* ================================================================== */}

          <AnimatedG
            animatedProps={
              towerProps
            }
          >
            <Polygon
              points="
                104,103
                190,47
                190,224
                166,244
                166,410
                104,410
              "
              fill="#012169"
            />

            <Path
              d="M106 103 L188 49"
              stroke={
                COLORS.edgeLight
              }
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.85}
            />

            <Path
              d="M188 49 L188 220"
              stroke={
                COLORS.edgeDark
              }
              strokeWidth={4}
              opacity={0.65}
            />
          </AnimatedG>

          {/* ================================================================== */}
          {/* BUILDING BARS                                                      */}
          {/* ================================================================== */}

          <AnimatedPolygon
            animatedProps={
              bar1Props
            }
            points="
              114,324
              130,310
              130,410
              114,410
            "
            fill="#FFFFFF"
          />

          <AnimatedPolygon
            animatedProps={
              bar2Props
            }
            points="
              140,299
              156,285
              156,410
              140,410
            "
            fill="#FFFFFF"
          />

          <AnimatedPolygon
            animatedProps={
              bar3Props
            }
            points="
              166,276
              181,264
              181,410
              166,410
            "
            fill="#FFFFFF"
          />

          {/* ================================================================== */}
          {/* UPPER SILVER K ARM                                                 */}
          {/* ================================================================== */}

          <AnimatedG
            animatedProps={
              upperArmProps
            }
          >
            <Polygon
              points="
                324,310
                416,213
                492,213
                324,384
              "
              fill="url(#silver)"
            />

            <Path
              d="M326 310 L417 215 L490 215"
              stroke="#FFFFFF"
              strokeWidth={3}
              strokeLinejoin="round"
              opacity={0.75}
            />

            <Path
              d="M325 382 L490 215"
              stroke="#555D68"
              strokeWidth={4}
              opacity={0.5}
            />
          </AnimatedG>

          {/* ================================================================== */}
          {/* LOWER K ARM                                                        */}
          {/* ================================================================== */}

          <AnimatedG
            animatedProps={
              lowerArmProps
            }
          >
            <Polygon
              points="
                340,382
                396,332
                505,475
                420,475
              "
              fill="#012169"
            />

            <Path
              d="M342 381 L396 335 L503 473"
              stroke={
                COLORS.lowerArmHighlight
              }
              strokeWidth={3}
              strokeLinejoin="round"
              opacity={0.72}
            />

            <Path
              d="M420 474 L503 474"
              stroke={
                COLORS.lowerArmShadow
              }
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.55}
            />
          </AnimatedG>

          {/* ================================================================== */}
          {/* RED CENTER CORE                                                    */}
          {/* ================================================================== */}

          <AnimatedG
            animatedProps={
              orangeProps
            }
          >
            <Polygon
              points="
                204,67
                259,111
                259,390
                204,390
              "
              fill="url(#redCore)"
            />

            <Path
              d="M204 67 L259 111"
              stroke="#FF6678"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.9}
            />

            <Path
              d="M205 70 L205 388"
              stroke="#F75A6D"
              strokeWidth={2}
              opacity={0.78}
            />

            <Path
              d="M258 112 L258 388"
              stroke="#941127"
              strokeWidth={3}
              opacity={0.52}
            />

            <Polygon
              points="
                204,300
                259,250
                259,336
                204,385
              "
              fill="#D61532"
              opacity={0.38}
            />

            <Polygon
              points="
                204,385
                259,336
                259,390
                204,390
              "
              fill="#B5122C"
              opacity={0.34}
            />
          </AnimatedG>
        </Svg>
      </View>

      {/* ====================================================================== */}
      {/* BRAND                                                                  */}
      {/* ====================================================================== */}

      <View
        style={[
          styles.brand,

          {
            width:
              dimensions.brandWidth,

            /**
             * Uses the new smaller responsive gap.
             */
            marginLeft:
              dimensions.gap,
          },
        ]}
      >
        <View
          style={
            styles.brandStack
          }
        >
          {/* ================================================================ */}
          {/* KEPLER                                                           */}
          {/* ================================================================ */}

          <Animated.View
            style={[
              styles.wordmarkContainer,

              wordmarkStyle,
            ]}
          >
            <KeplerWordmark
              width={
                dimensions.wordmarkWidth
              }
              height={
                dimensions.wordmarkHeight
              }
              color={
                wordmarkColor
              }
            />
          </Animated.View>

          {/* ================================================================ */}
          {/* BUILD SMARTER                                                    */}
          {/* ================================================================ */}

          {showTagline ? (
            <Animated.View
              style={[
                styles.descriptorContainer,
                {
                  paddingLeft:
                    dimensions.descriptorInset,
                  paddingRight:
                    dimensions.descriptorInset,
                  marginTop:
                    dimensions.descriptorMarginTop,
                },
                descriptorStyle,
              ]}
            >
              {"BUILD"
                .split("")
                .map((letter, index) => (
                  <Text
                    key={`build-${index}`}
                    style={[
                      styles.descriptorRed,
                      {
                        fontSize:
                          dimensions.descriptorFontSize,
                        lineHeight:
                          dimensions.descriptorLineHeight,
                      },
                    ]}
                  >
                    {letter}
                  </Text>
                ))}

              <View
                style={
                  styles.descriptorWordGap
                }
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />

              {"SMARTER"
                .split("")
                .map((letter, index) => (
                  <Text
                    key={`smarter-${index}`}
                    style={[
                      styles.descriptorBlue,
                      {
                        fontSize:
                          dimensions.descriptorFontSize,
                        lineHeight:
                          dimensions.descriptorLineHeight,
                      },
                    ]}
                  >
                    {letter}
                  </Text>
                ))}
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flexDirection: "row",

      alignItems: "flex-end",

      justifyContent:
        "flex-start",

      overflow: "visible",
    },

    brand: {
      height: "100%",

      justifyContent:
        "flex-end",

      alignItems:
        "flex-start",
    },

    brandStack: {
      width: "100%",

      justifyContent:
        "flex-end",

      alignItems:
        "flex-start",
    },

    wordmarkContainer: {
      width: "100%",

      justifyContent:
        "flex-end",

      alignItems:
        "flex-start",
    },

    descriptorContainer: {
      width: "100%",

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      flexWrap: "nowrap",
    },

    descriptorWordGap: {
      width: 0,
    },

    descriptorRed: {
      fontWeight: "700",

      color: "#E31837",

      flexShrink: 0,
    },

    descriptorBlue: {
      fontWeight: "700",

      color: "#012169",

      flexShrink: 0,
    },
  });