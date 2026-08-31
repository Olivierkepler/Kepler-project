/**
 * Public API base URL for the BUILDSIGMA backend.
 * Set via Expo public env (safe for non-secret values only).
 *
 * Example:
 * EXPO_PUBLIC_API_URL=http://localhost:8080
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
