import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../../store/storage";

/**
 * Pure decision for first-launch onboarding.
 * Independent of Project / PlanItem / Measurement / Delta / Evidence / AgentRun.
 */
export function shouldPresentOnboarding(
  hasCompletedOnboarding: boolean,
): boolean {
  return hasCompletedOnboarding !== true;
}

export function serializeOnboardingCompletion(completed: boolean): string {
  return completed ? "true" : "false";
}

export function parseOnboardingCompletion(raw: string | null): boolean {
  return raw === "true";
}

export async function getHasCompletedOnboarding(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(
      STORAGE_KEYS.hasCompletedOnboarding,
    );

    return parseOnboardingCompletion(raw);
  } catch {
    return false;
  }
}

export async function setHasCompletedOnboarding(
  completed: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.hasCompletedOnboarding,
    serializeOnboardingCompletion(completed),
  );
}

/** Local test helper: clear the onboarding flag without touching domain stores. */
export async function resetOnboardingCompletion(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.hasCompletedOnboarding);
}
