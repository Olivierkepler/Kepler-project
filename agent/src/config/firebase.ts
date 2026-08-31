import { getApps, initializeApp } from "firebase-admin/app";

/**
 * Firebase Admin initialization (Phase 2O hardening).
 * Requires explicit GOOGLE_CLOUD_PROJECT — no silent hard-coded project fallback.
 */
const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
if (!projectId) {
  throw new Error(
    "GOOGLE_CLOUD_PROJECT is required. Set it to the target Firebase/GCP project id.",
  );
}

/**
 * Initializes Firebase Admin once using Application Default Credentials
 * (local ADC or Cloud Run service identity). No service-account JSON is loaded.
 */
if (getApps().length === 0) {
  initializeApp({
    projectId,
  });
}
