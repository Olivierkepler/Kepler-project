import { GoogleAuth } from "google-auth-library";

export type KeplerAgentRequest = {
  question: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  projectContext: Record<string, unknown>;
  allowedReferences: Array<{ kind: string; canonicalId: string; label: string }>;
};

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
