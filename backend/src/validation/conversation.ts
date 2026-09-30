import {
  CONVERSATION_TYPES,
  MAX_CHAT_MESSAGE_LENGTH,
  type Conversation,
  type ConversationParticipant,
  type ConversationType,
} from "../domain/conversation.js";
import type {
  ChatMessage,
  ChatMessageReference,
} from "../domain/chatMessage.js";
import {
  isAllowedProjectChatAvatarContentType,
  isProjectChatAvatarObjectId,
} from "../storage/projectChatAvatarStorage.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function isConversationType(value: unknown): value is ConversationType {
  return (
    typeof value === "string" &&
    (CONVERSATION_TYPES as readonly string[]).includes(value)
  );
}

function normalizeChatMessageReference(
  value: unknown,
): ChatMessageReference | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.type !== "plan_item" || !isNonEmptyString(value.planItemId)) {
    return undefined;
  }
  return {
    type: "plan_item",
    planItemId: value.planItemId.trim(),
  };
}

export function normalizeConversationDocument(
  data: unknown,
): Conversation | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isConversationType(data.type) ||
    !isNonEmptyString(data.createdByProjectMemberId) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt) ||
    !Array.isArray(data.participantProjectMemberIds)
  ) {
    return undefined;
  }

  const participantProjectMemberIds = data.participantProjectMemberIds
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  const avatarStoragePath =
    data.avatarStoragePath === undefined || data.avatarStoragePath === null
      ? null
      : isNonEmptyString(data.avatarStoragePath)
        ? data.avatarStoragePath.trim()
        : undefined;

  if (
    avatarStoragePath === undefined ||
    (data.type === "direct" && avatarStoragePath !== null)
  ) {
    return undefined;
  }

  if (data.type === "direct" && participantProjectMemberIds.length !== 2) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    type: data.type,
    participantProjectMemberIds:
      data.type === "project"
        ? []
        : [...participantProjectMemberIds].sort((a, b) => a.localeCompare(b)),
    createdByProjectMemberId: data.createdByProjectMemberId.trim(),
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
    lastMessageAt:
      typeof data.lastMessageAt === "string" && data.lastMessageAt.trim()
        ? data.lastMessageAt.trim()
        : null,
    lastMessagePreview:
      typeof data.lastMessagePreview === "string"
        ? data.lastMessagePreview.trim() || null
        : null,
    avatarStoragePath,
  };
}

export function normalizeConversationParticipantDocument(
  data: unknown,
): ConversationParticipant | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.conversationId) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.projectMemberId) ||
    !isNonEmptyString(data.joinedAt)
  ) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    conversationId: data.conversationId.trim(),
    projectId: data.projectId.trim(),
    projectMemberId: data.projectMemberId.trim(),
    joinedAt: data.joinedAt.trim(),
    lastReadAt:
      typeof data.lastReadAt === "string" && data.lastReadAt.trim()
        ? data.lastReadAt.trim()
        : null,
  };
}

export function normalizeChatMessageDocument(
  data: unknown,
): ChatMessage | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.conversationId) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.senderProjectMemberId) ||
    typeof data.text !== "string" ||
    !isNonEmptyString(data.createdAt)
  ) {
    return undefined;
  }

  const reference = normalizeChatMessageReference(data.reference);
  if (reference === undefined) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    conversationId: data.conversationId.trim(),
    projectId: data.projectId.trim(),
    senderProjectMemberId: data.senderProjectMemberId.trim(),
    text: data.text,
    createdAt: data.createdAt.trim(),
    editedAt:
      typeof data.editedAt === "string" && data.editedAt.trim()
        ? data.editedAt.trim()
        : null,
    reference,
  };
}

export function parseCreateDirectConversationBody(
  body: unknown,
): { otherProjectMemberId: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  if (!isNonEmptyString(body.otherProjectMemberId)) {
    return undefined;
  }

  return { otherProjectMemberId: body.otherProjectMemberId.trim() };
}

export function parseProjectChatAvatarUploadUrlBody(
  body: unknown,
): { contentType: string } | undefined {
  if (!isRecord(body) || typeof body.contentType !== "string") {
    return undefined;
  }

  const contentType = body.contentType.trim().toLowerCase();
  return isAllowedProjectChatAvatarContentType(contentType)
    ? { contentType }
    : undefined;
}

export function parseProjectChatAvatarCommitBody(
  body: unknown,
): { objectId: string; contentType: string } | undefined {
  if (
    !isRecord(body) ||
    typeof body.objectId !== "string" ||
    typeof body.contentType !== "string"
  ) {
    return undefined;
  }

  const objectId = body.objectId.trim().toLowerCase();
  const contentType = body.contentType.trim().toLowerCase();
  if (
    !isProjectChatAvatarObjectId(objectId) ||
    !isAllowedProjectChatAvatarContentType(contentType)
  ) {
    return undefined;
  }

  return { objectId, contentType };
}

export type CreateChatMessageBody = {
  text: string;
  reference: ChatMessageReference | null;
};

/**
 * Text and/or plan_item reference required.
 * Whitespace-only text with no reference is invalid.
 */
export function parseCreateChatMessageBody(
  body: unknown,
): CreateChatMessageBody | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const textRaw = typeof body.text === "string" ? body.text : "";
  const text = textRaw.trim();
  if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
    return undefined;
  }

  let reference: ChatMessageReference | null = null;
  if (body.reference !== undefined && body.reference !== null) {
    const parsed = normalizeChatMessageReference(body.reference);
    if (!parsed) {
      return undefined;
    }
    reference = parsed;
  }

  if (!text && !reference) {
    return undefined;
  }

  return { text, reference };
}
