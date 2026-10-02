import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { KeplerConversation } from "../../domain/keplerConversation.js";
import type { KeplerMessage } from "../../domain/keplerMessage.js";
import type { KeplerReference, KeplerSuggestedAction } from "../../domain/keplerMessage.js";
import {
  acquireKeplerAssistantGeneration,
  createKeplerAssistantMessageIdempotently,
  createKeplerConversation,
  createKeplerUserMessageIdempotently,
  getKeplerConversationById,
  listKeplerConversationsForUserProject,
  listKeplerMessages,
  releaseKeplerAssistantGeneration,
  type KeplerPage,
} from "../../repositories/keplerConversationsRepository.js";
import { assertProjectAccessContext } from "../collaboration/projectAccessScope.js";
import type { ProjectAccessContext } from "../collaboration/projectAccessScope.js";
import { buildKeplerProjectContext, type KeplerProjectContext } from "./keplerProjectContext.js";
import { buildKeplerAgentRequest, createKeplerAgentCaller, type KeplerAgentCaller, type KeplerAgentRequest } from "./keplerAgentClient.js";
import { loadKeplerAgentServiceUrl } from "../../config/agentEnv.js";

export class KeplerConversationError extends Error {
  constructor(readonly statusCode: 400 | 401 | 404 | 409 | 503, message: string) {
    super(message);
    this.name = "KeplerConversationError";
  }
}

type Dependencies = {
  assertProjectAccess(projectId: string, uid: string): Promise<ProjectAccessContext>;
  createConversation(input: Omit<KeplerConversation, "id">): Promise<KeplerConversation>;
  listConversations(input: { userUid: string; projectId: string; limit: number; cursor?: string | null }): Promise<KeplerPage<KeplerConversation>>;
  getConversation(id: string): Promise<KeplerConversation | undefined>;
  createUserMessage(input: { conversationId: string; projectId: string; userUid: string; clientMessageId: string; content: string; createdAt: string }): Promise<{ message: KeplerMessage; created: boolean }>;
  listMessages(input: { conversationId: string; projectId: string; limit: number; cursor?: string | null }): Promise<KeplerPage<KeplerMessage>>;
  buildContext(input: { access: ProjectAccessContext; question: string }): Promise<KeplerProjectContext>;
  generate(input: KeplerAgentRequest): Promise<unknown>;
  claim(userMessage: KeplerMessage): Promise<{ outcome: "acquired"; leaseToken: string } | { outcome: "in_progress" } | { outcome: "completed"; message: KeplerMessage }>;
  release(userMessageId: string, leaseToken: string): Promise<void>;
  persistAssistant(input: { userMessage: KeplerMessage; userUid: string; leaseToken: string; content: string; references?: KeplerReference[]; suggestedActions?: KeplerSuggestedAction[]; createdAt: string }): Promise<KeplerMessage>;
  now(): string;
};

