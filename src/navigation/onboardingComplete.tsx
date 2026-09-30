import React, { createContext, useContext } from "react";

export const OnboardingCompleteContext =
  createContext<(() => void) | null>(null);

export function useOnboardingComplete(): () => void {
  const complete = useContext(OnboardingCompleteContext);

  if (!complete) {
    throw new Error(
      "useOnboardingComplete must be used within OnboardingNavigator",
    );
  }

  return complete;
}
