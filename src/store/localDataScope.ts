import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  readJsonArrayIfPresent,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

/** Legacy unscoped operational keys (pre–Phase 44). */
export const LEGACY_OPERATIONAL_KEYS = {
  projects: STORAGE_KEYS.projects,
  planItems: STORAGE_KEYS.planItems,
  measurements: STORAGE_KEYS.measurements,
  deltas: STORAGE_KEYS.deltas,
} as const;

export const LOCAL_DATA_MIGRATION_OWNER_KEY =
  "@buildsigma/localDataMigrationOwner";

export type OperationalDomain =
  | "projects"
  | "planItems"
  | "measurements"
  | "deltas";

/**
 * Owner-scoped AsyncStorage key for operational domain data.
 * Domain types stay free of ownerUid; partitioning is storage-layer only.
 */
export function scopedOperationalKey(
  domain: OperationalDomain,
  ownerUid: string,
): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for local data scope.");
  }

  return `${LEGACY_OPERATIONAL_KEYS[domain]}/${ownerUid}`;
}

async function legacyOperationalDataExists(): Promise<boolean> {
  for (const key of Object.values(LEGACY_OPERATIONAL_KEYS)) {
    const value = await readJsonArrayIfPresent<unknown>(key);

    if (value !== null) {
      return true;
    }
  }

  return false;
}

/**
 * First namespace to encounter legacy operational data claims it.
 * Subsequent namespaces do not inherit that legacy dataset.
 */
export async function ensureLocalDataMigrationOwner(
  ownerUid: string,
): Promise<string | null> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for local data migration.");
  }

  const existing = await AsyncStorage.getItem(LOCAL_DATA_MIGRATION_OWNER_KEY);

  if (existing != null && existing.trim().length > 0) {
    return existing;
  }

  const hasLegacy = await legacyOperationalDataExists();

  if (!hasLegacy) {
    return null;
  }

  await AsyncStorage.setItem(LOCAL_DATA_MIGRATION_OWNER_KEY, ownerUid);
  return ownerUid;
}

/**
 * Resolve scoped operational array.
 * - scoped key present → use it (including empty [])
 * - scoped missing + this namespace is migration owner + legacy present → copy legacy
 * - otherwise → initialize with provided default and persist
 *
 * Legacy keys are never deleted.
 */
export async function resolveScopedOperationalArray<T>(
  domain: OperationalDomain,
  ownerUid: string,
  initialize: () => T[],
): Promise<T[]> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for local data scope.");
  }

  const scopedKey = scopedOperationalKey(domain, ownerUid);
  const scoped = await readJsonArrayIfPresent<T>(scopedKey);

  if (scoped !== null) {
    return scoped;
  }

  const migrationOwner = await ensureLocalDataMigrationOwner(ownerUid);
  const legacyKey = LEGACY_OPERATIONAL_KEYS[domain];
  const legacy = await readJsonArrayIfPresent<T>(legacyKey);

  if (migrationOwner === ownerUid && legacy !== null) {
    await writeJsonArray(scopedKey, legacy);
    return legacy;
  }

  const initial = initialize();
  await writeJsonArray(scopedKey, initial);
  return initial;
}
