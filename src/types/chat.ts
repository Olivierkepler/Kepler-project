export type ConversationType = "project" | "direct";

export type ChatMessageReference = {
  type: "plan_item";
  /** Canonical remote Plan Item document id. */
  planItemId: string;
};

export type Conversation = {
  id: string;
  projectId: string;
  type: ConversationType;
  participantProjectMemberIds: string[];
  createdByProjectMemberId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  projectId: string;
  senderProjectMemberId: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  reference?: ChatMessageReference | null;
};

export type ChatParticipantPresentation = {
  projectMemberId: string;
  userId: string;
  role: string;
  displayName: string | null;
  email: string | null;
};

/** Receiver-scoped Plan Item card payload (never leaks unauthorized fields). */
export type ChatPlanItemReferencePresentation = {
  planItemId: string;
  available: boolean;
  label: string | null;
  typeLabel: string | null;
  plannedValue: number | null;
  unit: string | null;
  workPackageName: string | null;
  statusLabel: string | null;
  latestFieldValue: number | null;
  variance: number | null;
};

export type ConversationMessagesPage = {
  items: ChatMessage[];
  nextCursor: string | null;
  conversation: Conversation;
  currentProjectMemberId: string;
  participants: ChatParticipantPresentation[];
  referencePresentations: Record<string, ChatPlanItemReferencePresentation>;
};
