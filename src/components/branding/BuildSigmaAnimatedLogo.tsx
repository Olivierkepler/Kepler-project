import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";

import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import {
  colors,
} from "../../theme/colors";

const AnimatedPath =
  Animated.createAnimatedComponent(Path);

const PATH_LENGTH = 700;

const SIGMA_D =
  "M 235 70 L 90 70 L 175 170 L 90 270 L 235 270";

type Piece = {
  key: string;
  size: number;
  top: number;
  left: number;
  color: string;
  fromX: number;
  fromY: number;
  fromRotate: string;
};

const PIECES: Piece[] = [
  {
    key: "p1",
    size: 64,
    top: 70,
    left: 250,
    color: "#1AB6E8",
    fromX: 180,
    fromY: -160,
    fromRotate: "35deg",
  },
  {
    key: "p2",
    size: 58,
    top: 150,
    left: 236,
    color: "#1976F0",
    fromX: 220,
    fromY: 10,
    fromRotate: "-25deg",
  },
  {
    key: "p3",
    size: 46,
    top: 220,
    left: 270,
    color: "#1552E0",
    fromX: 150,
    fromY: 190,
    fromRotate: "40deg",
  },
  {
    key: "p4",
    size: 64,
    top: 238,
    left: 196,
    color: "#0B1A6B",
    fromX: -40,
    fromY: 210,
    fromRotate: "-30deg",
  },
];

const SETTLE_EASING = Easing.bezier(
  0.16,
  1,
  0.3,
  1,
);

const DRAW_EASING = Easing.bezier(
  0.65,
  0,
  0.35,
  1,
);

type Props = {
  size?: number;

  showWordmark?: boolean;
  showTagline?: boolean;

  tagline?: string;

  /**
   * If false, render the completed logo immediately.
   * Useful for places where motion would be distracting.
   */
  animated?: boolean;

  /**
   * Auto-start the animation when mounted.
   */
  autoPlay?: boolean;

  onFinished?: () => void;

  style?: StyleProp<ViewStyle>;

  accessibilityLabel?: string;
};

