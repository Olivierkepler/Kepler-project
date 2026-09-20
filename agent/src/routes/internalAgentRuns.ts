import { Router, type Request, type Response } from "express";
import type { OidcVerifier } from "../auth/oidc.js";
import { resumeAgentRunExecution } from "../services/resumeAgentRun.js";
import { startAgentRunExecution } from "../services/startAgentRun.js";

export type InternalAgentRunsRouterDeps = {
  verifyOidc: OidcVerifier;
  startExecution?: typeof startAgentRunExecution;
  resumeExecution?: typeof resumeAgentRunExecution;
};

function readBodyAgentRunId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.agentRunId !== "string") {
    return undefined;
  }
  const trimmed = record.agentRunId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBodyEvidenceId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.evidenceId !== "string") {
    return undefined;
  }
  const trimmed = record.evidenceId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function rejectUntrustedBodyFields(body: unknown, res: Response): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const banned = ["ownerUid", "projectId", "delta", "measurement", "evidence"];
  for (const key of banned) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      res.status(400).json({
        error: "untrusted_body_field",
        field: key,
      });
      return true;
    }
  }
  return false;
}

/**
 * Private Cloud Tasks entrypoints.
 * POST /internal/agent-runs/:agentRunId/start
 * POST /internal/agent-runs/:agentRunId/resume
 */
