import { randomUUID } from "node:crypto";

import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { ChatMessage } from "../domain/chatMessage.js";
import type {
  Conversation,
  ConversationParticipant,
} from "../domain/conversation.js";
import { createConversationParticipantId } from "../domain/conversationId.js";
import {
  normalizeChatMessageDocument,
  normalizeConversationDocument,
  normalizeConversationParticipantDocument,
} from "../validation/conversation.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: number | string; message?: string };
  if (record.code === 6 || record.code === "ALREADY_EXISTS") {
    return true;
  }
  return (
    typeof record.message === "string" &&
    record.message.includes("ALREADY_EXISTS")
  );
}

export async function getConversationById(
  conversationId: string,
): Promise<Conversation | undefined> {
  requireId(conversationId, "conversationId");
  const snapshot = await db
    .collection(COLLECTIONS.conversations)
    .doc(conversationId.trim())
    .get();
  if (!snapshot.exists) {
    return undefined;
  }
  return normalizeConversationDocument(snapshot.data());
}

export async function listConversationsForProject(
  projectId: string,
): Promise<Conversation[]> {
  requireId(projectId, "projectId");
  const snapshot = await db
    .collection(COLLECTIONS.conversations)
    .where("projectId", "==", projectId.trim())
    .get();

  return snapshot.docs
    .map((doc) => normalizeConversationDocument(doc.data()))
    .filter((item): item is Conversation => item !== undefined)
    .sort((a, b) => {
      const aTime = a.lastMessageAt ?? a.updatedAt;
      const bTime = b.lastMessageAt ?? b.updatedAt;
      return bTime.localeCompare(aTime);
    });
}

export async function createConversationIfAbsent(
  conversation: Conversation,
): Promise<{ created: boolean; conversation: Conversation }> {
  const normalized = normalizeConversationDocument(conversation);
  if (!normalized) {
    throw new Error("Invalid conversation");
  }

  const ref = db.collection(COLLECTIONS.conversations).doc(normalized.id);
  const existing = await ref.get();
  if (existing.exists) {
    const current = normalizeConversationDocument(existing.data());
    if (!current) {
      throw new Error("Corrupt conversation document");
    }
    return { created: false, conversation: current };
  }

  try {
    await ref.create(normalized);
    return { created: true, conversation: normalized };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
    const raced = await ref.get();
    const current = normalizeConversationDocument(raced.data());
    if (!current) {
      throw error;
    }
    return { created: false, conversation: current };
  }
}

export async function updateConversationLastMessage(input: {
  conversationId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  updatedAt: string;
}): Promise<void> {
  requireId(input.conversationId, "conversationId");
  await db
    .collection(COLLECTIONS.conversations)
    .doc(input.conversationId.trim())
    .update({
      lastMessageAt: input.lastMessageAt,
      lastMessagePreview: input.lastMessagePreview.slice(0, 160),
      updatedAt: input.updatedAt,
    });
}

export async function upsertConversationParticipant(
  participant: ConversationParticipant,
): Promise<ConversationParticipant> {
  const normalized = normalizeConversationParticipantDocument(participant);
  if (!normalized) {
    throw new Error("Invalid conversation participant");
  }

  const expectedId = createConversationParticipantId(
    normalized.conversationId,
    normalized.projectMemberId,
  );
  if (normalized.id !== expectedId) {
    throw new Error("Conversation participant id must be deterministic");
  }

  const ref = db
    .collection(COLLECTIONS.conversationParticipants)
    .doc(normalized.id);
  const existing = await ref.get();
  if (existing.exists) {
    const current = normalizeConversationParticipantDocument(existing.data());
    if (!current) {
      throw new Error("Corrupt conversation participant");
    }
    return current;
  }

  await ref.set(normalized);
  return normalized;
}

export async function updateConversationParticipantLastRead(input: {
  conversationId: string;
  projectMemberId: string;
  lastReadAt: string;
}): Promise<void> {
  const id = createConversationParticipantId(
    input.conversationId,
    input.projectMemberId,
  );
  const ref = db.collection(COLLECTIONS.conversationParticipants).doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    return;
  }
  await ref.update({ lastReadAt: input.lastReadAt });
}

export async function createChatMessage(
  message: Omit<ChatMessage, "id"> & { id?: string },
): Promise<ChatMessage> {
  const id = message.id?.trim() || randomUUID();
  const candidate: ChatMessage = {
    id,
    conversationId: message.conversationId.trim(),
    projectId: message.projectId.trim(),
    senderProjectMemberId: message.senderProjectMemberId.trim(),
    text: message.text,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    reference: message.reference ?? null,
  };

  const normalized = normalizeChatMessageDocument(candidate);
  if (!normalized) {
    throw new Error("Invalid chat message");
  }

  await db.collection(COLLECTIONS.messages).doc(normalized.id).set(normalized);
  return normalized;
}

export type ListMessagesPage = {
  items: ChatMessage[];
  nextCursor: string | null;
};

function encodeMessageCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeMessageCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator <= 0) {
      return null;
    }
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Newest-first page. Client reverses for chronological UI. */
export async function listMessagesForConversation(input: {
  conversationId: string;
  projectId: string;
  limit: number;
  cursor?: string | null;
}): Promise<ListMessagesPage> {
  requireId(input.conversationId, "conversationId");
  requireId(input.projectId, "projectId");

  const conversationId = input.conversationId.trim();
  const projectId = input.projectId.trim();
  const decoded = input.cursor ? decodeMessageCursor(input.cursor) : null;

  // Prefer indexed newest-first query. Fall back to equality-only + in-memory
  // sort while the composite index is building (or unavailable).
  try {
    let query = db
      .collection(COLLECTIONS.messages)
      .where("conversationId", "==", conversationId)
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(input.limit + 1);

    if (decoded) {
      query = query.startAfter(decoded.createdAt, decoded.id);
    }

    const snapshot = await query.get();
    const docs = snapshot.docs
      .map((doc) => normalizeChatMessageDocument(doc.data()))
      .filter(
        (item): item is ChatMessage =>
          item !== undefined && item.projectId === projectId,
      );

    const hasMore = docs.length > input.limit;
    const items = hasMore ? docs.slice(0, input.limit) : docs;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && last ? encodeMessageCursor(last.createdAt, last.id) : null,
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: number | string }).code
        : undefined;
    if (code !== 9 && code !== "failed-precondition") {
      throw error;
    }
  }

  const snapshot = await db
    .collection(COLLECTIONS.messages)
    .where("conversationId", "==", conversationId)
    .get();

  const sorted = snapshot.docs
    .map((doc) => normalizeChatMessageDocument(doc.data()))
    .filter(
      (item): item is ChatMessage =>
        item !== undefined && item.projectId === projectId,
    )
    .sort((a, b) => {
      const byTime = b.createdAt.localeCompare(a.createdAt);
      if (byTime !== 0) {
        return byTime;
      }
      return b.id.localeCompare(a.id);
    });

  let startIndex = 0;
  if (decoded) {
    const cursorIndex = sorted.findIndex(
      (item) =>
        item.createdAt === decoded.createdAt && item.id === decoded.id,
    );
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const page = sorted.slice(startIndex, startIndex + input.limit + 1);
  const hasMore = page.length > input.limit;
  const items = hasMore ? page.slice(0, input.limit) : page;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor:
      hasMore && last ? encodeMessageCursor(last.createdAt, last.id) : null,
  };
}
