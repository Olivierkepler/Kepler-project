import assert from "node:assert/strict";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { KeplerConversation } from "../domain/keplerConversation.js";
import type { KeplerMessage, KeplerReference } from "../domain/keplerMessage.js";
import type { KeplerProjectContext } from "../services/kepler/keplerProjectContext.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";
import { createKeplerConversationService, KeplerConversationError, validateKeplerModelResponse } from "../services/kepler/keplerConversationService.js";
import type { KeplerPage } from "../repositories/keplerConversationsRepository.js";

const allowed: KeplerReference[] = [{ kind: "project", canonicalId: "p1", label: "Boston" }, { kind: "plan_item", canonicalId: "plan-1", label: "North wall" }];
const context: KeplerProjectContext = { project: { id: "p1", name: "Boston", location: "Boston", status: "active" }, datasets: ["project"], planItems: [], workPackages: [], measurements: [], deltas: [], evidence: [], activity: [], allowedReferences: allowed };

async function main() {
  const sanitized = validateKeplerModelResponse({
    message: "Recorded facts are available.",
    references: [{ kind: "project", canonicalId: "p1" }, { kind: "plan_item", canonicalId: "foreign" }, { kind: "delta", canonicalId: "plan-1" }],
    suggestedActions: [{ kind: "navigate", label: "Open North wall", reference: { kind: "plan_item", canonicalId: "plan-1" } }, { kind: "navigate", label: "Open foreign", reference: { kind: "project", canonicalId: "foreign" } }],
  }, allowed);
  assert.deepEqual(sanitized.references, [allowed[0]]);
  assert.equal(sanitized.suggestedActions.length, 1);
  assert.equal(sanitized.suggestedActions[0]?.reference.label, "North wall", "server label replaces model text");
  assert.equal(sanitized.suggestedActions[0]?.label, "Open plan item", "action label is server-controlled navigation copy");
  assert.throws(() => validateKeplerModelResponse({ message: " ", references: [], suggestedActions: [] }, allowed));
  assert.throws(() => validateKeplerModelResponse({ message: "x".repeat(8001), references: [], suggestedActions: [] }, allowed));

  const project = { id: "p1", localProjectId: "local", ownerUid: "owner", name: "Boston", location: "Boston", status: "active" as const, progress: 0, openDeltas: 0, assignedTasks: 0 };
  const access: ProjectAccessContext = { project, currentUserId: "owner", isOwner: true, membership: null, role: "legacy_owner", accessMode: "full", assignedWorkPackageIds: [], assignedPlanItemIds: [] };
  const conversation: KeplerConversation = { id: "c1", projectId: "p1", userUid: "owner", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const messages = new Map<string, KeplerMessage>();
  let assistant: KeplerMessage | undefined;
  let generationClaims = new Set<string>();
  let calls = 0;
  const service = createKeplerConversationService({
    assertProjectAccess: async (projectId, uid) => { if (projectId !== "p1" || uid !== "owner") throw new ProjectAccessError("Project not found", 404); return access; },
    createConversation: async () => conversation,
    listConversations: async () => ({ items: [conversation], nextCursor: null } satisfies KeplerPage<KeplerConversation>),
    getConversation: async (id) => id === "c1" ? conversation : undefined,
    createUserMessage: async (input) => {
      const existing = [...messages.values()].find((item) => item.role === "user" && item.clientMessageId === input.clientMessageId);
      if (existing) return { message: existing, created: false };
      const message: KeplerMessage = { id: "u1", conversationId: "c1", projectId: "p1", role: "user", content: input.content, clientMessageId: input.clientMessageId, createdAt: input.createdAt };
      messages.set(message.id, message);
      return { message, created: true };
    },
    listMessages: async () => ({ items: [...messages.values(), ...(assistant ? [assistant] : [])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)), nextCursor: null }),
    buildContext: async () => context,
    generate: async () => { calls++; return { message: "Project facts are available.", references: [{ kind: "project", canonicalId: "p1" }, { kind: "project", canonicalId: "other-project" }], suggestedActions: [] }; },
    claim: async (user) => assistant ? { outcome: "completed", message: assistant } : generationClaims.has(user.id) ? { outcome: "in_progress" } : (generationClaims.add(user.id), { outcome: "acquired", leaseToken: "lease-1" }),
    release: async (id) => { generationClaims.delete(id); },
    persistAssistant: async ({ userMessage, content, references, suggestedActions, createdAt }) => assistant ??= { id: "a1", conversationId: userMessage.conversationId, projectId: userMessage.projectId, role: "assistant", content, references, suggestedActions, createdAt },
    now: () => "2026-01-02T00:00:00.000Z",
  });
  const first = await service.postUserMessage({ projectId: "p1", conversationId: "c1", uid: "owner", content: "What is recorded?", clientMessageId: "send-1" });
  assert.equal(first.generationStatus, "completed");
  assert.equal(first.assistantMessage?.references?.length, 1, "foreign model reference is dropped");
  assert.equal(calls, 1);
  const retry = await service.postUserMessage({ projectId: "p1", conversationId: "c1", uid: "owner", content: "What is recorded?", clientMessageId: "send-1" });
  assert.equal(retry.assistantMessage?.id, first.assistantMessage?.id);
  assert.equal(calls, 1, "retry returns persisted assistant without another model call");

  generationClaims = new Set(["u2"]);
  const inProgressService = createKeplerConversationService({
    assertProjectAccess: async () => access,
    getConversation: async () => conversation,
    createUserMessage: async (input) => ({ message: { id: "u2", conversationId: "c1", projectId: "p1", role: "user", content: input.content, clientMessageId: input.clientMessageId, createdAt: input.createdAt }, created: true }),
    claim: async () => ({ outcome: "in_progress" }),
  });
  const pending = await inProgressService.postUserMessage({ projectId: "p1", conversationId: "c1", uid: "owner", content: "Again", clientMessageId: "send-2" });
  assert.equal(pending.generationStatus, "processing");

  let persistedAfterFailure = false;
  const failingService = createKeplerConversationService({
    assertProjectAccess: async () => access,
    getConversation: async () => conversation,
    createUserMessage: async (input) => ({ message: { id: "u3", conversationId: "c1", projectId: "p1", role: "user", content: input.content, clientMessageId: input.clientMessageId, createdAt: input.createdAt }, created: true }),
    listMessages: async () => ({ items: [], nextCursor: null }),
    buildContext: async () => context,
    claim: async () => ({ outcome: "acquired", leaseToken: "lease-3" }),
    generate: async () => { throw new Error("raw provider detail must not escape"); },
    persistAssistant: async () => { persistedAfterFailure = true; throw new Error("not reached"); },
    release: async () => { generationClaims.add("released"); },
  });
  await assert.rejects(() => failingService.postUserMessage({ projectId: "p1", conversationId: "c1", uid: "owner", content: "Retry later", clientMessageId: "send-3" }), (error: unknown) => error instanceof KeplerConversationError && error.statusCode === 503 && !error.message.includes("provider detail"));
  assert.ok(generationClaims.has("released"), "generation claim is released after provider failure");
  assert.equal(persistedAfterFailure, false, "provider failure stores no fake assistant response");

  let persistenceClaimReleased = false;
  const persistenceFailure = createKeplerConversationService({
    assertProjectAccess: async () => access,
    getConversation: async () => conversation,
    createUserMessage: async (input) => ({ message: { id: "u4", conversationId: "c1", projectId: "p1", role: "user", content: input.content, clientMessageId: input.clientMessageId, createdAt: input.createdAt }, created: true }),
    listMessages: async () => ({ items: [], nextCursor: null }),
    buildContext: async () => context,
    generate: async () => ({ message: "valid response", references: [], suggestedActions: [] }),
    claim: async () => ({ outcome: "acquired", leaseToken: "lease-4" }),
    persistAssistant: async () => { throw new Error("Firestore failed"); },
    release: async () => { persistenceClaimReleased = true; },
  });
  await assert.rejects(() => persistenceFailure.postUserMessage({ projectId: "p1", conversationId: "c1", uid: "owner", content: "Persistence retry", clientMessageId: "send-4" }), (error: unknown) => error instanceof KeplerConversationError && error.statusCode === 503 && error.message === "Kepler couldn't respond right now. Please try again.");
  assert.equal(persistenceClaimReleased, true, "failed assistant persistence releases its claim");
  console.log("Kepler conversation execution tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
