import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

import {
  ACCENT_BLOCKS,
  BRAND_COLORS,
  MARK_VIEWBOX,
  SIGMA_PATH,
} from "./brandGeometry";

export type BuildSigmaMarkProps = {
  size?: number;
  /** Optional override for Σ stroke (default cyan-leaning brand blue). */
  strokeColor?: string;
  strokeWidth?: number;
  /** When false, accent blocks are omitted (rare; default true). */
  showAccents?: boolean;
  accessibilityLabel?: string;
  /** Parent lockups should set false to avoid double announcement. */
  accessible?: boolean;
};

/**
 * Shared static Σ geometry. One source of truth for all brand modes.
 */
export default function BuildSigmaMark({
  size = 72,
  strokeColor = BRAND_COLORS.cyan,
  strokeWidth = 6,
  showAccents = true,
  accessibilityLabel = "BuildSigma",
  accessible = true,
}: BuildSigmaMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      accessible={accessible}
      importantForAccessibility={accessible ? "yes" : "no-hide-descendants"}
    >
      {showAccents
        ? ACCENT_BLOCKS.map((block) => (
            <Rect
              key={block.id}
              x={block.x}
              y={block.y}
              width={block.width}
              height={block.height}
              rx={3}
              fill={block.color}
            />
          ))
        : null}
      <Path
        d={SIGMA_PATH}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
