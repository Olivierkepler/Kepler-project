import React from "react";

import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

type Props = {
  children?: React.ReactNode;

  style?: StyleProp<ViewStyle>;

  intensity?: number;
};

export default function BuildSigmaFoldBackground({
  children,
  style,
  intensity = 1,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 900 1700"
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient
            id="topFold"
            x1="0%"
            y1="0%"
            x2="70%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={0.98 * intensity}
            />

            <Stop
              offset="58%"
              stopColor="#FAFAFA"
              stopOpacity={0.96 * intensity}
            />

            <Stop
              offset="100%"
              stopColor="#E9EAEC"
              stopOpacity={0.76 * intensity}
            />
          </LinearGradient>

          <LinearGradient
            id="centerPlane"
            x1="15%"
            y1="10%"
            x2="90%"
            y2="92%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={1}
            />

            <Stop
              offset="60%"
              stopColor="#FDFDFD"
              stopOpacity={1}
            />

            <Stop
              offset="100%"
              stopColor="#F5F6F7"
              stopOpacity={0.98 * intensity}
            />
          </LinearGradient>

          <LinearGradient
            id="leftFold"
            x1="100%"
            y1="0%"
            x2="0%"
            y2="70%"
          >
            <Stop
              offset="0%"
              stopColor="#F8F8F9"
              stopOpacity={0.95 * intensity}
            />

            <Stop
              offset="55%"
              stopColor="#EEEEF0"
              stopOpacity={0.78 * intensity}
            />

            <Stop
              offset="100%"
              stopColor="#E3E5E8"
              stopOpacity={0.62 * intensity}
            />
          </LinearGradient>

          <LinearGradient
            id="bottomFold"
            x1="8%"
            y1="0%"
            x2="82%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={1}
            />

            <Stop
              offset="68%"
              stopColor="#FAFAFB"
              stopOpacity={0.98 * intensity}
            />

            <Stop
              offset="100%"
              stopColor="#E7E9EC"
              stopOpacity={0.76 * intensity}
            />
          </LinearGradient>

          <LinearGradient
            id="rightFold"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <Stop
              offset="0%"
              stopColor="#FFFFFF"
              stopOpacity={1}
            />

            <Stop
              offset="100%"
              stopColor="#F2F3F4"
              stopOpacity={0.78 * intensity}
            />
          </LinearGradient>

          <LinearGradient
            id="edgeShadow"
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            <Stop
              offset="0%"
              stopColor="#E3E5E8"
              stopOpacity={0.68 * intensity}
            />

            <Stop
              offset="100%"
              stopColor="#FFFFFF"
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>

        <Rect
          x="0"
          y="0"
          width="900"
          height="1700"
          fill="#FFFFFF"
        />

        <Path
          d="
            M 0 0
            L 900 0
            L 900 308
            L 676 423
            L 0 147
            Z
          "
          fill="url(#topFold)"
        />

        <Path
          d="
            M 0 147
            L 676 423
            L 900 310
            L 900 1186
            L 100 1700
            L 0 1700
            Z
          "
          fill="url(#centerPlane)"
        />

        <Path
          d="
            M 0 147
            L 676 423
            L 655 438
            L 0 184
            Z
          "
          fill="#D9DCE0"
          opacity={0.12 * intensity}
        />

        <Path
          d="
            M 0 520
            L 294 611
            L 0 772
            Z
          "
          fill="url(#leftFold)"
        />

        <Path
          d="
            M 0 520
            L 55 538
            L 0 564
            Z
          "
          fill="url(#edgeShadow)"
        />

        <Path
          d="
            M 0 760
            L 0 1700
            L 100 1700
            L 900 1185
            L 900 1118
            Z
          "
          fill="url(#bottomFold)"
        />

        <Path
          d="
            M 95 1700
            L 900 1185
            L 900 1212
            L 135 1700
            Z
          "
          fill="#D7DADF"
          opacity={0.11 * intensity}
        />

        <Path
          d="
            M 676 423
            L 900 307
            L 900 1118
            L 862 1142
            Z
          "
          fill="url(#rightFold)"
          opacity={0.72 * intensity}
        />

        <Path
          d="
            M 676 423
            L 900 307
            L 900 324
            L 689 434
            Z
          "
          fill="#FFFFFF"
          opacity={0.75}
        />
      </Svg>

      {children ? (
        <View style={styles.content}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  content: {
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
});