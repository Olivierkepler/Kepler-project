import { GoogleAuth } from "google-auth-library";
import type { KeplerProjectContext } from "./keplerProjectContext.js";

export type KeplerAgentRequest = {
  question: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  projectContext: Omit<KeplerProjectContext, "allowedReferences">;
  allowedReferences: KeplerProjectContext["allowedReferences"];
};

/** Keep the authorization catalog separate from factual project context. */
export function buildKeplerAgentRequest(input: {
  question: string;
  conversationHistory: KeplerAgentRequest["conversationHistory"];
  projectContext: KeplerProjectContext;
}): KeplerAgentRequest {
  const { allowedReferences, ...projectContext } = input.projectContext;
  return {
    question: input.question,
    conversationHistory: input.conversationHistory,
    projectContext: JSON.parse(JSON.stringify(projectContext)) as Omit<KeplerProjectContext, "allowedReferences">,
    allowedReferences,
  };
}

export type KeplerAgentResponse = {
  message: string;
  references: Array<{ kind: string; canonicalId: string }>;
  suggestedActions: Array<{ kind: "navigate"; label: string; reference: { kind: string; canonicalId: string } }>;
};

export type KeplerAgentCaller = (input: KeplerAgentRequest) => Promise<unknown>;

export function createKeplerAgentCaller(args: { agentServiceUrl: string; auth?: GoogleAuth }): KeplerAgentCaller {
  const baseUrl = args.agentServiceUrl.replace(/\/$/, "");
  const auth = args.auth ?? new GoogleAuth();
  return async (input) => {
    const client = await auth.getIdTokenClient(baseUrl);
    const response = await client.request<unknown>({
      url: `${baseUrl}/internal/kepler/respond`,
      method: "POST",
      data: input,
      timeout: 75_000,
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  };
}

export function createStubKeplerAgentCaller(response: unknown | (() => unknown | Promise<unknown>)): KeplerAgentCaller {
  return async () => typeof response === "function" ? (response as () => unknown | Promise<unknown>)() : response;
}
