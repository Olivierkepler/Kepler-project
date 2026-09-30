/**
 * Cloud chat API (Phase Chat 1) — project + direct conversations.
 */

import type {
  ChatMessage,
  ChatMessageReference,
  Conversation,
  ConversationMessagesPage,
  ChatParticipantPresentation,
  ChatPlanItemReferencePresentation,
} from "../../types/chat";
import { authenticatedFetch } from "./client";

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseConversation(value: unknown): Conversation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    (record.type !== "project" && record.type !== "direct") ||
    !Array.isArray(record.participantProjectMemberIds) ||
    !isNonEmptyString(record.createdByProjectMemberId) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    type: record.type,
    ...(isNonEmptyString(record.avatarUrl)
      ? { avatarUrl: record.avatarUrl.trim() }
      : {}),
    participantProjectMemberIds: record.participantProjectMemberIds
      .filter(isNonEmptyString)
      .map((item) => item.trim()),
    createdByProjectMemberId: record.createdByProjectMemberId.trim(),
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
    lastMessageAt:
      typeof record.lastMessageAt === "string" && record.lastMessageAt.trim()
        ? record.lastMessageAt.trim()
        : null,
    lastMessagePreview:
      typeof record.lastMessagePreview === "string"
        ? record.lastMessagePreview.trim() || null
        : null,
  };
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.conversationId) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.senderProjectMemberId) ||
    typeof record.text !== "string" ||
    !isNonEmptyString(record.createdAt)
  ) {
    return null;
  }

  let reference: ChatMessageReference | null = null;
  if (record.reference !== undefined && record.reference !== null) {
    if (typeof record.reference !== "object") {
      return null;
    }
    const ref = record.reference as Record<string, unknown>;
    if (ref.type !== "plan_item" || !isNonEmptyString(ref.planItemId)) {
      return null;
    }
    reference = {
      type: "plan_item",
      planItemId: ref.planItemId.trim(),
    };
  }

  return {
    id: record.id.trim(),
    conversationId: record.conversationId.trim(),
    projectId: record.projectId.trim(),
    senderProjectMemberId: record.senderProjectMemberId.trim(),
    text: record.text,
    createdAt: record.createdAt.trim(),
    editedAt:
      typeof record.editedAt === "string" && record.editedAt.trim()
        ? record.editedAt.trim()
        : null,
    reference,
  };
}

function parseReferencePresentation(
  value: unknown,
): ChatPlanItemReferencePresentation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.planItemId) || typeof record.available !== "boolean") {
    return null;
  }
  return {
    planItemId: record.planItemId.trim(),
    available: record.available,
    label: typeof record.label === "string" ? record.label : null,
    typeLabel: typeof record.typeLabel === "string" ? record.typeLabel : null,
    plannedValue:
      typeof record.plannedValue === "number" ? record.plannedValue : null,
    unit: typeof record.unit === "string" ? record.unit : null,
    workPackageName:
      typeof record.workPackageName === "string"
        ? record.workPackageName
        : null,
    statusLabel:
      typeof record.statusLabel === "string" ? record.statusLabel : null,
    latestFieldValue:
      typeof record.latestFieldValue === "number"
        ? record.latestFieldValue
        : null,
    variance: typeof record.variance === "number" ? record.variance : null,
  };
}

function parseParticipant(
  value: unknown,
): ChatParticipantPresentation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.projectMemberId) ||
    !isNonEmptyString(record.userId) ||
    !isNonEmptyString(record.role)
  ) {
    return null;
  }

  return {
    projectMemberId: record.projectMemberId.trim(),
    userId: record.userId.trim(),
    role: record.role.trim(),
    displayName:
      typeof record.displayName === "string"
        ? record.displayName.trim() || null
        : null,
    email:
      typeof record.email === "string" ? record.email.trim() || null : null,
    avatarUrl:
      typeof record.avatarUrl === "string" && record.avatarUrl.trim()
        ? record.avatarUrl.trim()
        : null,
  };
}

