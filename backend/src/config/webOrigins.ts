/**
 * Parses WEB_ALLOWED_ORIGINS (comma-separated exact browser origins).
 * Trims whitespace and drops empty entries. No wildcards.
 */
export function parseWebAllowedOrigins(
  raw: string | undefined | null,
): ReadonlySet<string> {
  if (!raw) {
    return new Set();
  }

  const origins = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return new Set(origins);
}

export function readWebAllowedOriginsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  return parseWebAllowedOrigins(env.WEB_ALLOWED_ORIGINS);
}

export function isWebOriginAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) {
    return false;
  }

  return allowedOrigins.has(origin);
}
