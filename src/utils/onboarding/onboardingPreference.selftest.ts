/**
 * W1 onboarding decision self-check.
 * Run: npx tsx src/utils/onboarding/onboardingPreference.selftest.ts
 */

import {
  parseOnboardingCompletion,
  serializeOnboardingCompletion,
  shouldPresentOnboarding,
} from "./onboardingPreference";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// CASE A — incomplete → present onboarding
assert(
  shouldPresentOnboarding(false) === true,
  "CASE A: hasCompletedOnboarding=false → present onboarding",
);

// CASE B — complete → existing app flow
assert(
  shouldPresentOnboarding(true) === false,
  "CASE B: hasCompletedOnboarding=true → existing application",
);

// Decision is boolean-only (no domain coupling)
assert(
  shouldPresentOnboarding.length === 1,
  "CASE D: decision takes only completion flag",
);

assert(
  parseOnboardingCompletion(serializeOnboardingCompletion(true)) === true,
  "CASE C: successful completion serializes as persisted true",
);
assert(
  parseOnboardingCompletion(null) === false,
  "CASE C: missing value is incomplete",
);
assert(
  parseOnboardingCompletion("false") === false,
  "CASE C: explicit false is incomplete",
);

console.log("onboardingPreference.selftest: PASS");
