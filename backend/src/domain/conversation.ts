/**
 * Project-scoped chat conversation (Phase Chat 1).
 *
 * Participants are ProjectMember identities — never displayName/email.
 * Conversations always belong to a Project (no global DMs).
 */

export type ConversationType = "project" | "direct";

export type Conversation = {
  id: string;
  projectId: string;
  type: ConversationType;
  /**
   * For direct: exactly two ProjectMember ids (sorted).
   * For project: empty — all active project members may participate.
   */
  participantProjectMemberIds: string[];
  createdByProjectMemberId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ConversationParticipant = {
  /** Deterministic: `${conversationId}_${projectMemberId}`. */
  id: string;
  conversationId: string;
  projectId: string;
  projectMemberId: string;
  joinedAt: string;
  lastReadAt: string | null;
};

export const CONVERSATION_TYPES: readonly ConversationType[] = [
  "project",
  "direct",
] as const;

export const MAX_CHAT_MESSAGE_LENGTH = 4000;
