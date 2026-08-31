import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";

/**
 * Load KEY=VALUE pairs from backend/.env into process.env when unset.
 * Does not override already-set environment variables (Cloud Run / shell win).
 */
function loadOptionalBackendEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local convenience only.
  }
}

loadOptionalBackendEnvFile();

/**
 * Firebase Admin initialization (Phase 2O hardening).
 * Requires explicit GOOGLE_CLOUD_PROJECT — no silent hard-coded project fallback.
 */
const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
if (!projectId) {
  throw new Error(
    "GOOGLE_CLOUD_PROJECT is required. Set it in the environment or backend/.env.",
  );
}

const storageBucket =
  process.env.EVIDENCE_STORAGE_BUCKET?.trim() || undefined;

/**
 * Initializes Firebase Admin once using Application Default Credentials
 * (local ADC or Cloud Run service identity). No service-account JSON is loaded.
 */
if (getApps().length === 0) {
  initializeApp({
    projectId,
    ...(storageBucket ? { storageBucket } : {}),
  });
}
