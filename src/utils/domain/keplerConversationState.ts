import type { KeplerMessageDTO, KeplerMessagePostResult } from "../../services/api/keplerAssistant";

export type KeplerDeliveryState = "sending" | "failed" | "confirmed";
export type KeplerConversationStatus = "idle" | "creating" | "sending" | "processing" | "failed" | "access_denied";
export type KeplerFailureKind = "network" | "assistant" | "authentication" | "invalid" | "setup";

export type KeplerTranscriptMessage = KeplerMessageDTO & { deliveryState: KeplerDeliveryState };

export type KeplerSendAttempt = {
  content: string;
  clientMessageId: string;
  localMessageId: string;
};

export type KeplerConversationState = {
  scopeKey: string | null;
  conversationId: string | null;
  messages: KeplerTranscriptMessage[];
  attempt: KeplerSendAttempt | null;
  status: KeplerConversationStatus;
  failureKind: KeplerFailureKind | null;
};

export type KeplerConversationAction =
  | { type: "scope_changed"; scopeKey: string | null }
  | { type: "reset"; scopeKey: string | null }
  | { type: "send_started"; attempt: KeplerSendAttempt; creatingConversation: boolean }
  | { type: "retry_started"; creatingConversation: boolean }
  | { type: "conversation_created"; conversationId: string }
  | { type: "response_received"; result: KeplerMessagePostResult }
  | { type: "send_failed"; kind: KeplerFailureKind }
  | { type: "access_revoked" };

export function createKeplerConversationState(scopeKey: string | null = null): KeplerConversationState {
  return { scopeKey, conversationId: null, messages: [], attempt: null, status: "idle", failureKind: null };
}

function replacePendingMessage(messages: KeplerTranscriptMessage[], attempt: KeplerSendAttempt, confirmed: KeplerMessageDTO): KeplerTranscriptMessage[] {
  const next = messages.map((message) => message.id === attempt.localMessageId
    ? { ...confirmed, deliveryState: "confirmed" as const }
    : message);
  if (!next.some((message) => message.id === confirmed.id)) next.push({ ...confirmed, deliveryState: "confirmed" });
  return next;
}

export function orderKeplerTranscript(messages: readonly KeplerTranscriptMessage[]): KeplerTranscriptMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => Date.parse(a.message.createdAt) - Date.parse(b.message.createdAt) || a.index - b.index)
    .map(({ message }) => message);
}

export function keplerConversationReducer(state: KeplerConversationState, action: KeplerConversationAction): KeplerConversationState {
  switch (action.type) {
    case "scope_changed":
      return action.scopeKey === state.scopeKey ? state : createKeplerConversationState(action.scopeKey);
    case "reset":
      return createKeplerConversationState(action.scopeKey);
    case "send_started":
      if (state.attempt || (state.status !== "idle" && !(state.status === "failed" && !state.attempt))) return state;
      return {
        ...state,
        attempt: action.attempt,
        messages: [...state.messages, {
          id: action.attempt.localMessageId,
          conversationId: state.conversationId ?? "pending",
          role: "user",
          content: action.attempt.content,
          createdAt: new Date().toISOString(),
          deliveryState: "sending",
        }],
        status: action.creatingConversation ? "creating" : "sending",
        failureKind: null,
      };
    case "retry_started":
      if (!state.attempt) return state;
      return {
        ...state,
        messages: state.attempt
          ? state.messages.map((message) => message.id === state.attempt?.localMessageId ? { ...message, deliveryState: "sending" } : message)
          : state.messages,
        status: action.creatingConversation ? "creating" : "sending",
        failureKind: null,
      };
    case "conversation_created":
      return { ...state, conversationId: action.conversationId };
    case "response_received": {
      if (!state.attempt) return state;
      const messages = replacePendingMessage(state.messages, state.attempt, action.result.userMessage);
      if (action.result.assistantMessage && !messages.some((message) => message.id === action.result.assistantMessage?.id)) {
        messages.push({ ...action.result.assistantMessage, deliveryState: "confirmed" });
      }
      return {
        ...state,
        messages: orderKeplerTranscript(messages),
        status: action.result.generationStatus === "processing" ? "processing" : "idle",
        attempt: action.result.generationStatus === "processing" ? state.attempt : null,
        failureKind: null,
      };
    }
    case "send_failed":
      return {
        ...state,
        messages: state.attempt
          ? state.messages.map((message) => message.id === state.attempt?.localMessageId
            ? { ...message, deliveryState: action.kind === "assistant" ? "confirmed" as const : "failed" as const }
            : message)
          : state.messages,
        status: "failed",
        failureKind: action.kind,
      };
    case "access_revoked":
      return { ...createKeplerConversationState(state.scopeKey), status: "access_denied", failureKind: "authentication" };
  }
}

/** Uses the platform secure UUID API; no weak random fallback is used. */
export function createKeplerClientMessageId(randomUUID?: () => string): string {
  if (randomUUID) return randomUUID();
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("Secure random identifiers are unavailable.");
}

export function keplerProjectChatAvailability(mappingLoading: boolean, remoteProjectId: string | null | undefined): "loading" | "available" | "unavailable" {
  if (mappingLoading) return "loading";
  return remoteProjectId?.trim() ? "available" : "unavailable";
}
