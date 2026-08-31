/**
 * Chat message (Phase Chat 1 + 2A Plan Item references).
 * Sender identity is ProjectMember.id — never client-supplied display labels.
 *
 * References store stable remote Plan Item ids only — not a second Plan copy.
 */

export type ChatMessageReferenceType = "plan_item";

export type ChatMessageReference = {
  type: "plan_item";
  /** Canonical remote Firestore Plan Item document id. */
  planItemId: string;
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
