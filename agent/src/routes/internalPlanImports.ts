import { Router, type Request, type Response } from "express";

import type { PlanDocumentIntelligenceRunner } from "../agent/planDocumentIntelligenceAgent.js";
import type { OidcVerifier } from "../auth/oidc.js";
import { processPlanImportExecution } from "../services/processPlanImport.js";

export type InternalPlanImportsRouterDeps = {
  verifyOidc: OidcVerifier;
  processExecution?: typeof processPlanImportExecution;
  runner?: PlanDocumentIntelligenceRunner;
  model?: string;
};

function readBodyImportId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.importId !== "string") {
    return undefined;
  }
  const trimmed = record.importId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function rejectUntrustedBodyFields(body: unknown, res: Response): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const banned = ["ownerUid", "projectId", "candidates", "status", "files"];
  for (const key of banned) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      res.status(400).json({ error: "untrusted_body_field", field: key });
      return true;
    }
  }
  return false;
}

/**
 * Private Cloud Tasks entrypoint.
 * POST /internal/plan-imports/:importId/process
 */
export function createInternalPlanImportsRouter(
  deps: InternalPlanImportsRouterDeps,
): Router {
  const router = Router();
  const processExecution =
    deps.processExecution ?? processPlanImportExecution;

  router.post(
    "/internal/plan-imports/:importId/process",
    async (req: Request, res: Response) => {
      const oidc = await deps.verifyOidc(
        req.header("authorization") ?? undefined,
      );
      if (!oidc.ok) {
        res.status(401).json({ error: "unauthorized", reason: oidc.reason });
        return;
      }

      const pathId =
        typeof req.params.importId === "string"
          ? req.params.importId.trim()
          : "";
      if (!pathId) {
        res.status(400).json({ error: "missing_import_id" });
        return;
      }

      const bodyId = readBodyImportId(req.body);
      if (bodyId !== undefined && bodyId !== pathId) {
        res.status(400).json({ error: "import_id_mismatch" });
        return;
      }

      if (rejectUntrustedBodyFields(req.body, res)) {
        return;
      }

      const result = await processExecution(pathId, {
        runner: deps.runner,
        model: deps.model,
      });

      if (result.outcome === "noop") {
        res.status(200).json({ status: "noop", reason: result.reason });
        return;
      }

      if (result.outcome === "failed") {
        res.status(200).json({
          status: "failed",
          importId: result.importId,
          errorCategory: result.errorCategory,
        });
        return;
      }

      res.status(200).json({
        status: "completed",
        importId: result.importId,
        candidateCount: result.candidateCount,
      });
    },
  );

  return router;
}
