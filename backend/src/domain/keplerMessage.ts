export const KEPLER_REFERENCE_KINDS = [
  "project",
  "plan_item",
  "work_package",
  "measurement",
  "delta",
  "activity",
  "agent_run",
] as const;

export type KeplerReferenceKind = (typeof KEPLER_REFERENCE_KINDS)[number];

export type KeplerReference = {
  kind: KeplerReferenceKind;
  canonicalId: string;
  label: string;
};

/** Navigation-only actions; mutations are deliberately absent. */
export type KeplerSuggestedAction = {
  kind: "navigate";
  label: string;
  reference: KeplerReference;
};

export type KeplerMessage = {
  id: string;
  conversationId: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Present for user messages; uniqueness is conversation-scoped. */
  clientMessageId?: string;
  references?: KeplerReference[];
  suggestedActions?: KeplerSuggestedAction[];
};

export const MAX_KEPLER_ASSISTANT_MESSAGE_LENGTH = 8000;
