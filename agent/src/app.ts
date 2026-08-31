import express from "express";
import {
  createOidcVerifierFromEnv,
  type OidcVerifier,
} from "./auth/oidc.js";
import type { AgentServiceEnv } from "./config/env.js";
import type { PlanDocumentIntelligenceRunner } from "./agent/planDocumentIntelligenceAgent.js";
import { createInternalAgentRunsRouter } from "./routes/internalAgentRuns.js";
import { createInternalPlanImportsRouter } from "./routes/internalPlanImports.js";
import type { processPlanImportExecution } from "./services/processPlanImport.js";
import type { resumeAgentRunExecution } from "./services/resumeAgentRun.js";
import type { startAgentRunExecution } from "./services/startAgentRun.js";

export type CreateAppDeps = {
  env: AgentServiceEnv;
  verifyOidc?: OidcVerifier;
  startExecution?: typeof startAgentRunExecution;
  resumeExecution?: typeof resumeAgentRunExecution;
  processPlanImport?: typeof processPlanImportExecution;
  planDocumentRunner?: PlanDocumentIntelligenceRunner;
};

export function createApp(deps: CreateAppDeps) {
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  const verifyOidc =
    deps.verifyOidc ??
    createOidcVerifierFromEnv({
      oidcMode: deps.env.oidcMode,
      expectedAudience: deps.env.agentServiceUrl,
      expectedServiceAccountEmail: deps.env.invokerServiceAccountEmail,
      localOidcSecret: deps.env.localOidcSecret,
    });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "buildsigma-agent" });
  });

  app.use(
    createInternalAgentRunsRouter({
      verifyOidc,
      startExecution: deps.startExecution,
      resumeExecution: deps.resumeExecution,
    }),
  );

  app.use(
    createInternalPlanImportsRouter({
      verifyOidc,
      processExecution: deps.processPlanImport,
      runner: deps.planDocumentRunner,
      model: deps.env.geminiModel,
    }),
  );

  return app;
}
