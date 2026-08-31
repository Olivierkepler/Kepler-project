/**
 * B1 branding motion decision self-check.
 * Run: npx tsx src/components/branding/brandGeometry.selftest.ts
 */

import {
  isLoaderMode,
  isRevealMode,
  resolveBrandMotionMode,
} from "./brandGeometry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  resolveBrandMotionMode({ requested: "reveal", reduceMotion: false }) ===
    "reveal",
  "1. reveal mode requested without reduce-motion stays reveal",
);

assert(
  resolveBrandMotionMode({ requested: "reveal", reduceMotion: true }) ===
    "static",
  "1b/3. reduced motion forces static (reveal plays as static finish)",
);

assert(
  resolveBrandMotionMode({ requested: "loader", reduceMotion: false }) ===
    "loader",
  "2. loader mode is distinct from reveal",
);

assert(
  resolveBrandMotionMode({ requested: "loader", reduceMotion: true }) ===
    "static",
  "3. reduced motion loader becomes static / non-looping",
);

assert(isRevealMode("reveal") && !isRevealMode("loader"), "reveal ≠ loader");
assert(isLoaderMode("loader") && !isLoaderMode("reveal"), "loader ≠ reveal");

assert(
  resolveBrandMotionMode({ requested: "static", reduceMotion: false }) ===
    "static",
  "static remains static",
);

// Branding decision has no domain parameters — only motion flags.
assert(
  resolveBrandMotionMode.length === 1,
  "4. branding motion decision does not take Project/PlanItem/Measurement/Delta/Evidence/AgentRun",
);

console.log("brandGeometry.selftest: PASS");
