import type { KeplerConversation } from "../domain/keplerConversation.js";
import {
  KEPLER_REFERENCE_KINDS,
  type KeplerMessage,
  type KeplerReference,
  type KeplerSuggestedAction,
  MAX_KEPLER_ASSISTANT_MESSAGE_LENGTH,
} from "../domain/keplerMessage.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export const MAX_KEPLER_MESSAGE_LENGTH = 4000;
export const MAX_KEPLER_CLIENT_MESSAGE_ID_LENGTH = 128;
export const DEFAULT_KEPLER_PAGE_SIZE = 20;
export const MAX_KEPLER_PAGE_SIZE = 50;

const USER_MESSAGE_KEYS = new Set(["content", "clientMessageId"]);

export function parseCreateKeplerMessageBody(
  body: unknown,
): { content: string; clientMessageId: string } | null {
  if (!isRecord(body) || Object.keys(body).some((key) => !USER_MESSAGE_KEYS.has(key))) {
    return null;
  }
  if (typeof body.content !== "string" || typeof body.clientMessageId !== "string") {
    return null;
  }
  const content = body.content.trim();
  const clientMessageId = body.clientMessageId.trim();
  if (
    !content ||
    content.length > MAX_KEPLER_MESSAGE_LENGTH ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(clientMessageId) ||
    clientMessageId.length > MAX_KEPLER_CLIENT_MESSAGE_ID_LENGTH
  ) {
    return null;
  }
  return { content, clientMessageId };
}

export function normalizeKeplerConversation(data: unknown): KeplerConversation | undefined {
  if (
    !isRecord(data) ||
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.userUid) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) return undefined;
  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    userUid: data.userUid.trim(),
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
  };
}

function normalizeReference(data: unknown): KeplerReference | undefined {
  if (
    !isRecord(data) ||
    typeof data.kind !== "string" ||
    !(KEPLER_REFERENCE_KINDS as readonly string[]).includes(data.kind) ||
    !isNonEmptyString(data.canonicalId) ||
    !isNonEmptyString(data.label)
  ) return undefined;
  return {
    kind: data.kind as KeplerReference["kind"],
    canonicalId: data.canonicalId.trim(),
    label: data.label.trim().slice(0, 160),
  };
}

export function normalizeKeplerMessage(data: unknown): KeplerMessage | undefined {
  if (
    !isRecord(data) ||
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.conversationId) ||
    !isNonEmptyString(data.projectId) ||
    (data.role !== "user" && data.role !== "assistant") ||
    typeof data.content !== "string" ||
    !isNonEmptyString(data.createdAt) ||
    data.content.length > (data.role === "assistant" ? MAX_KEPLER_ASSISTANT_MESSAGE_LENGTH : MAX_KEPLER_MESSAGE_LENGTH)
  ) return undefined;

  const result: KeplerMessage = {
    id: data.id.trim(),
    conversationId: data.conversationId.trim(),
    projectId: data.projectId.trim(),
    role: data.role,
    content: data.content,
    createdAt: data.createdAt.trim(),
  };
  if (data.clientMessageId !== undefined) {
    if (!isNonEmptyString(data.clientMessageId) || data.clientMessageId.length > MAX_KEPLER_CLIENT_MESSAGE_ID_LENGTH) return undefined;
    result.clientMessageId = data.clientMessageId.trim();
  }
  if (data.references !== undefined) {
    if (!Array.isArray(data.references)) return undefined;
    const references = data.references.map(normalizeReference);
    if (references.some((item) => !item)) return undefined;
    result.references = references as KeplerReference[];
  }
  if (data.suggestedActions !== undefined) {
    if (!Array.isArray(data.suggestedActions)) return undefined;
    const actions = data.suggestedActions.map((item): KeplerSuggestedAction | undefined => {
      if (!isRecord(item) || item.kind !== "navigate" || !isNonEmptyString(item.label)) return undefined;
      const reference = normalizeReference(item.reference);
      return reference ? { kind: "navigate", label: item.label.trim().slice(0, 80), reference } : undefined;
    });
    if (actions.some((item) => !item)) return undefined;
    result.suggestedActions = actions as KeplerSuggestedAction[];
  }
  return result;
}

export function isValidKeplerPageSize(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_KEPLER_PAGE_SIZE;
}

export function encodeKeplerCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeKeplerCursor(value: string): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator <= 0 || separator === decoded.length - 1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}
