import type { NextFunction, Request, Response } from "express";

import {
  isWebOriginAllowed,
  readWebAllowedOriginsFromEnv,
} from "../config/webOrigins.js";

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Authorization,Content-Type";

/**
 * Browser CORS for Kepler Web (Phase 2C).
 *
 * - Exact-origin allowlist from WEB_ALLOWED_ORIGINS
 * - No credentials (Firebase Bearer tokens, not cookies)
 * - No Origin header → pass through (React Native / curl / internal)
 * - OPTIONS preflight answered here so it never hits requireAuth
 * - Disallowed origins get no permissive CORS headers
 */
export function keplerWebCors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const allowedOrigins = readWebAllowedOriginsFromEnv();
  const originHeader = req.header("Origin");
  const origin =
    typeof originHeader === "string" && originHeader.trim()
      ? originHeader.trim()
      : undefined;

  if (origin && isWebOriginAllowed(origin, allowedOrigins)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    // credentials intentionally omitted / false — Bearer tokens only
  }

  if (req.method === "OPTIONS") {
    if (origin && !isWebOriginAllowed(origin, allowedOrigins)) {
      res.status(204).end();
      return;
    }

    if (origin && isWebOriginAllowed(origin, allowedOrigins)) {
      res.setHeader("Access-Control-Max-Age", "86400");
      res.status(204).end();
      return;
    }

    // No Origin on OPTIONS — not a browser preflight; continue normally.
    next();
    return;
  }

  next();
}