const defaults: Dependencies = {
  assertProjectAccess: assertProjectAccessContext,
  createConversation: createKeplerConversation,
  listConversations: listKeplerConversationsForUserProject,
  getConversation: getKeplerConversationById,
  createUserMessage: createKeplerUserMessageIdempotently,
  listMessages: listKeplerMessages,
  buildContext: ({ access, question }) => buildKeplerProjectContext({ access, question }),
  generate: (input) => createKeplerAgentCaller({ agentServiceUrl: loadKeplerAgentServiceUrl() })(input),
  claim: (userMessage) => acquireKeplerAssistantGeneration({ userMessage }),
  release: releaseKeplerAssistantGeneration,
  persistAssistant: createKeplerAssistantMessageIdempotently,
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
        const access = await deps.assertProjectAccess(input.projectId, input.uid);
        const canonicalProjectId = access.project.id;
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
      const access = await deps.assertProjectAccess(input.projectId, input.uid);
      if (access.project.id !== input.projectId) throw new ProjectAccessError("Project not found", 404);
      return deps.listConversations({ userUid: input.uid, projectId: input.projectId, limit: input.limit, cursor: input.cursor });
    },

    async postUserMessage(input: { projectId: string; conversationId: string; uid: string; content: string; clientMessageId: string }) {
      assertIds(input.projectId, input.uid);
      if (!input.conversationId.trim() || input.conversationId.includes("/")) throw new ProjectAccessError("Conversation not found", 404);
      const access = await deps.assertProjectAccess(input.projectId, input.uid);
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
      const claim = await deps.claim(result.message);
      if (claim.outcome === "completed") {
        return { message: result.message, created: result.created, assistantMessage: claim.message, generationStatus: "completed" as const };
      }
      if (claim.outcome === "in_progress") {
        return { message: result.message, created: result.created, assistantMessage: null, generationStatus: "processing" as const };
      }
      try {
        const context = await deps.buildContext({ access, question: result.message.content });
        const historyPage = await deps.listMessages({ conversationId: conversation.id, projectId: conversation.projectId, limit: 10 });
        const conversationHistory = historyPage.items
          .filter((item) => item.id !== result.message.id)
          .reverse()
          .map((item) => ({ role: item.role, content: item.content.slice(-1200) })) as Array<{ role: "user" | "assistant"; content: string }>;
        const agentRequest = buildKeplerAgentRequest({
          question: result.message.content,
          conversationHistory,
          projectContext: context,
        });
        const modelResult = await deps.generate(agentRequest);
        const validated = validateKeplerModelResponse(modelResult, agentRequest.allowedReferences);
        const assistantMessage = await deps.persistAssistant({
          userMessage: result.message,
          userUid: input.uid,
          leaseToken: claim.leaseToken,
          content: validated.message,
          references: validated.references,
          suggestedActions: validated.suggestedActions,
          createdAt: deps.now(),
        });
        return { message: result.message, created: result.created, assistantMessage, generationStatus: "completed" as const };
      } catch {
        await deps.release(result.message.id, claim.leaseToken).catch(() => undefined);
        throw new KeplerConversationError(503, "Kepler couldn't respond right now. Please try again.");
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateKeplerModelResponse(value: unknown, allowedReferences: readonly KeplerReference[]): {
  message: string; references: KeplerReference[]; suggestedActions: KeplerSuggestedAction[];
} {
  if (!isRecord(value) || typeof value.message !== "string") throw new Error("Invalid Kepler response");
  const message = value.message.trim();
  if (!message || message.length > 8000 || !Array.isArray(value.references) || !Array.isArray(value.suggestedActions)) throw new Error("Invalid Kepler response");
  const catalog = new Map(allowedReferences.map((item) => [`${item.kind}\u0000${item.canonicalId}`, item]));
  const references: KeplerReference[] = [];
  for (const item of value.references.slice(0, 10)) {
    if (!isRecord(item) || typeof item.kind !== "string" || typeof item.canonicalId !== "string") continue;
    const authorized = catalog.get(`${item.kind}\u0000${item.canonicalId}`);
    if (authorized && !references.some((existing) => existing.kind === authorized.kind && existing.canonicalId === authorized.canonicalId)) references.push(authorized);
  }
  const suggestedActions: KeplerSuggestedAction[] = [];
  const actionLabelByKind: Record<KeplerReference["kind"], string> = {
    project: "Open project", plan_item: "Open plan item", work_package: "Open work package",
    measurement: "Open measurement", delta: "Open Delta", activity: "Open activity", agent_run: "Open agent run",
  };
  for (const item of value.suggestedActions.slice(0, 5)) {
    if (!isRecord(item) || item.kind !== "navigate" || typeof item.label !== "string" || !item.label.trim() || !isRecord(item.reference) || typeof item.reference.kind !== "string" || typeof item.reference.canonicalId !== "string") continue;
    const authorized = catalog.get(`${item.reference.kind}\u0000${item.reference.canonicalId}`);
    if (!authorized) continue;
    suggestedActions.push({ kind: "navigate", label: actionLabelByKind[authorized.kind], reference: authorized });
  }
  return { message, references, suggestedActions };
}
export const keplerConversationService = createKeplerConversationService();
