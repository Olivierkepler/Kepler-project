import { Router, type Request, type Response } from "express";
import type { OidcVerifier } from "../auth/oidc.js";
import { parseKeplerConversationInput, parseKeplerConversationResponse, runKeplerConversationWithAdk, type KeplerConversationRunner } from "../agent/keplerConversationAgent.js";

export function createInternalKeplerRouter(deps: { verifyOidc: OidcVerifier; runner?: KeplerConversationRunner; model?: string }) {
  const router = Router();
  router.post("/internal/kepler/respond", async (req: Request, res: Response) => {
    const identity = await deps.verifyOidc(req.header("authorization") ?? undefined);
    if (!identity.ok) return res.status(401).json({ error: "unauthorized" });
    let input;
    try {
      input = parseKeplerConversationInput(req.body);
    } catch {
      return res.status(400).json({ error: "invalid_kepler_request" });
    }
    try {
      const runner = deps.runner ?? runKeplerConversationWithAdk;
      const response = parseKeplerConversationResponse(await runner(input, deps.model ?? ""));
      return res.status(200).json(response);
    } catch {
      return res.status(503).json({ error: "kepler_unavailable" });
    }
  });
  return router;
}
