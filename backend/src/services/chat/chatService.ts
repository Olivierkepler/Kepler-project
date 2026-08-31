import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { ChatMessage } from "../../domain/chatMessage.js";
import type { ChatMessageReference } from "../../domain/chatMessage.js";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  type Conversation,
} from "../../domain/conversation.js";
import {
  createConversationParticipantId,
  createDirectConversationId,
  createProjectConversationId,
} from "../../domain/conversationId.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import {
  createChatMessage,
  createConversationIfAbsent,
  listConversationsForProject,
  listMessagesForConversation,
  updateConversationLastMessage,
  updateConversationParticipantLastRead,
  upsertConversationParticipant,
  type ListMessagesPage,
} from "../../repositories/conversationsRepository.js";
import {
  assertChatProjectAccess,
  assertConversationReadable,
  listActiveProjectMembersForChat,
  requireActiveProjectMemberById,
  type ChatAccessContext,
} from "./chatAccess.js";
import { assertPlanItemReferenceableByUser } from "./chatPlanItemReference.js";

export class ChatValidationError extends Error {
  readonly statusCode = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = "ChatValidationError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureParticipantRow(input: {
  conversationId: string;
  projectId: string;
  projectMemberId: string;
  joinedAt: string;
}): Promise<void> {
  await upsertConversationParticipant({
    id: createConversationParticipantId(
      input.conversationId,
      input.projectMemberId,
    ),
    conversationId: input.conversationId,
    projectId: input.projectId,
    projectMemberId: input.projectMemberId,
    joinedAt: input.joinedAt,
    lastReadAt: null,
  });
}

export async function listVisibleConversationsForUser(input: {
  projectId: string;
  uid: string;
}): Promise<Conversation[]> {
  const access = await assertChatProjectAccess(input.projectId, input.uid);
  const all = await listConversationsForProject(access.projectId);

  return all.filter((conversation) => {
    if (conversation.type === "project") {
      return true;
    }
    return conversation.participantProjectMemberIds.includes(
      access.membership.id,
    );
  });
}

export async function ensureProjectConversation(input: {
  projectId: string;
  uid: string;
}): Promise<{ conversation: Conversation; created: boolean }> {
  const access = await assertChatProjectAccess(input.projectId, input.uid);
  const now = nowIso();

  const result = await createConversationIfAbsent({
    id: createProjectConversationId(access.projectId),
    projectId: access.projectId,
    type: "project",
    participantProjectMemberIds: [],
    createdByProjectMemberId: access.membership.id,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
  });

  await ensureParticipantRow({
    conversationId: result.conversation.id,
    projectId: access.projectId,
    projectMemberId: access.membership.id,
    joinedAt: now,
  });

  return result;
}

export async function ensureDirectConversation(input: {
  projectId: string;
  uid: string;
  otherProjectMemberId: string;
}): Promise<{ conversation: Conversation; created: boolean }> {
  const access = await assertChatProjectAccess(input.projectId, input.uid);
  const other = await requireActiveProjectMemberById({
    projectId: access.projectId,
    projectMemberId: input.otherProjectMemberId,
  });

  if (other.id === access.membership.id) {
    throw new ChatValidationError("Cannot start a direct chat with yourself");
  }

  const now = nowIso();
  const participantIds = [access.membership.id, other.id].sort((a, b) =>
    a.localeCompare(b),
  );

  const result = await createConversationIfAbsent({
    id: createDirectConversationId(
      access.projectId,
      access.membership.id,
      other.id,
    ),
    projectId: access.projectId,
    type: "direct",
    participantProjectMemberIds: participantIds,
    createdByProjectMemberId: access.membership.id,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessagePreview: null,
  });

  await ensureParticipantRow({
    conversationId: result.conversation.id,
    projectId: access.projectId,
    projectMemberId: access.membership.id,
    joinedAt: now,
  });

  await ensureParticipantRow({
    conversationId: result.conversation.id,
    projectId: access.projectId,
    projectMemberId: other.id,
    joinedAt: now,
  });

  return result;
}

export async function listConversationMessages(input: {
  projectId: string;
  conversationId: string;
  uid: string;
  limit: number;
  cursor?: string | null;
}): Promise<ListMessagesPage & { access: ChatAccessContext }> {
  const { access } = await assertConversationReadable({
    projectId: input.projectId,
    conversationId: input.conversationId,
    uid: input.uid,
  });

  const page = await listMessagesForConversation({
    conversationId: input.conversationId,
    projectId: access.projectId,
    limit: input.limit,
    cursor: input.cursor,
  });

  return { ...page, access };
}

export async function sendConversationMessage(input: {
  projectId: string;
  conversationId: string;
  uid: string;
  text: string;
  reference?: ChatMessageReference | null;
}): Promise<ChatMessage> {
  const trimmed = input.text.trim();
  const reference = input.reference ?? null;

  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new ChatValidationError("Message text is required");
  }

  if (!trimmed && !reference) {
    throw new ChatValidationError("Message text is required");
  }

  const { access, conversation } = await assertConversationReadable({
    projectId: input.projectId,
    conversationId: input.conversationId,
    uid: input.uid,
  });

  if (access.membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (reference) {
    await assertPlanItemReferenceableByUser({
      projectId: access.projectId,
      uid: input.uid,
      reference,
    });
  }

  const createdAt = nowIso();
  const message = await createChatMessage({
    conversationId: conversation.id,
    projectId: access.projectId,
    senderProjectMemberId: access.membership.id,
    text: trimmed,
    createdAt,
    editedAt: null,
    reference,
  });

  const preview =
    trimmed ||
    (reference?.type === "plan_item" ? "Shared a Plan Item" : "Message");

  await updateConversationLastMessage({
    conversationId: conversation.id,
    lastMessageAt: createdAt,
    lastMessagePreview: preview,
    updatedAt: createdAt,
  });

  await ensureParticipantRow({
    conversationId: conversation.id,
    projectId: access.projectId,
    projectMemberId: access.membership.id,
    joinedAt: createdAt,
  });

  await updateConversationParticipantLastRead({
    conversationId: conversation.id,
    projectMemberId: access.membership.id,
    lastReadAt: createdAt,
  });

  return message;
}

export async function markConversationRead(input: {
  projectId: string;
  conversationId: string;
  uid: string;
}): Promise<void> {
  const { access, conversation } = await assertConversationReadable({
    projectId: input.projectId,
    conversationId: input.conversationId,
    uid: input.uid,
  });

  const readAt = nowIso();

  await ensureParticipantRow({
    conversationId: conversation.id,
    projectId: access.projectId,
    projectMemberId: access.membership.id,
    joinedAt: readAt,
  });

  await updateConversationParticipantLastRead({
    conversationId: conversation.id,
    projectMemberId: access.membership.id,
    lastReadAt: readAt,
  });
}

export async function getConversationMemberRoster(input: {
  projectId: string;
  conversation: Conversation;
}): Promise<ProjectMember[]> {
  if (input.conversation.type === "project") {
    return listActiveProjectMembersForChat(input.projectId);
  }

  const members: ProjectMember[] = [];
  for (const memberId of input.conversation.participantProjectMemberIds) {
    try {
      members.push(
        await requireActiveProjectMemberById({
          projectId: input.projectId,
          projectMemberId: memberId,
        }),
      );
    } catch {
      // Skip inactive/missing participants for presentation.
    }
  }
  return members;
}
