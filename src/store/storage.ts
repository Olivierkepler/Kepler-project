import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  measurements: "@buildsigma/measurements",
  deltas: "@buildsigma/deltas",
  projects: "@buildsigma/projects",
  planItems: "@buildsigma/planItems",
  projectCloudMappings: "@buildsigma/projectCloudMappings",
  planItemCloudMappings: "@buildsigma/planItemCloudMappings",
  measurementCloudMappings: "@buildsigma/measurementCloudMappings",
  deltaCloudMappings: "@buildsigma/deltaCloudMappings",
  deltaReviewSyncState: "@buildsigma/deltaReviewSyncState",
  measurementUploadSyncState: "@buildsigma/measurementUploadSyncState",
  deltaUploadSyncState: "@buildsigma/deltaUploadSyncState",
  projectUpdateSyncState: "@buildsigma/projectUpdateSyncState",
  planItemUpdateSyncState: "@buildsigma/planItemUpdateSyncState",
  evidence: "@buildsigma/evidence",
  evidenceCloudMappings: "@buildsigma/evidenceCloudMappings",
  evidenceUploadSyncState: "@buildsigma/evidenceUploadSyncState",
  evidenceDeleteSyncState: "@buildsigma/evidenceDeleteSyncState",
  savedFieldReports: "@buildsigma/savedFieldReports",
  /** Local-first project collaboration memberships (Phase 1A). */
  projectMembers: "@buildsigma/projectMembers",
  /** Local-first project collaboration invitations (Phase 1B). */
  projectInvitations: "@buildsigma/projectInvitations",
  /** Local-first work packages / construction scopes (Phase 2A). */
  workPackages: "@buildsigma/workPackages",
  /** Local WorkPackage id ↔ remote WorkPackage id (owner cloud publish). */
  workPackageCloudMappings: "@buildsigma/workPackageCloudMappings",
  /** Local-first work package ↔ member assignments (Phase 2B). */
  workPackageAssignments: "@buildsigma/workPackageAssignments",
  /** Local-first plan document imports (Phase 2P.1). */
  planImports: "@buildsigma/planImports",
  /** Device-level first-launch onboarding completion (not owner-scoped). */
  hasCompletedOnboarding: "@buildsigma/hasCompletedOnboarding",
} as const;

/**
 * Reads a JSON array from AsyncStorage.
 * Returns null when the key is missing (distinct from a stored empty array).
 */
export async function readJsonArrayIfPresent<T>(
  key: string,
): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);

    if (raw == null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as T[];
  } catch {
    return [];
  }
}

export async function readJsonArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);

    if (raw == null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as T[];
  } catch {
    return [];
  }
}

export async function writeJsonArray<T>(
  key: string,
  value: T[],
): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