export default function BuildSigmaAnimatedLogo({
  size = 72,
  showWordmark = true,
  showTagline = true,
  tagline = "FIELD INTELLIGENCE",
  animated = true,
  autoPlay = true,
  onFinished,
  style,
  accessibilityLabel = "BuildSigma",
}: Props) {
  const pieceAnims = useRef(
    PIECES.map(
      () =>
        new Animated.Value(
          animated ? 0 : 1,
        ),
    ),
  ).current;

  const drawAnim = useRef(
    new Animated.Value(
      animated ? 0 : 1,
    ),
  ).current;

  const wordmarkAnim = useRef(
    new Animated.Value(
      animated ? 0 : 1,
    ),
  ).current;

  const play = useCallback(() => {
    if (!animated) {
      return;
    }

    pieceAnims.forEach((value) => {
      value.stopAnimation();
      value.setValue(0);
    });

    drawAnim.stopAnimation();
    drawAnim.setValue(0);

    wordmarkAnim.stopAnimation();
    wordmarkAnim.setValue(0);

    const pieceAnimations =
      pieceAnims.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 900,
          easing: SETTLE_EASING,
          useNativeDriver: true,
        }),
      );

    Animated.stagger(
      110,
      pieceAnimations,
    ).start();

    Animated.sequence([
      Animated.delay(260),

      Animated.timing(drawAnim, {
        toValue: 1,
        duration: 900,
        easing: DRAW_EASING,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(1500),

      Animated.timing(
        wordmarkAnim,
        {
          toValue: 1,
          duration: 560,
          easing:
            Easing.out(
              Easing.quad,
            ),
          useNativeDriver: true,
        },
      ),
    ]).start(() => {
      onFinished?.();
    });
  }, [
    animated,
    drawAnim,
    onFinished,
    pieceAnims,
    wordmarkAnim,
  ]);

  useEffect(() => {
    if (!animated || !autoPlay) {
      return;
    }

    const timer = setTimeout(
      play,
      120,
    );

    return () => {
      clearTimeout(timer);

      pieceAnims.forEach(
        (value) =>
          value.stopAnimation(),
      );

      drawAnim.stopAnimation();
      wordmarkAnim.stopAnimation();
    };
  }, [
    animated,
    autoPlay,
    drawAnim,
    pieceAnims,
    play,
    wordmarkAnim,
  ]);

  const markScale = size / 340;

  const markSize = 340 * markScale;

  const strokeDashoffset =
    drawAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [
        PATH_LENGTH,
        0,
      ],
    });

  const pathOpacity =
    drawAnim.interpolate({
      inputRange: [
        0,
        0.05,
        1,
      ],
      outputRange: [
        0,
        1,
        1,
      ],
    });

  const wordmarkTranslateY =
    wordmarkAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [8, 0],
    });

  const wordmarkFontSize =
    Math.max(
      18,
      size * 0.42,
    );

  const taglineFontSize =
    Math.max(
      9,
      size * 0.13,
    );

  return (
    <View
      style={[
        styles.root,
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel
      }
    >
      <View
        style={{
          width: markSize,
          height: markSize,
        }}
      >
        <Svg
          width={markSize}
          height={markSize}
          viewBox="0 0 340 340"
          style={
            StyleSheet.absoluteFill
          }
        >
          <Defs>
            <LinearGradient
              id="buildSigmaGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop
                offset="0%"
                stopColor="#0B1A6B"
              />

              <Stop
                offset="100%"
                stopColor="#1E8FE0"
              />
            </LinearGradient>
          </Defs>

          <AnimatedPath
            d={SIGMA_D}
            fill="none"
            stroke="url(#buildSigmaGradient)"
            strokeWidth={34}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[
              PATH_LENGTH,
              PATH_LENGTH,
            ]}
            strokeDashoffset={
              strokeDashoffset
            }
            opacity={pathOpacity}
          />
        </Svg>

        {PIECES.map(
          (piece, index) => {
            const anim =
              pieceAnims[index];

            const translateX =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  piece.fromX *
                    markScale,
                  0,
                ],
              });

            const translateY =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  piece.fromY *
                    markScale,
                  0,
                ],
              });

            const scale =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  0.4,
                  1,
                ],
              });

            const rotate =
              anim.interpolate({
                inputRange: [
                  0,
                  1,
                ],
                outputRange: [
                  piece.fromRotate,
                  "0deg",
                ],
              });

            return (
              <Animated.View
                key={piece.key}
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
                      10 *
                      markScale,

                    backgroundColor:
                      piece.color,

                    opacity: anim,

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
              />
            );
          },
        )}
      </View>

      {showWordmark ? (
        <Animated.View
          style={[
            styles.wordmark,
            {
              opacity:
                wordmarkAnim,

              transform: [
                {
                  translateY:
                    wordmarkTranslateY,
                },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.name,
              {
                fontSize:
                  wordmarkFontSize,
              },
            ]}
          >
            Build
            <Text
              style={
                styles.accent
              }
            >
              Sigma
            </Text>
          </Text>

          {showTagline ? (
            <Text
              style={[
                styles.tagline,
                {
                  fontSize:
                    taglineFontSize,
                },
              ]}
            >
              {tagline}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "flex-start",
  },

  piece: {
    position: "absolute",
  },

  wordmark: {
    marginTop: 2,
    alignItems: "flex-start",
  },

  name: {
    color: colors.brand.navy,

    fontFamily: "Poppins_500Medium",

    letterSpacing: -0.25,
  },

  accent: {
    color: colors.brand.blue,
  },

  tagline: {
    marginTop: 4,

    color: colors.text.primary,

    fontFamily: "Poppins_500Medium",

    letterSpacing: 1.4,
  },
});