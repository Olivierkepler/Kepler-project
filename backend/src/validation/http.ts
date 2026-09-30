import type { Request, Response } from "express";

import { ProjectAccessError } from "../auth/projectAccess.js";

export function sendError(
  res: Response,
  status: number,
  message: string,
  code?: string,
): void {
  if (code) {
    res.status(status).json({ error: message, code });
    return;
  }

  res.status(status).json({ error: message });
}

export async function handleRouteError(
  res: Response,
  error: unknown,
): Promise<void> {
  if (error instanceof ProjectAccessError) {
    sendError(res, error.statusCode, error.message);
    return;
  }

  console.error(error);
  sendError(res, 500, "Internal server error");
}

export function readBody(req: Request): unknown {
  return req.body as unknown;
}

export function requireUserUid(req: Request): string | null {
  const uid = (req as { user?: { uid?: string } }).user?.uid;
  return typeof uid === "string" && uid.length > 0 ? uid : null;
}

/**
 * Verified Firebase ID token email when present on the auth middleware user.
 * Never use client-supplied email for identity.
 */
export function requireUserEmail(req: Request): string | null {
  const email = (req as { user?: { email?: string } }).user?.email;
  return typeof email === "string" && email.trim().length > 0
    ? email.trim()
    : null;
}
