/**
 * Shared BuildSigma brand geometry and colors.
 * One source of truth for the Σ mark — no domain coupling.
 */

export const BRAND_COLORS = {
  navy: "#0A2540",
  blue: "#1D4ED8",
  cyan: "#22D3EE",
  midBlue: "#3B82F6",
  wordmark: "#E8EEF5",
  tagline: "#8C98A8",
} as const;

/** ViewBox units for the mark. */
export const MARK_VIEWBOX = 100;

/**
 * Σ stroke path centered in a 100×100 viewBox.
 * Approximate path length used for dash draw animations.
 */
export const SIGMA_PATH =
  "M 28 22 H 72 Q 78 22 78 28 V 32 Q 78 38 72 38 H 48 L 72 62 H 40 Q 34 62 34 68 V 72 Q 34 78 40 78 H 76";

export const SIGMA_PATH_LENGTH = 220;

export type AccentBlockDef = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Reveal start offset (viewBox units) before settle. */
  startX: number;
  startY: number;
};

export const ACCENT_BLOCKS: readonly AccentBlockDef[] = [
  {
    id: "tl",
    x: 12,
    y: 12,
    width: 14,
    height: 14,
    color: BRAND_COLORS.cyan,
    startX: -18,
    startY: -18,
  },
  {
    id: "tr",
    x: 74,
    y: 12,
    width: 14,
    height: 14,
    color: BRAND_COLORS.midBlue,
    startX: 18,
    startY: -18,
  },
  {
    id: "bl",
    x: 12,
    y: 74,
    width: 14,
    height: 14,
    color: BRAND_COLORS.blue,
    startX: -18,
    startY: 18,
  },
  {
    id: "br",
    x: 74,
    y: 74,
    width: 14,
    height: 14,
    color: BRAND_COLORS.navy,
    startX: 18,
    startY: 18,
  },
] as const;

export type BrandMotionMode = "static" | "reveal" | "loader";

/**
 * Pure motion decision: reduced motion forces static presentation.
 * Reveal and loader are distinct modes — loader never uses full reveal.
 */
export function resolveBrandMotionMode(args: {
  requested: BrandMotionMode;
  reduceMotion: boolean;
}): BrandMotionMode {
  if (args.reduceMotion) {
    return "static";
  }

  return args.requested;
}

export function isRevealMode(mode: BrandMotionMode): boolean {
  return mode === "reveal";
}

export function isLoaderMode(mode: BrandMotionMode): boolean {
  return mode === "loader";
}
