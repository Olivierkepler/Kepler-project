import assert from "node:assert/strict";
import type { KeplerMessagePostResult } from "../../services/api/keplerAssistant";
import {
  createKeplerClientMessageId,
  createKeplerConversationState,
  keplerConversationReducer,
  keplerProjectChatAvailability,
  orderKeplerTranscript,
  type KeplerSendAttempt,
} from "./keplerConversationState";

const attempt: KeplerSendAttempt = { content: "What is the current project progress?", clientMessageId: "42a73b1e-20f0-41fc-9c45-b2b919693ee2", localMessageId: "local-42a73b1e-20f0-41fc-9c45-b2b919693ee2" };
const user = { id: "user-1", conversationId: "conversation-1", role: "user" as const, content: attempt.content, createdAt: "2026-09-20T12:00:00.000Z" };
const assistant = { id: "assistant-1", conversationId: "conversation-1", role: "assistant" as const, content: "The latest recorded progress is 52%.", createdAt: "2026-09-20T12:00:01.000Z" };

function main() {
  const generatedId = createKeplerClientMessageId(() => "42a73b1e-20f0-41fc-9c45-b2b919693ee2");
  assert.match(generatedId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(keplerProjectChatAvailability(true, null), "loading");
  assert.equal(keplerProjectChatAvailability(false, undefined), "unavailable", "missing canonical mapping disables chat");
  assert.equal(keplerProjectChatAvailability(false, "remote-project-1"), "available");

  let state = createKeplerConversationState("user-1:local-project-1");
  state = keplerConversationReducer(state, { type: "send_started", attempt, creatingConversation: true });
  assert.equal(state.status, "creating");
  assert.equal(state.messages.length, 1, "first send appears as local pending user message");
  assert.equal(state.messages[0]?.deliveryState, "sending");
  const duplicateStart = keplerConversationReducer(state, { type: "send_started", attempt, creatingConversation: true });
  assert.equal(duplicateStart.messages.length, 1, "duplicate in-flight send is ignored");
  state = keplerConversationReducer(state, { type: "conversation_created", conversationId: "conversation-1" });
  state = keplerConversationReducer(state, { type: "retry_started", creatingConversation: false });
  assert.equal(state.attempt?.clientMessageId, attempt.clientMessageId, "retry retains the same idempotency key");
  assert.equal(state.messages.length, 1, "retry does not add a second visible user message");

  const completed: KeplerMessagePostResult = { userMessage: user, assistantMessage: assistant, generationStatus: "completed" };
  state = keplerConversationReducer(state, { type: "response_received", result: completed });
  assert.equal(state.status, "idle");
  assert.equal(state.attempt, null);
  assert.deepEqual(state.messages.map((message) => message.role), ["user", "assistant"]);
  assert.equal(state.messages[0]?.deliveryState, "confirmed");

  let generationFailedState = keplerConversationReducer(createKeplerConversationState("user-1:local-project-1"), {
    type: "send_started",
    attempt,
    creatingConversation: false,
  });
  generationFailedState = keplerConversationReducer(generationFailedState, { type: "send_failed", kind: "assistant" });
  assert.equal(generationFailedState.messages[0]?.deliveryState, "confirmed", "assistant-generation failure keeps the persisted user message confirmed");
  assert.equal(generationFailedState.attempt?.clientMessageId, attempt.clientMessageId, "assistant retry keeps the same idempotency key");
  assert.equal(keplerConversationReducer(generationFailedState, { type: "retry_started", creatingConversation: false }).messages.length, 1, "assistant retry does not add another visible user message");

  const secondAttempt: KeplerSendAttempt = { content: "Another question", clientMessageId: "52c6b0a5-07bf-4d4e-88c7-d246bbcb4eb1", localMessageId: "local-processing" };
  state = keplerConversationReducer(state, { type: "send_started", attempt: secondAttempt, creatingConversation: false });
  state = keplerConversationReducer(state, { type: "response_received", result: { userMessage: { ...user, id: "user-2", content: "Another question" }, assistantMessage: null, generationStatus: "processing" } });
  assert.equal(state.status, "processing", "null assistant response remains explicitly processing");
  assert.ok(state.attempt, "processing retains retry request for safe status check");

  state = keplerConversationReducer(state, { type: "send_failed", kind: "assistant" });
  assert.equal(state.status, "failed");
  assert.equal(state.failureKind, "assistant");
  assert.equal(state.messages.filter((message) => message.role === "user").length, 2);
  assert.equal(state.messages.find((message) => message.content === "Another question")?.deliveryState, "confirmed");
  const retryState = keplerConversationReducer(state, { type: "retry_started", creatingConversation: false });
  assert.equal(retryState.attempt?.clientMessageId, secondAttempt.clientMessageId);

  const networkState = keplerConversationReducer(retryState, { type: "send_failed", kind: "network" });
  assert.equal(networkState.failureKind, "network");
  const authReset = keplerConversationReducer(networkState, { type: "scope_changed", scopeKey: "user-2:local-project-1" });
  assert.equal(authReset.messages.length, 0, "account change clears transcript");
  assert.equal(authReset.conversationId, null);
  const projectReset = keplerConversationReducer(state, { type: "scope_changed", scopeKey: "user-1:local-project-2" });
  assert.equal(projectReset.messages.length, 0, "project change clears transcript");
  assert.equal(projectReset.conversationId, null);
  const accessReset = keplerConversationReducer(state, { type: "access_revoked" });
  assert.equal(accessReset.messages.length, 0, "access revocation clears private transcript from UI state");
  assert.equal(accessReset.status, "access_denied");

  const outOfOrder = [
    { ...assistant, id: "later", createdAt: "2026-09-20T12:00:02.000Z", deliveryState: "confirmed" as const },
    { ...user, deliveryState: "confirmed" as const },
    { ...assistant, deliveryState: "confirmed" as const },
  ];
  assert.deepEqual(orderKeplerTranscript(outOfOrder).map((message) => message.id), ["user-1", "assistant-1", "later"]);
  console.log("Kepler mobile conversation state tests passed");
}

main();
