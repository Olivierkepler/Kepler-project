import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";

import { ProjectAccessError } from "../auth/projectAccess.js";
import type { KeplerConversation } from "../domain/keplerConversation.js";
import type { KeplerMessage } from "../domain/keplerMessage.js";
import { createKeplerConversationsRouter } from "../routes/keplerConversations.js";
import { createKeplerConversationService } from "../services/kepler/keplerConversationService.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";
import type { KeplerPage } from "../repositories/keplerConversationsRepository.js";
import {
  DEFAULT_KEPLER_PAGE_SIZE,
  MAX_KEPLER_MESSAGE_LENGTH,
  MAX_KEPLER_PAGE_SIZE,
  decodeKeplerCursor,
  encodeKeplerCursor,
  parseCreateKeplerMessageBody,
} from "../validation/keplerConversation.js";

type Role = "owner" | "project_admin" | "viewer" | "contractor" | "field_member";

function makeHarness() {
  const projectOwners = new Map([["p1", "owner"], ["p2", "owner2"]]);
  const memberships = new Map<string, Role>([
    ["p1:member", "field_member"],
    ["p2:member", "field_member"],
    ["p1:admin", "project_admin"],
    ["p1:viewer", "viewer"],
  ]);
  const conversations = new Map<string, KeplerConversation>();
  const messages = new Map<string, KeplerMessage>();
  const idempotency = new Map<string, string>();
  let conversationNumber = 0;
  let messageNumber = 0;
  let tick = 0;

  const service = createKeplerConversationService({
    assertProjectAccess: async (projectId, uid) => {
      const owner = projectOwners.get(projectId);
      const role = memberships.get(`${projectId}:${uid}`);
      if (!owner || (owner !== uid && !role)) throw new ProjectAccessError("Project not found", 404);
      return {
        project: { id: projectId } as ProjectAccessContext["project"],
        currentUserId: uid,
        isOwner: owner === uid,
        membership: null,
        role: owner === uid ? "owner" : role!,
        accessMode: role === "contractor" || role === "field_member" ? "assigned_scope" : "full",
        assignedWorkPackageIds: [],
        assignedPlanItemIds: [],
      };
    },
    createConversation: async (input) => {
      const id = `conversation-${++conversationNumber}`;
      const record = { id, ...input };
      conversations.set(id, record);
      return record;
    },
    listConversations: async (input): Promise<KeplerPage<KeplerConversation>> => {
      let items = [...conversations.values()]
        .filter((item) => item.userUid === input.userUid && item.projectId === input.projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
      if (input.cursor) {
        const cursor = decodeKeplerCursor(input.cursor);
        assert.ok(cursor);
        items = items.filter((item) => item.updatedAt < cursor.createdAt || (item.updatedAt === cursor.createdAt && item.id < cursor.id));
      }
      const hasMore = items.length > input.limit;
      items = items.slice(0, input.limit);
      const last = items.at(-1);
      return { items, nextCursor: hasMore && last ? encodeKeplerCursor(last.updatedAt, last.id) : null };
    },
    getConversation: async (id) => conversations.get(id),
    createUserMessage: async (input) => {
      const key = `${input.conversationId}:${input.clientMessageId}`;
      const existingId = idempotency.get(key);
      if (existingId) {
        const existing = messages.get(existingId)!;
        if (existing.content !== input.content) throw new Error("Kepler clientMessageId was already used with different content");
        return { message: existing, created: false };
      }
      const message: KeplerMessage = {
        id: `message-${++messageNumber}`,
        conversationId: input.conversationId,
        projectId: input.projectId,
        role: "user",
        content: input.content,
        createdAt: input.createdAt,
        clientMessageId: input.clientMessageId,
      };
      idempotency.set(key, message.id);
      messages.set(message.id, message);
      const conversation = conversations.get(input.conversationId)!;
      conversations.set(conversation.id, { ...conversation, updatedAt: input.createdAt });
      return { message, created: true };
    },
    listMessages: async (input): Promise<KeplerPage<KeplerMessage>> => {
      let items = [...messages.values()]
        .filter((item) => item.conversationId === input.conversationId && item.projectId === input.projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      if (input.cursor) {
        const cursor = decodeKeplerCursor(input.cursor);
        assert.ok(cursor);
        items = items.filter((item) => item.createdAt < cursor.createdAt || (item.createdAt === cursor.createdAt && item.id < cursor.id));
      }
      const hasMore = items.length > input.limit;
      items = items.slice(0, input.limit);
      const last = items.at(-1);
      return { items, nextCursor: hasMore && last ? encodeKeplerCursor(last.createdAt, last.id) : null };
    },
    buildContext: async ({ access }) => ({
      project: { id: access.project.id, name: "Test", location: "", status: "active" }, datasets: [],
      planItems: [], workPackages: [], measurements: [], deltas: [], evidence: [], activity: [],
      allowedReferences: [{ kind: "project", canonicalId: access.project.id, label: "Test" }],
    }),
    generate: async () => ({ message: "Test response", references: [], suggestedActions: [] }),
    claim: async (userMessage) => {
      const id = `assistant-for-${userMessage.id}`;
      const existing = messages.get(id);
      if (existing) return { outcome: "completed" as const, message: existing };
      return { outcome: "acquired" as const, leaseToken: "test-lease" };
    },
    release: async () => undefined,
    persistAssistant: async ({ userMessage, content, references, suggestedActions, createdAt }) => {
      const id = `assistant-for-${userMessage.id}`;
      const existing = messages.get(id);
      if (existing) return existing;
      const assistant: KeplerMessage = { id, conversationId: userMessage.conversationId, projectId: userMessage.projectId, role: "assistant", content, createdAt, references, suggestedActions };
      messages.set(id, assistant);
      return assistant;
    },
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  });

  return { service, memberships, conversations, messages };
}

async function main() {
  const harness = makeHarness();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const token = req.header("Authorization")?.replace(/^Bearer\s+/, "");
    if (token) (req as typeof req & { user?: { uid: string } }).user = { uid: token };
    next();
  });
  app.use(createKeplerConversationsRouter(harness.service));
  const server: Server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  async function call(path: string, options: { uid?: string; method?: string; body?: unknown } = {}) {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.uid ? { Authorization: `Bearer ${options.uid}` } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }
  const path = "/projects/p1/kepler/conversations";

  try {
    assert.equal((await call(path, { method: "POST" })).status, 401, "unauthenticated create rejected");
    const ownerCreate = await call(path, { uid: "owner", method: "POST" });
    assert.equal(ownerCreate.status, 201, "project owner may create");
    const ownerConversation = ownerCreate.body as unknown as KeplerConversation;
    assert.equal(ownerConversation.userUid, undefined, "DTO omits private owner UID");
    const ownerMessagePath = `${path}/${ownerConversation.id}/messages`;
    assert.equal((await call(ownerMessagePath, { uid: "owner", method: "POST", body: { content: "Owner's private question", clientMessageId: "owner-send" } })).status, 201);
    assert.equal((await call(ownerMessagePath, { uid: "owner" })).status, 200, "conversation owner can read their own messages");

    const memberCreate = await call(path, { uid: "member", method: "POST" });
    assert.equal(memberCreate.status, 201, "active assigned-scope member may create");
    const memberConversation = memberCreate.body as unknown as KeplerConversation;
    const adminCreate = await call(path, { uid: "admin", method: "POST" });
    assert.equal(adminCreate.status, 201, "project admin may create");
    const viewerCreate = await call(path, { uid: "viewer", method: "POST" });
    assert.equal(viewerCreate.status, 201, "viewer may create");
    assert.equal((await call(path, { uid: "intruder", method: "POST" })).status, 404, "no project access rejected");

    const memberPath = `${path}/${memberConversation.id}/messages`;
    const first = await call(memberPath, { uid: "member", method: "POST", body: { content: "  Check the installed wall  ", clientMessageId: "send-1" } });
    assert.equal(first.status, 201);
    assert.equal((first.body.assistantMessage as Record<string, unknown>).content, "Test response", "injected assistant response is persisted");
    const userMessage = first.body.userMessage as Record<string, unknown>;
    assert.equal(userMessage.content, "Check the installed wall");
    assert.equal(userMessage.role, "user");
    assert.equal(userMessage.clientMessageId, undefined, "idempotency token is not exposed");

    assert.equal((await call(`${path}/${ownerConversation.id}/messages`, { uid: "admin" })).status, 404, "another project member cannot read private conversation");
    assert.equal((await call(`${path}/${memberConversation.id}/messages`, { uid: "owner" })).status, 404, "project owner cannot read member private conversation");
    assert.equal((await call(`${path}/${memberConversation.id}/messages`, { uid: "member" })).status, 200);
    assert.equal((await call(`/projects/p2/kepler/conversations/${memberConversation.id}/messages`, { uid: "member" })).status, 404, "cross-project route is hidden");
    const memberList = await call(path, { uid: "member" });
    assert.deepEqual((memberList.body.items as Array<Record<string, unknown>>).map((item) => item.id), [memberConversation.id], "list is private and project-scoped");
    const ownerList = await call(path, { uid: "owner" });
    assert.deepEqual((ownerList.body.items as Array<Record<string, unknown>>).map((item) => item.id), [ownerConversation.id], "owner lists only their own conversation");
    const p2ConversationResponse = await call("/projects/p2/kepler/conversations", { uid: "member", method: "POST" });
    const p2Conversation = p2ConversationResponse.body as unknown as KeplerConversation;
    assert.equal((await call(`${path}/${p2Conversation.id}/messages`, { uid: "member" })).status, 404, "conversation from another project is not accessible through this project route");

    const retry = await call(memberPath, { uid: "member", method: "POST", body: { content: "Check the installed wall", clientMessageId: "send-1" } });
    assert.equal(retry.status, 200, "retry returns existing message");
    assert.equal((retry.body.userMessage as Record<string, unknown>).id, userMessage.id);
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => call(memberPath, { uid: "member", method: "POST", body: { content: "Check the installed wall", clientMessageId: "send-1" } })));
    assert.equal(new Set(concurrent.map((item) => (item.body.userMessage as Record<string, unknown>).id)).size, 1, "concurrent retry stays idempotent at the API boundary");
    assert.equal((await call(memberPath, { uid: "member", method: "POST", body: { content: "Different text", clientMessageId: "send-1" } })).status, 409);

    const secondConversation = await call(path, { uid: "member", method: "POST" });
    const secondId = (secondConversation.body as unknown as KeplerConversation).id;
    assert.equal((await call(`${path}/${secondId}/messages`, { uid: "member", method: "POST", body: { content: "Other thread", clientMessageId: "send-1" } })).status, 201, "idempotency is scoped to conversation");

    const invalidBodies = [
      { content: "", clientMessageId: "x" },
      { content: "   ", clientMessageId: "x" },
      { content: "x".repeat(MAX_KEPLER_MESSAGE_LENGTH + 1), clientMessageId: "x" },
      { content: "valid" },
      { content: "valid", clientMessageId: " " },
      { content: "valid", clientMessageId: "x".repeat(129) },
      { content: "valid", clientMessageId: "x", role: "assistant" },
      { content: "valid", clientMessageId: "x", userUid: "owner" },
      { content: "valid", clientMessageId: "x", references: [{ kind: "project", canonicalId: "p1", label: "Project" }] },
      { content: "valid", clientMessageId: "x", suggestedActions: [] },
    ];
    for (const body of invalidBodies) assert.equal((await call(memberPath, { uid: "member", method: "POST", body })).status, 400, "malformed or privileged fields rejected");
    assert.equal(parseCreateKeplerMessageBody({ content: "ok", clientMessageId: "ok" })?.content, "ok");
    assert.equal(DEFAULT_KEPLER_PAGE_SIZE, 20);
    assert.equal(MAX_KEPLER_PAGE_SIZE, 50);

    for (let index = 0; index < 80; index += 1) {
      const result = await call(`${path}/${secondId}/messages`, { uid: "member", method: "POST", body: { content: `message ${index}`, clientMessageId: `page-${index}` } });
      assert.ok(result.status === 201 || result.status === 200);
    }
    const firstPage = await call(`${path}/${secondId}/messages`, { uid: "member" });
    assert.equal((firstPage.body.items as unknown[]).length, DEFAULT_KEPLER_PAGE_SIZE, "default page bounded");
    assert.ok(typeof firstPage.body.nextCursor === "string");
    const nextPage = await call(`${path}/${secondId}/messages?limit=50&cursor=${encodeURIComponent(String(firstPage.body.nextCursor))}`, { uid: "member" });
    assert.equal((nextPage.body.items as unknown[]).length, MAX_KEPLER_PAGE_SIZE, "max page bounded");
    const firstIds = new Set((firstPage.body.items as Array<Record<string, unknown>>).map((item) => item.id));
    assert.ok((nextPage.body.items as Array<Record<string, unknown>>).every((item) => !firstIds.has(item.id)), "cursor has no duplicates");
    assert.equal((await call(`${path}/${secondId}/messages?limit=51`, { uid: "member" })).status, 400, "oversized page rejected");
    assert.equal((await call(`${path}/${secondId}/messages?cursor=bad`, { uid: "member" })).status, 400, "malformed cursor rejected");

    for (let index = 0; index < 25; index += 1) {
      assert.equal((await call(path, { uid: "member", method: "POST" })).status, 201);
    }
    const conversationPage = await call(`${path}?limit=20`, { uid: "member" });
    assert.equal((conversationPage.body.items as unknown[]).length, 20, "conversation page is bounded");
    assert.ok(typeof conversationPage.body.nextCursor === "string");
    const conversationNextPage = await call(`${path}?limit=20&cursor=${encodeURIComponent(String(conversationPage.body.nextCursor))}`, { uid: "member" });
    const conversationPageIds = new Set((conversationPage.body.items as Array<Record<string, unknown>>).map((item) => item.id));
    assert.ok((conversationNextPage.body.items as Array<Record<string, unknown>>).every((item) => !conversationPageIds.has(item.id)), "conversation cursor has no duplicates");

    harness.memberships.delete("p1:member");
    assert.equal((await call(`${path}/${memberConversation.id}/messages`, { uid: "member" })).status, 404, "revoked project access blocks existing private history");
    assert.equal((await call(path, { uid: "member" })).status, 404, "revoked access also blocks listing");

    console.log("Kepler conversation API self-test passed (auth, privacy, validation, idempotency, pagination, revocation).");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
