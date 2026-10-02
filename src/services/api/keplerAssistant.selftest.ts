import assert from "node:assert/strict";
import {
  parseKeplerConversationDTO,
  parseKeplerMessagePage,
  parseKeplerMessagePostResult,
} from "./keplerAssistantTypes";

const createdAt = "2026-09-20T12:00:00.000Z";
const conversationId = "conversation-1";
const userMessage = { id: "user-1", conversationId, role: "user", content: "Current progress?", createdAt };
const assistantMessage = {
  id: "assistant-1",
  conversationId,
  role: "assistant",
  content: "The latest recorded progress is 52%.",
  createdAt,
  references: [
    { kind: "plan_item", canonicalId: "remote-plan-1", label: "North wall" },
    { kind: "unrecognized_kind", canonicalId: "private-id", label: "Unknown" },
  ],
  suggestedActions: [
    { kind: "navigate", label: "Open plan item", reference: { kind: "plan_item", canonicalId: "remote-plan-1", label: "North wall" } },
    { kind: "delete", label: "Delete", reference: { kind: "project", canonicalId: "remote-project", label: "Project" } },
  ],
};

function main() {
  const conversation = parseKeplerConversationDTO({ id: conversationId, projectId: "remote-project", createdAt, updatedAt: createdAt }, "remote-project");
  assert.equal(conversation.id, conversationId);
  assert.throws(() => parseKeplerConversationDTO({ id: conversationId, projectId: "local-project", createdAt, updatedAt: createdAt }, "remote-project"));
  assert.throws(() => parseKeplerConversationDTO({ id: "", projectId: "remote-project", createdAt, updatedAt: createdAt }, "remote-project"));

  for (const status of [200, 201]) {
    const result = parseKeplerMessagePostResult({ userMessage, assistantMessage, generationStatus: "completed" }, conversationId, status);
    assert.equal(result.assistantMessage?.references?.length, 1, "unknown reference kinds are ignored");
    assert.equal(result.assistantMessage?.suggestedActions?.length, 1, "unknown actions are ignored");
  }
  const processing = parseKeplerMessagePostResult({ userMessage, assistantMessage: null, generationStatus: "processing" }, conversationId, 202);
  assert.equal(processing.assistantMessage, null);
  assert.equal(processing.generationStatus, "processing");

  const page = parseKeplerMessagePage({ items: [assistantMessage, userMessage], nextCursor: null }, conversationId);
  assert.equal(page.items.length, 2);
  assert.throws(() => parseKeplerMessagePage({ items: [{ ...userMessage, role: "system" }], nextCursor: null }, conversationId));
  assert.throws(() => parseKeplerMessagePage({ items: [{ ...userMessage, conversationId: "foreign" }], nextCursor: null }, conversationId));
  assert.throws(() => parseKeplerMessagePostResult({ userMessage, assistantMessage: null, generationStatus: "completed" }, conversationId, 201));
  assert.throws(() => parseKeplerMessagePostResult({ userMessage: { ...userMessage, content: "" }, assistantMessage, generationStatus: "completed" }, conversationId, 201));
  assert.throws(() => parseKeplerMessagePostResult({ userMessage, assistantMessage: { ...assistantMessage, createdAt: "bad-time" }, generationStatus: "completed" }, conversationId, 200));
  console.log("Kepler mobile API parsing tests passed");
}

main();
