/**
 * Official BuildSigma mobile light design system.
 *
 * Light theme = white backgrounds + dark high-contrast text.
 * Readability in bright field conditions takes priority over pale grays.
 *
 * Semantic roles:
 * - brand blue/cyan → intelligence, navigation, interactive actions, AI/agent
 * - delta orange → plan-vs-reality variance / impact / attention
 * - success green → resolved / completed / healthy
 * - danger red → rejected / error / destructive
 * - navy → brand authority
 *
 * Typography: see ./typography.ts (canonical Poppins semantic tokens).
 */

export const colors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",

  brand: {
    navy: "#0B1550",
    blue: "#1E8FE0",
    cyan: "#20CFE3",
  },

  text: {
    primary: "#101828",
    secondary: "#475467",
    muted: "#667085",
  },

  // Keep temporarily for components still using borders.
  border: "#E4E7EC",

  /**
   * Very soft near-white elevation system.
   */
  shadow: {
    highlight: "#FFFFFF",
    soft: "#F1F3F5",
    medium: "#E9EDF2",
  },

  delta: "#F5A623",
  success: "#12B76A",
  danger: "#F04438",

  darkSurface: "#111827",
} as const;

export type Colors = typeof colors;

export {
  typography,
  type Typography,
  type TypographyVariant,
} from "./typography";
