import type { AgentRunSummary } from "../../types/agentRun";
import type { AgentSummary } from "../../types/agentSummary";
import { authenticatedFetch } from "./client";

function isAgentRunSummary(value: unknown): value is AgentRunSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.workflowType === "field_variance" &&
    typeof record.status === "string" &&
    typeof record.currentStep === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.deltaContext === "object" &&
    record.deltaContext !== null
  );
}

function isAgentSummary(value: unknown): value is AgentSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.agentRunId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.varianceSummary === "string" &&
    typeof record.documentationSummary === "string" &&
    typeof record.documentedImpact === "object" &&
    record.documentedImpact !== null
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }

  return fallback;
}

/**
 * GET /api/projects/:remoteProjectId/agent-runs
 */
export async function getAgentRunsForProject(
  remoteProjectId: string,
): Promise<AgentRunSummary[]> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs`,
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Agent activity could not be loaded."),
    );
  }

  if (!Array.isArray(body)) {
    throw new Error("Agent activity could not be loaded.");
  }

  const items: AgentRunSummary[] = [];

  for (const item of body) {
    if (!isAgentRunSummary(item)) {
      throw new Error("Agent activity could not be loaded.");
    }
    items.push(item);
  }

  return items;
}

/**
 * GET /api/projects/:remoteProjectId/agent-runs/:agentRunId
 */
export async function getAgentRun(
  remoteProjectId: string,
  agentRunId: string,
): Promise<AgentRunSummary> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs/${encodeURIComponent(agentRunId)}`,
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Agent activity could not be loaded."),
    );
  }

  if (!isAgentRunSummary(body)) {
    throw new Error("Agent activity could not be loaded.");
  }

  return body;
}

/**
 * POST /api/projects/:remoteProjectId/agent-runs/:agentRunId/recover-evidence
 * Owner-only reopen after unusable evidence. Does not upload Evidence.
 */
export async function recoverAgentRunEvidence(
  remoteProjectId: string,
  agentRunId: string,
): Promise<AgentRunSummary> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs/${encodeURIComponent(agentRunId)}/recover-evidence`,
    { method: "POST" },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Could not reopen this agent run for a new photo."),
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !isAgentRunSummary((body as Record<string, unknown>).agentRun)
  ) {
    throw new Error("Could not reopen this agent run for a new photo.");
  }

  return (body as { agentRun: AgentRunSummary }).agentRun;
}

/**
 * POST .../recover-request-evidence
 * Owner-only reopen sticky running/assess_variance after request_evidence.
 */
export async function recoverStickyRequestEvidence(
  remoteProjectId: string,
  agentRunId: string,
): Promise<AgentRunSummary> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs/${encodeURIComponent(agentRunId)}/recover-request-evidence`,
    { method: "POST" },
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(
        body,
        "Could not reopen this agent run for additional evidence.",
      ),
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !isAgentRunSummary((body as Record<string, unknown>).agentRun)
  ) {
    throw new Error(
      "Could not reopen this agent run for additional evidence.",
    );
  }

  return (body as { agentRun: AgentRunSummary }).agentRun;
}

/**
 * GET /api/projects/:remoteProjectId/agent-summaries/:summaryId
 */
export async function getAgentSummary(
  remoteProjectId: string,
  summaryId: string,
): Promise<AgentSummary> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-summaries/${encodeURIComponent(summaryId)}`,
  );

  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Agent summary could not be loaded."),
    );
  }

  if (!isAgentSummary(body)) {
    throw new Error("Agent summary could not be loaded.");
  }

  return body;
}