function mapAuthError(response: Response, body: unknown): never {
  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }
  if (response.status === 404) {
    throw new Error(parseErrorMessage(body, "Not found."));
  }
  if (response.status === 400) {
    throw new Error(parseErrorMessage(body, "Invalid request."));
  }
  throw new Error(parseErrorMessage(body, "Unable to reach the authenticated API."));
}

export async function listMessageableMembers(
  remoteProjectId: string,
): Promise<ChatParticipantPresentation[]> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/conversations/messageable-members`,
  );
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }
  if (!Array.isArray(body)) {
    throw new Error("Unable to reach the authenticated API.");
  }
  return body
    .map((item) => parseParticipant(item))
    .filter((item): item is ChatParticipantPresentation => item !== null);
}

export async function listProjectConversations(
  remoteProjectId: string,
): Promise<Conversation[]> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/conversations`,
  );
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }
  if (!Array.isArray(body)) {
    throw new Error("Unable to reach the authenticated API.");
  }
  return body
    .map((item) => parseConversation(item))
    .filter((item): item is Conversation => item !== null);
}

export async function ensureProjectConversation(
  remoteProjectId: string,
): Promise<Conversation> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/conversations/project`,
    { method: "POST", body: "{}" },
  );
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }
  const parsed = parseConversation(body);
  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }
  return parsed;
}

export async function ensureDirectConversation(
  remoteProjectId: string,
  otherProjectMemberId: string,
): Promise<Conversation> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/conversations/direct`,
    {
      method: "POST",
      body: JSON.stringify({ otherProjectMemberId }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }
  const parsed = parseConversation(body);
  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }
  return parsed;
}

export async function listConversationMessages(input: {
  remoteProjectId: string;
  conversationId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<ConversationMessagesPage> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  const query = params.toString();
  const path = `/api/projects/${encodeURIComponent(input.remoteProjectId)}/conversations/${encodeURIComponent(input.conversationId)}/messages${query ? `?${query}` : ""}`;

  const response = await authenticatedFetch(path);
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const record = body as Record<string, unknown>;
  const conversation = parseConversation(record.conversation);
  if (!conversation || !isNonEmptyString(record.currentProjectMemberId)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const items = Array.isArray(record.items)
    ? record.items
        .map((item) => parseChatMessage(item))
        .filter((item): item is ChatMessage => item !== null)
    : [];

  const participants = Array.isArray(record.participants)
    ? record.participants
        .map((item) => parseParticipant(item))
        .filter((item): item is ChatParticipantPresentation => item !== null)
    : [];

  return {
    items,
    nextCursor:
      typeof record.nextCursor === "string" && record.nextCursor.trim()
        ? record.nextCursor.trim()
        : null,
    conversation,
    currentProjectMemberId: record.currentProjectMemberId.trim(),
    participants,
    referencePresentations: (() => {
      const raw = record.referencePresentations;
      if (typeof raw !== "object" || raw === null) {
        return {};
      }
      const out: Record<string, ChatPlanItemReferencePresentation> = {};
      for (const [key, value] of Object.entries(raw)) {
        const parsed = parseReferencePresentation(value);
        if (parsed) {
          out[key] = parsed;
        }
      }
      return out;
    })(),
  };
}

export async function sendConversationMessage(input: {
  remoteProjectId: string;
  conversationId: string;
  text: string;
  reference?: ChatMessageReference | null;
}): Promise<ChatMessage> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(input.remoteProjectId)}/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        text: input.text,
        ...(input.reference ? { reference: input.reference } : {}),
      }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) {
    mapAuthError(response, body);
  }
  const parsed = parseChatMessage(body);
  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }
  return parsed;
}

export async function markConversationRead(input: {
  remoteProjectId: string;
  conversationId: string;
}): Promise<void> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(input.remoteProjectId)}/conversations/${encodeURIComponent(input.conversationId)}/read`,
    { method: "POST", body: "{}" },
  );
  if (!response.ok) {
    const body = await readJson(response);
    mapAuthError(response, body);
  }
}