export function createInternalAgentRunsRouter(
  deps: InternalAgentRunsRouterDeps,
): Router {
  const router = Router();
  const startExecution = deps.startExecution ?? startAgentRunExecution;
  const resumeExecution = deps.resumeExecution ?? resumeAgentRunExecution;

  router.post(
    "/internal/agent-runs/:agentRunId/start",
    async (req: Request, res: Response) => {
      const oidc = await deps.verifyOidc(
        req.header("authorization") ?? undefined,
      );
      if (!oidc.ok) {
        res.status(401).json({ error: "unauthorized", reason: oidc.reason });
        return;
      }

      const pathId =
        typeof req.params.agentRunId === "string"
          ? req.params.agentRunId.trim()
          : "";
      if (!pathId) {
        res.status(400).json({ error: "missing_agent_run_id" });
        return;
      }

      const bodyId = readBodyAgentRunId(req.body);
      if (bodyId !== undefined && bodyId !== pathId) {
        res.status(400).json({
          error: "agent_run_id_mismatch",
          message: "path and body agentRunId must agree",
        });
        return;
      }

      if (rejectUntrustedBodyFields(req.body, res)) {
        return;
      }

      const result = await startExecution(pathId);

      if (result.kind === "noop") {
        res.status(200).json({
          status: "noop",
          reason: result.reason,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
        });
        return;
      }

      if (result.kind === "transient_retry") {
        res.status(503).json({
          status: "transient_retry",
          errorCategory: result.errorCategory,
          message: result.message,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
        });
        return;
      }

      if (result.kind === "failed") {
        const status =
          result.errorCategory === "agent_run_not_found" ? 404 : 200;
        res.status(status).json({
          status: "failed",
          errorCategory: result.errorCategory,
          message: result.message,
          agentRunId: result.agentRun?.id ?? pathId,
          agentRunStatus: result.agentRun?.status ?? null,
          currentStep: result.agentRun?.currentStep ?? null,
          attemptCount: result.agentRun?.attemptCount ?? null,
        });
        return;
      }

      if (result.kind === "policy_mismatch") {
        res.status(200).json({
          status: "policy_mismatch",
          mismatchReason: result.mismatchReason,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
        });
        return;
      }

      if (result.kind === "waiting_for_evidence") {
        res.status(200).json({
          status: "waiting_for_evidence",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          requestId: result.pendingRequest.requestId,
          requestOutcome: result.requestOutcome,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
        });
        return;
      }

      if (result.kind === "escalated") {
        res.status(200).json({
          status: "escalated",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
          outcomeKind: result.agentRun.outcome?.kind ?? null,
        });
        return;
      }

      if (result.kind === "completed") {
        res.status(200).json({
          status: "completed",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
          summaryId: result.summary.id,
        });
        return;
      }

      res.status(200).json({
        status: "started",
        agentRunId: result.agentRun.id,
        agentRunStatus: result.agentRun.status,
        currentStep: result.agentRun.currentStep,
        attemptCount: result.agentRun.attemptCount,
        recommendedAction: result.assessment.recommendedAction,
        deterministicPolicy: result.deterministicPolicy,
        assessment: result.assessment,
      });
    },
  );

  router.post(
    "/internal/agent-runs/:agentRunId/resume",
    async (req: Request, res: Response) => {
      const oidc = await deps.verifyOidc(
        req.header("authorization") ?? undefined,
      );
      if (!oidc.ok) {
        res.status(401).json({ error: "unauthorized", reason: oidc.reason });
        return;
      }

      const pathId =
        typeof req.params.agentRunId === "string"
          ? req.params.agentRunId.trim()
          : "";
      if (!pathId) {
        res.status(400).json({ error: "missing_agent_run_id" });
        return;
      }

      const bodyId = readBodyAgentRunId(req.body);
      if (bodyId !== undefined && bodyId !== pathId) {
        res.status(400).json({
          error: "agent_run_id_mismatch",
          message: "path and body agentRunId must agree",
        });
        return;
      }

      const evidenceId = readBodyEvidenceId(req.body);
      if (!evidenceId) {
        res.status(400).json({ error: "missing_evidence_id" });
        return;
      }

      if (rejectUntrustedBodyFields(req.body, res)) {
        return;
      }

      const result = await resumeExecution(pathId, evidenceId);

      if (result.kind === "noop") {
        res.status(200).json({
          status: "noop",
          reason: result.reason,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          evidenceId,
        });
        return;
      }

      if (result.kind === "transient_retry") {
        res.status(503).json({
          status: "transient_retry",
          errorCategory: result.errorCategory,
          message: result.message,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          evidenceId,
        });
        return;
      }

      if (result.kind === "failed") {
        const status =
          result.errorCategory === "agent_run_not_found" ? 404 : 200;
        res.status(status).json({
          status: "failed",
          errorCategory: result.errorCategory,
          message: result.message,
          agentRunId: result.agentRun?.id ?? pathId,
          agentRunStatus: result.agentRun?.status ?? null,
          currentStep: result.agentRun?.currentStep ?? null,
          attemptCount: result.agentRun?.attemptCount ?? null,
          evidenceId,
        });
        return;
      }

      if (result.kind === "policy_mismatch") {
        res.status(200).json({
          status: "policy_mismatch",
          mismatchReason: result.mismatchReason,
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          evidenceId,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
        });
        return;
      }

      if (result.kind === "waiting_for_evidence") {
        res.status(200).json({
          status: "waiting_for_evidence",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          evidenceId,
          requestId: result.pendingRequest.requestId,
          requestOutcome: result.requestOutcome,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
        });
        return;
      }

      if (result.kind === "escalated") {
        res.status(200).json({
          status: "escalated",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          evidenceId,
          lastEvidenceId: result.agentRun.lastEvidenceId,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
          outcomeKind: result.agentRun.outcome?.kind ?? null,
        });
        return;
      }

      if (result.kind === "completed") {
        res.status(200).json({
          status: "completed",
          agentRunId: result.agentRun.id,
          agentRunStatus: result.agentRun.status,
          currentStep: result.agentRun.currentStep,
          attemptCount: result.agentRun.attemptCount,
          evidenceId,
          lastEvidenceId: result.agentRun.lastEvidenceId,
          recommendedAction: result.assessment.recommendedAction,
          deterministicPolicy: result.deterministicPolicy,
          summaryId: result.summary.id,
        });
        return;
      }

      res.status(200).json({
        status: "resumed",
        agentRunId: result.agentRun.id,
        agentRunStatus: result.agentRun.status,
        currentStep: result.agentRun.currentStep,
        attemptCount: result.agentRun.attemptCount,
        evidenceId,
        lastEvidenceId: result.agentRun.lastEvidenceId,
        recommendedAction: result.assessment.recommendedAction,
        deterministicPolicy: result.deterministicPolicy,
        assessment: result.assessment,
      });
    },
  );

  return router;
}
