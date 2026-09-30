import { Router } from "express";

import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import {
  assertAgentRunDtoHasNoInternalFields,
  assertAgentSummaryDtoHasNoInternalFields,
  toAgentRunSummaryDTO,
  toAgentSummaryDTO,
} from "../dto/agentRunDto.js";
import type { AgentRun } from "../domain/agentRun.js";
import type { ProjectMember } from "../domain/projectMember.js";
import {
  getAgentRunById,
  getAgentRunsForProject,
} from "../repositories/agentRunsRepository.js";
import { getAgentSummaryById } from "../repositories/agentSummariesRepository.js";
import {
  assertProjectAccessContext,
  type ProjectAccessContext,
} from "../services/collaboration/projectAccessScope.js";
import { recoverFieldVarianceEvidenceRun } from "../services/recoverFieldVarianceEvidenceRun.js";
import { recoverStickyRequestEvidenceRun } from "../services/recoverStickyRequestEvidenceRun.js";
import {
  handleRouteError,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const agentRunsRouter = Router();

function memberMayReadAgentRun(
  agentRun: AgentRun,
  access: ProjectAccessContext,
): boolean {
  if (access.isOwner || access.accessMode === "full") {
    return true;
  }

  const membership = access.membership;
  if (!membership || membership.status !== "active") {
    return false;
  }

  // Targeted evidence request addressed to this member.
  if (
    agentRun.status === "waiting_for_evidence" &&
    agentRun.pendingRequest?.kind === "delta_evidence" &&
    agentRun.pendingRequest.requestedProjectMemberId === membership.id
  ) {
    return true;
  }

  // Scoped read: waiting runs for plan items already in assigned scope.
  if (
    agentRun.status === "waiting_for_evidence" &&
    access.assignedPlanItemIds.includes(agentRun.contextRefs.remotePlanItemId)
  ) {
    return true;
  }

  return false;
}

/**
 * List AgentRuns for a readable remote project.
 * Owners / full-access roles: all runs.
 * Assigned-scope members: waiting evidence runs they are targeted for
 * or whose Plan Item is already in their assigned scope.
 */
agentRunsRouter.get("/projects/:projectId/agent-runs", async (req, res) => {
  try {
    const uid = requireUserUid(req);
    const projectId = req.params.projectId;

    if (!uid) {
      sendError(res, 401, "Unauthorized");
      return;
    }

    if (!projectId) {
      sendError(res, 400, "projectId is required");
      return;
    }

    const access = await assertProjectAccessContext(projectId, uid);
    const runs = await getAgentRunsForProject(projectId);
    const items = runs
      .filter((run) => memberMayReadAgentRun(run, access))
      .map(toAgentRunSummaryDTO);

    for (const item of items) {
      if (!assertAgentRunDtoHasNoInternalFields(item)) {
        sendError(res, 500, "Internal server error");
        return;
      }
    }

    res.status(200).json(items);
  } catch (error) {
    await handleRouteError(res, error);
  }
});

/**
 * Fetch one AgentRun for a readable remote project.
 */
agentRunsRouter.get(
  "/projects/:projectId/agent-runs/:agentRunId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const agentRunId = req.params.agentRunId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !agentRunId) {
        sendError(res, 400, "projectId and agentRunId are required");
        return;
      }

      const access = await assertProjectAccessContext(projectId, uid);
      const agentRun = await getAgentRunById(agentRunId);

      if (!agentRun || agentRun.projectId !== projectId) {
        sendError(res, 404, "Agent run not found");
        return;
      }

      if (!memberMayReadAgentRun(agentRun, access)) {
        sendError(res, 404, "Agent run not found");
        return;
      }

      const dto = toAgentRunSummaryDTO(agentRun);

      if (!assertAgentRunDtoHasNoInternalFields(dto)) {
        sendError(res, 500, "Internal server error");
        return;
      }

      res.status(200).json(dto);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only: reopen a failed Field Variance AgentRun after unusable evidence.
 * Does not enqueue Cloud Tasks. Client must submit NEW Evidence afterward.
 */
agentRunsRouter.post(
  "/projects/:projectId/agent-runs/:agentRunId/recover-evidence",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const agentRunId = req.params.agentRunId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !agentRunId) {
        sendError(res, 400, "projectId and agentRunId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const result = await recoverFieldVarianceEvidenceRun({
        projectId,
        agentRunId,
        ownerUid: uid,
      });

      if (result.outcome === "not_found") {
        sendError(res, 404, "Agent run not found");
        return;
      }

      if (result.outcome === "not_eligible") {
        sendError(res, 400, result.reason);
        return;
      }

      const dto = toAgentRunSummaryDTO(result.agentRun);

      if (!assertAgentRunDtoHasNoInternalFields(dto)) {
        sendError(res, 500, "Internal server error");
        return;
      }

      res.status(200).json({
        outcome: result.outcome,
        agentRun: dto,
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Owner-only: reopen sticky running/assess_variance after request_evidence
 * fall-through. Distinct from recover-evidence (failed media). No Cloud Task.
 */
agentRunsRouter.post(
  "/projects/:projectId/agent-runs/:agentRunId/recover-request-evidence",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const agentRunId = req.params.agentRunId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !agentRunId) {
        sendError(res, 400, "projectId and agentRunId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const result = await recoverStickyRequestEvidenceRun({
        projectId,
        agentRunId,
        ownerUid: uid,
      });

      if (result.outcome === "not_found") {
        sendError(res, 404, "Agent run not found");
        return;
      }

      if (result.outcome === "not_eligible") {
        sendError(res, 400, result.reason);
        return;
      }

      const dto = toAgentRunSummaryDTO(result.agentRun);

      if (!assertAgentRunDtoHasNoInternalFields(dto)) {
        sendError(res, 500, "Internal server error");
        return;
      }

      res.status(200).json({
        outcome: result.outcome,
        agentRun: dto,
      });
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);

/**
 * Fetch one AgentSummary for an owned remote project (read-only).
 * Summaries remain owner-facing for this phase.
 */
agentRunsRouter.get(
  "/projects/:projectId/agent-summaries/:summaryId",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const summaryId = req.params.summaryId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }

      if (!projectId || !summaryId) {
        sendError(res, 400, "projectId and summaryId are required");
        return;
      }

      await assertProjectOwnedByUser(projectId, uid);

      const summary = await getAgentSummaryById(summaryId);

      if (
        !summary ||
        summary.ownerUid !== uid ||
        summary.projectId !== projectId
      ) {
        sendError(res, 404, "Agent summary not found");
        return;
      }

      const dto = toAgentSummaryDTO(summary);

      if (!assertAgentSummaryDtoHasNoInternalFields(dto)) {
        sendError(res, 500, "Internal server error");
        return;
      }

      res.status(200).json(dto);
    } catch (error) {
      await handleRouteError(res, error);
    }
  },
);
