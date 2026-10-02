import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { KeplerConversation } from "../../domain/keplerConversation.js";
import type { KeplerMessage } from "../../domain/keplerMessage.js";
import {
  createKeplerConversation,
  createKeplerUserMessageIdempotently,
  getKeplerConversationById,
  listKeplerConversationsForUserProject,
  listKeplerMessages,
  type KeplerPage,
} from "../../repositories/keplerConversationsRepository.js";
import { assertProjectAccessContext } from "../collaboration/projectAccessScope.js";

export class KeplerConversationError extends Error {
  constructor(readonly statusCode: 400 | 401 | 404 | 409, message: string) {
    super(message);
    this.name = "KeplerConversationError";
  }
}

type Dependencies = {
  assertProjectAccess(projectId: string, uid: string): Promise<unknown>;
  createConversation(input: Omit<KeplerConversation, "id">): Promise<KeplerConversation>;
  listConversations(input: { userUid: string; projectId: string; limit: number; cursor?: string | null }): Promise<KeplerPage<KeplerConversation>>;
  getConversation(id: string): Promise<KeplerConversation | undefined>;
  createUserMessage(input: { conversationId: string; projectId: string; userUid: string; clientMessageId: string; content: string; createdAt: string }): Promise<{ message: KeplerMessage; created: boolean }>;
  listMessages(input: { conversationId: string; projectId: string; limit: number; cursor?: string | null }): Promise<KeplerPage<KeplerMessage>>;
  now(): string;
};

const defaults: Dependencies = {
  assertProjectAccess: assertProjectAccessContext,
  createConversation: createKeplerConversation,
  listConversations: listKeplerConversationsForUserProject,
  getConversation: getKeplerConversationById,
  createUserMessage: createKeplerUserMessageIdempotently,
  listMessages: listKeplerMessages,
  now: () => new Date().toISOString(),
};

function assertIds(projectId: string, uid: string): void {
  if (!projectId.trim() || projectId.includes("/")) throw new KeplerConversationError(404, "Project not found");
  if (!uid.trim()) throw new KeplerConversationError(401, "Unauthorized");
}

function assertOwnedConversation(input: {
  conversation: KeplerConversation | undefined;
  projectId: string;
  uid: string;
}): KeplerConversation {
  const item = input.conversation;
  if (!item || item.projectId !== input.projectId || item.userUid !== input.uid) {
    throw new ProjectAccessError("Conversation not found", 404);
  }
  return item;
}

export function createKeplerConversationService(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  return {
    async create(input: { projectId: string; uid: string }): Promise<KeplerConversation> {
      assertIds(input.projectId, input.uid);
      try {
        const access = await deps.assertProjectAccess(input.projectId, input.uid) as { project?: { id?: string } };
        const canonicalProjectId = access.project?.id ?? input.projectId;
        if (canonicalProjectId !== input.projectId) throw new ProjectAccessError("Project not found", 404);
        const now = deps.now();
        return deps.createConversation({ projectId: canonicalProjectId, userUid: input.uid, createdAt: now, updatedAt: now });
      } catch (error) {
        if (error instanceof ProjectAccessError) throw error;
        throw error;
      }
    },

    async list(input: { projectId: string; uid: string; limit: number; cursor?: string | null }) {
      assertIds(input.projectId, input.uid);
      const access = await deps.assertProjectAccess(input.projectId, input.uid) as { project?: { id?: string } };
      if (access.project?.id && access.project.id !== input.projectId) throw new ProjectAccessError("Project not found", 404);
      return deps.listConversations({ userUid: input.uid, projectId: input.projectId, limit: input.limit, cursor: input.cursor });
    },

    async postUserMessage(input: { projectId: string; conversationId: string; uid: string; content: string; clientMessageId: string }) {
      assertIds(input.projectId, input.uid);
      if (!input.conversationId.trim() || input.conversationId.includes("/")) throw new ProjectAccessError("Conversation not found", 404);
      await deps.assertProjectAccess(input.projectId, input.uid);
      const conversation = assertOwnedConversation({
        conversation: await deps.getConversation(input.conversationId),
        projectId: input.projectId,
        uid: input.uid,
      });
      const result = await deps.createUserMessage({
        conversationId: conversation.id,
        projectId: conversation.projectId,
        userUid: input.uid,
        clientMessageId: input.clientMessageId,
        content: input.content,
        createdAt: deps.now(),
      }).catch((error: unknown) => {
        if (error instanceof Error && error.message.includes("already used with different content")) {
          throw new KeplerConversationError(409, "clientMessageId conflicts with an existing message");
        }
        if (error instanceof Error && error.message === "Kepler conversation not found") {
          throw new ProjectAccessError("Conversation not found", 404);
        }
        throw error;
      });
      return { message: result.message, created: result.created, assistantMessage: null };
    },

    async messages(input: { projectId: string; conversationId: string; uid: string; limit: number; cursor?: string | null }) {
      assertIds(input.projectId, input.uid);
      if (!input.conversationId.trim() || input.conversationId.includes("/")) throw new ProjectAccessError("Conversation not found", 404);
      await deps.assertProjectAccess(input.projectId, input.uid);
      const conversation = assertOwnedConversation({
        conversation: await deps.getConversation(input.conversationId),
        projectId: input.projectId,
        uid: input.uid,
      });
      return deps.listMessages({ conversationId: conversation.id, projectId: conversation.projectId, limit: input.limit, cursor: input.cursor });
    },
  };
}

export const keplerConversationService = createKeplerConversationService();
