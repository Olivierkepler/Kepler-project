import type { KeplerConversation } from "../domain/keplerConversation.js";
import type { KeplerMessage } from "../domain/keplerMessage.js";

export type KeplerConversationDTO = Pick<KeplerConversation, "id" | "projectId" | "createdAt" | "updatedAt">;
export type KeplerMessageDTO = Pick<KeplerMessage, "id" | "conversationId" | "role" | "content" | "createdAt" | "references" | "suggestedActions">;

export function toKeplerConversationDTO(value: KeplerConversation): KeplerConversationDTO {
  return { id: value.id, projectId: value.projectId, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

export function toKeplerMessageDTO(value: KeplerMessage): KeplerMessageDTO {
  return {
    id: value.id,
    conversationId: value.conversationId,
    role: value.role,
    content: value.content,
    createdAt: value.createdAt,
    ...(value.references ? { references: value.references } : {}),
    ...(value.suggestedActions ? { suggestedActions: value.suggestedActions } : {}),
  };
}
