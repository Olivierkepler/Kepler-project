import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";

export type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
  };
};

/**
 * Requires a valid Firebase ID token in:
 * Authorization: Bearer <token>
 *
 * Establishes identity only. Project ownership is enforced in routes.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("Authorization");

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const authenticated = req as AuthenticatedRequest;

    authenticated.user = {
      uid: decoded.uid,
      ...(decoded.email ? { email: decoded.email } : {}),
    };

    next();
  } catch (error) {
    console.error("Firebase ID token verification failed");
    res.status(401).json({ error: "Unauthorized" });
  }
}
