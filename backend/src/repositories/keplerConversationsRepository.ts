import { createHash, randomUUID } from "node:crypto";

import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { KeplerConversation } from "../domain/keplerConversation.js";
import type { KeplerMessage } from "../domain/keplerMessage.js";
import {
  decodeKeplerCursor,
  encodeKeplerCursor,
  normalizeKeplerConversation,
  normalizeKeplerMessage,
} from "../validation/keplerConversation.js";

function requireId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/")) throw new Error(`${label} is invalid`);
  return trimmed;
}

export type KeplerPage<T> = { items: T[]; nextCursor: string | null };

export async function createKeplerConversation(
  input: Omit<KeplerConversation, "id">,
): Promise<KeplerConversation> {
  const conversation = normalizeKeplerConversation({ id: randomUUID(), ...input });
  if (!conversation) throw new Error("Invalid Kepler conversation");
  await db.collection(COLLECTIONS.keplerConversations).doc(conversation.id).create(conversation);
  return conversation;
}

export async function getKeplerConversationById(id: string): Promise<KeplerConversation | undefined> {
  const snapshot = await db.collection(COLLECTIONS.keplerConversations).doc(requireId(id, "conversationId")).get();
  return snapshot.exists ? normalizeKeplerConversation(snapshot.data()) : undefined;
}

export async function listKeplerConversationsForUserProject(input: {
  userUid: string;
  projectId: string;
  limit: number;
  cursor?: string | null;
}): Promise<KeplerPage<KeplerConversation>> {
  let query = db.collection(COLLECTIONS.keplerConversations)
    .where("userUid", "==", requireId(input.userUid, "userUid"))
    .where("projectId", "==", requireId(input.projectId, "projectId"))
    .orderBy("updatedAt", "desc")
    .orderBy("id", "desc");
  if (input.cursor) {
    const cursor = decodeKeplerCursor(input.cursor);
    if (!cursor) throw new Error("Invalid conversation cursor");
    query = query.startAfter(cursor.createdAt, cursor.id);
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const records = snapshot.docs
    .map((item) => normalizeKeplerConversation(item.data()))
    .filter((item): item is KeplerConversation => !!item);
  const hasMore = records.length > input.limit;
  const items = records.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeKeplerCursor(last.updatedAt, last.id) : null,
  };
}

export type CreateKeplerUserMessageResult = {
  message: KeplerMessage;
  created: boolean;
};

/**
 * The document ID is a SHA-256 digest of conversationId + clientMessageId.
 * The transaction makes creation and the conversation timestamp update atomic;
 * retries return the original record and conflicting payload reuse is rejected.
 */
export async function createKeplerUserMessageIdempotently(input: {
  conversationId: string;
  projectId: string;
  userUid: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
}): Promise<CreateKeplerUserMessageResult> {
  const conversationId = requireId(input.conversationId, "conversationId");
  const projectId = requireId(input.projectId, "projectId");
  const digest = createHash("sha256")
    .update(`${conversationId}\u0000${input.clientMessageId}`)
    .digest("hex");
  const messageId = `kepler-user-${digest}`;
  const conversationRef = db.collection(COLLECTIONS.keplerConversations).doc(conversationId);
  const messageRef = db.collection(COLLECTIONS.keplerMessages).doc(messageId);

  return db.runTransaction(async (transaction) => {
    const [conversationSnapshot, messageSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef),
    ]);
    const conversation = conversationSnapshot.exists
      ? normalizeKeplerConversation(conversationSnapshot.data())
      : undefined;
    if (!conversation || conversation.id !== conversationId || conversation.projectId !== projectId || conversation.userUid !== input.userUid) {
      throw new Error("Kepler conversation not found");
    }

    if (messageSnapshot.exists) {
      const existing = normalizeKeplerMessage(messageSnapshot.data());
      if (!existing || existing.role !== "user" || existing.content !== input.content || existing.clientMessageId !== input.clientMessageId) {
        throw new Error("Kepler clientMessageId was already used with different content");
      }
      return { message: existing, created: false };
    }

    const message = normalizeKeplerMessage({
      id: messageId,
      conversationId,
      projectId,
      role: "user",
      content: input.content,
      createdAt: input.createdAt,
      clientMessageId: input.clientMessageId,
    });
    if (!message) throw new Error("Invalid Kepler message");
    transaction.create(messageRef, message);
    transaction.update(conversationRef, { updatedAt: input.createdAt });
    return { message, created: true };
  });
}

export async function listKeplerMessages(input: {
  conversationId: string;
  projectId: string;
  limit: number;
  cursor?: string | null;
}): Promise<KeplerPage<KeplerMessage>> {
  let query = db.collection(COLLECTIONS.keplerMessages)
    .where("conversationId", "==", requireId(input.conversationId, "conversationId"))
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc");
  if (input.cursor) {
    const cursor = decodeKeplerCursor(input.cursor);
    if (!cursor) throw new Error("Invalid message cursor");
    query = query.startAfter(cursor.createdAt, cursor.id);
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const records = snapshot.docs
    .map((item) => normalizeKeplerMessage(item.data()))
    .filter((item): item is KeplerMessage => !!item && item.projectId === input.projectId && item.conversationId === input.conversationId);
  const hasMore = records.length > input.limit;
  const items = records.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeKeplerCursor(last.createdAt, last.id) : null,
  };
}
