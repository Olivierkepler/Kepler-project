import {
  createDirectConversationId,
  createProjectConversationId,
} from "../domain/conversationId.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const projectId = "proj_boston_office";
const memberA = `${projectId}_userA`;
const memberB = `${projectId}_userB`;

const projectChatA = createProjectConversationId(projectId);
const projectChatB = createProjectConversationId(projectId);
assert(projectChatA === projectChatB, "project chat id is deterministic");
assert(projectChatA === `pch_${projectId}`, "project chat id format");

const directAB = createDirectConversationId(projectId, memberA, memberB);
const directBA = createDirectConversationId(projectId, memberB, memberA);
assert(directAB === directBA, "direct chat id is order-independent");
assert(directAB.startsWith(`dch_${projectId}_`), "direct chat id prefix");

let threw = false;
try {
  createDirectConversationId(projectId, memberA, memberA);
} catch {
  threw = true;
}
assert(threw, "direct chat rejects identical members");

console.log("phaseChat1ConversationIdTest: ok");
