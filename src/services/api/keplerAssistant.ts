import { authenticatedFetch } from "./client";
import { KeplerAssistantApiError, parseKeplerConversationDTO, parseKeplerMessagePage, parseKeplerMessagePostResult } from "./keplerAssistantTypes";
import type { KeplerConversationDTO, KeplerMessagePage, KeplerMessagePostResult } from "./keplerAssistantTypes";
export * from "./keplerAssistantTypes";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new KeplerAssistantApiError("invalid");
  }
}

async function sendRequest(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await authenticatedFetch(path, init);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      throw new KeplerAssistantApiError("authentication");
    }
    throw new KeplerAssistantApiError("network");
  }
}

async function assertResponse(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 401) throw new KeplerAssistantApiError("authentication");
  if (response.status === 403 || response.status === 404) throw new KeplerAssistantApiError("access");
  if (response.status >= 500) throw new KeplerAssistantApiError("assistant");
  throw new KeplerAssistantApiError("invalid");
}

export async function createKeplerConversation(projectId: string): Promise<KeplerConversationDTO> {
  const response = await sendRequest(`/api/projects/${encodeURIComponent(projectId)}/kepler/conversations`, { method: "POST" });
  await assertResponse(response);
  if (response.status !== 201) throw new KeplerAssistantApiError("invalid");
  return parseKeplerConversationDTO(await readJson(response), projectId);
}

export async function sendKeplerMessage(input: {
  projectId: string;
  conversationId: string;
  content: string;
  clientMessageId: string;
}): Promise<KeplerMessagePostResult> {
  const response = await sendRequest(
    `/api/projects/${encodeURIComponent(input.projectId)}/kepler/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ content: input.content, clientMessageId: input.clientMessageId }) },
  );
  if (![200, 201, 202].includes(response.status)) await assertResponse(response);
  return parseKeplerMessagePostResult(await readJson(response), input.conversationId, response.status);
}

export async function listKeplerMessages(input: {
  projectId: string;
  conversationId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<KeplerMessagePage> {
  const query = new URLSearchParams({ limit: String(Math.min(50, Math.max(1, Math.floor(input.limit ?? 50)))) });
  if (input.cursor) query.set("cursor", input.cursor);
  const response = await sendRequest(
    `/api/projects/${encodeURIComponent(input.projectId)}/kepler/conversations/${encodeURIComponent(input.conversationId)}/messages?${query.toString()}`,
  );
  await assertResponse(response);
  return parseKeplerMessagePage(await readJson(response), input.conversationId);
}
