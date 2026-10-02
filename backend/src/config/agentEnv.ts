export type AgentCloudTasksEnv = {
  projectId: string;
  location: string;
  queue: string;
  agentServiceUrl: string;
  invokerServiceAccountEmail: string;
};

export function loadKeplerAgentServiceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.AGENT_SERVICE_URL?.trim();
  if (!value) throw new Error("AGENT_SERVICE_URL is required for Kepler");
  return value.replace(/\/$/, "");
}

/**
 * Loads Cloud Tasks / agent enqueue configuration.
 * Prefers GOOGLE_CLOUD_PROJECT (same convention as Firebase Admin).
 */
export function loadAgentCloudTasksEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgentCloudTasksEnv {
  const projectId =
    env.GOOGLE_CLOUD_PROJECT?.trim() || env.GCLOUD_PROJECT?.trim();

  if (!projectId) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT is required for Field Variance Cloud Tasks",
    );
  }

  const location = env.CLOUD_TASKS_LOCATION?.trim();
  if (!location) {
    throw new Error(
      "CLOUD_TASKS_LOCATION is required for Field Variance Cloud Tasks",
    );
  }

  const queue = env.CLOUD_TASKS_QUEUE?.trim();
  if (!queue) {
    throw new Error(
      "CLOUD_TASKS_QUEUE is required for Field Variance Cloud Tasks",
    );
  }

  const agentServiceUrl = env.AGENT_SERVICE_URL?.trim();
  if (!agentServiceUrl) {
    throw new Error(
      "AGENT_SERVICE_URL is required for Field Variance Cloud Tasks",
    );
  }

  const invokerServiceAccountEmail =
    env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!invokerServiceAccountEmail) {
    throw new Error(
      "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL is required for Field Variance Cloud Tasks",
    );
  }

  return {
    projectId,
    location,
    queue,
    agentServiceUrl: agentServiceUrl.replace(/\/$/, ""),
    invokerServiceAccountEmail,
  };
}

export function buildAgentRunStartUrl(
  agentServiceUrl: string,
  agentRunId: string,
): string {
  const base = agentServiceUrl.replace(/\/$/, "");
  return `${base}/internal/agent-runs/${encodeURIComponent(agentRunId)}/start`;
}

export function buildAgentRunResumeUrl(
  agentServiceUrl: string,
  agentRunId: string,
): string {
  const base = agentServiceUrl.replace(/\/$/, "");
  return `${base}/internal/agent-runs/${encodeURIComponent(agentRunId)}/resume`;
}

/**
 * Cloud Tasks target for Plan Import document intelligence (Phase 2P.3).
 * Body carries only { importId }.
 */
export function buildPlanImportProcessUrl(
  agentServiceUrl: string,
  importId: string,
): string {
  const base = agentServiceUrl.replace(/\/$/, "");
  return `${base}/internal/plan-imports/${encodeURIComponent(importId)}/process`;
}
