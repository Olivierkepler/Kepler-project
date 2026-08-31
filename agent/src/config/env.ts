export type AgentServiceEnv = {
  port: number;
  googleCloudProject: string;
  googleCloudLocation: string;
  geminiModel: string;
  agentServiceUrl: string;
  invokerServiceAccountEmail: string;
  oidcMode: "production" | "local_test";
  localOidcSecret: string | null;
};

/**
 * Loads agent service configuration. Credentials come from ADC / identity.
 */
export function loadAgentServiceEnv(
  env: NodeJS.ProcessEnv = process.env,
): AgentServiceEnv {
  const googleCloudProject =
    env.GOOGLE_CLOUD_PROJECT?.trim() || env.GCLOUD_PROJECT?.trim();

  if (!googleCloudProject) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required for buildsigma-agent");
  }

  const googleCloudLocation = env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
  const geminiModel = env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  const agentServiceUrl = env.AGENT_SERVICE_URL?.trim();
  if (!agentServiceUrl) {
    throw new Error("AGENT_SERVICE_URL is required for OIDC audience");
  }

  const invokerServiceAccountEmail =
    env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!invokerServiceAccountEmail) {
    throw new Error(
      "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL is required for OIDC identity checks",
    );
  }

  const oidcModeRaw = env.AGENT_OIDC_MODE?.trim() || "production";
  if (oidcModeRaw !== "production" && oidcModeRaw !== "local_test") {
    throw new Error("AGENT_OIDC_MODE must be 'production' or 'local_test'");
  }

  const localOidcSecret = env.AGENT_LOCAL_OIDC_SECRET?.trim() || null;
  if (oidcModeRaw === "local_test" && !localOidcSecret) {
    throw new Error(
      "AGENT_LOCAL_OIDC_SECRET is required when AGENT_OIDC_MODE=local_test",
    );
  }

  const portRaw = env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : 8081;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    port,
    googleCloudProject,
    googleCloudLocation,
    geminiModel,
    agentServiceUrl: agentServiceUrl.replace(/\/$/, ""),
    invokerServiceAccountEmail,
    oidcMode: oidcModeRaw,
    localOidcSecret,
  };
}
