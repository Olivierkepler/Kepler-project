/**
 * Canonical BuildSigma mobile typography.
 *
 * Use semantic tokens (display, title, body, …) — not ad-hoc fontSize/weight.
 * Explicit Poppins faces only; do not pair these families with conflicting fontWeight.
 *
 * Fonts must be loaded at app start (see App.tsx):
 * Poppins_400Regular, Poppins_500Medium
 */

export const typography = {
  display: {
    fontFamily: "Poppins_400Regular",
    fontSize: 31,
    lineHeight: 36,
    letterSpacing: -0.9,
  },

  title: {
    fontFamily: "Poppins_500Medium",
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.55,
  },

  sectionTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.35,
  },

  bodyLarge: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: -0.2,
  },

  body: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.12,
  },

  bodyMedium: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.12,
  },

  caption: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.05,
  },

  metadata: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0,
  },

  button: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
} as const;

export type Typography = typeof typography;
export type TypographyVariant = keyof typeof typography;
