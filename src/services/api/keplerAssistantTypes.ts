export const KEPLER_REFERENCE_KINDS = ["project", "plan_item", "work_package", "measurement", "delta", "activity", "agent_run"] as const;
export type KeplerReferenceKind = (typeof KEPLER_REFERENCE_KINDS)[number];
export type KeplerReference = { kind: KeplerReferenceKind; canonicalId: string; label: string };
export type KeplerSuggestedAction = { kind: "navigate"; label: string; reference: KeplerReference };
export type KeplerConversationDTO = { id: string; projectId: string; createdAt: string; updatedAt: string };
export type KeplerMessageDTO = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  references?: KeplerReference[];
  suggestedActions?: KeplerSuggestedAction[];
};
export type KeplerMessagePage = { items: KeplerMessageDTO[]; nextCursor: string | null };
export type KeplerMessagePostResult = { userMessage: KeplerMessageDTO; assistantMessage: KeplerMessageDTO | null; generationStatus: "completed" | "processing" };
export type KeplerApiErrorKind = "network" | "authentication" | "access" | "assistant" | "invalid";

export class KeplerAssistantApiError extends Error {
  constructor(readonly kind: KeplerApiErrorKind) {
    super(kind);
    this.name = "KeplerAssistantApiError";
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseReference(value: unknown): KeplerReference | null {
  if (!isRecord(value) || typeof value.kind !== "string" || !(KEPLER_REFERENCE_KINDS as readonly string[]).includes(value.kind) || !nonEmptyString(value.canonicalId) || !nonEmptyString(value.label)) return null;
  return { kind: value.kind as KeplerReferenceKind, canonicalId: value.canonicalId.trim(), label: value.label.trim().slice(0, 160) };
}

function parseMessage(value: unknown): KeplerMessageDTO | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.conversationId) || (value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string" || !value.content.trim() || value.content.length > (value.role === "assistant" ? 8000 : 4000) || !isTimestamp(value.createdAt)) return null;
  const message: KeplerMessageDTO = { id: value.id.trim(), conversationId: value.conversationId.trim(), role: value.role, content: value.content, createdAt: value.createdAt };
  if (value.references !== undefined) {
    if (!Array.isArray(value.references)) return null;
    message.references = value.references.flatMap((item) => { const parsed = parseReference(item); return parsed ? [parsed] : []; });
  }
  if (value.suggestedActions !== undefined) {
    if (!Array.isArray(value.suggestedActions)) return null;
    message.suggestedActions = value.suggestedActions.flatMap((item) => {
      if (!isRecord(item) || item.kind !== "navigate" || !nonEmptyString(item.label)) return [];
      const reference = parseReference(item.reference);
      return reference ? [{ kind: "navigate" as const, label: item.label.trim().slice(0, 80), reference }] : [];
    });
  }
  return message;
}

export function parseKeplerConversationDTO(value: unknown, expectedProjectId: string): KeplerConversationDTO {
  if (!isRecord(value) || !nonEmptyString(value.id) || value.projectId !== expectedProjectId || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new KeplerAssistantApiError("invalid");
  return { id: value.id.trim(), projectId: expectedProjectId, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function parseKeplerMessagePostResult(value: unknown, expectedConversationId: string, status: number): KeplerMessagePostResult {
  if (!isRecord(value)) throw new KeplerAssistantApiError("invalid");
  const userMessage = parseMessage(value.userMessage);
  const assistantMessage = value.assistantMessage === null ? null : parseMessage(value.assistantMessage);
  const generationStatus = value.generationStatus;
  if (!userMessage || userMessage.role !== "user" || userMessage.conversationId !== expectedConversationId || (value.assistantMessage !== null && (!assistantMessage || assistantMessage.role !== "assistant" || assistantMessage.conversationId !== expectedConversationId)) || (generationStatus !== "completed" && generationStatus !== "processing") || (status === 202 && generationStatus !== "processing") || (generationStatus === "completed" && !assistantMessage) || (generationStatus === "processing" && assistantMessage !== null)) throw new KeplerAssistantApiError("invalid");
  return { userMessage, assistantMessage, generationStatus };
}

export function parseKeplerMessagePage(value: unknown, expectedConversationId: string): KeplerMessagePage {
  if (!isRecord(value) || !Array.isArray(value.items) || !(value.nextCursor === null || typeof value.nextCursor === "string")) throw new KeplerAssistantApiError("invalid");
  const items = value.items.map(parseMessage);
  if (items.some((item) => !item || item.conversationId !== expectedConversationId)) throw new KeplerAssistantApiError("invalid");
  return { items: items as KeplerMessageDTO[], nextCursor: value.nextCursor as string | null };
}
