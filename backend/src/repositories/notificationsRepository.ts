import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Notification } from "../domain/notification.js";
import { normalizeNotificationDocument } from "../validation/notification.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function notificationsCollection() {
  return db.collection(COLLECTIONS.notifications);
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

export type CreateNotificationIfAbsentResult = {
  created: boolean;
  notification: Notification;
};

export async function createNotificationIfAbsent(
  candidate: Notification,
): Promise<CreateNotificationIfAbsentResult> {
  const normalized = normalizeNotificationDocument(candidate);

  if (!normalized) {
    throw new Error("Invalid Notification");
  }

  requireId(normalized.id, "notification.id");

  const ref = notificationsCollection().doc(normalized.id);
  const existingSnap = await ref.get();

  if (existingSnap.exists) {
    const existing = normalizeNotificationDocument(existingSnap.data());
    if (!existing) {
      throw new Error("Corrupt Notification document");
    }
    return { created: false, notification: existing };
  }

  try {
    await ref.create(normalized);
    return { created: true, notification: normalized };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const raced = await ref.get();
    const existing = normalizeNotificationDocument(raced.data());
    if (!existing) {
      throw error;
    }
    return { created: false, notification: existing };
  }
}

export async function getNotificationById(
  notificationId: string,
): Promise<Notification | undefined> {
  requireId(notificationId, "notificationId");

  const snapshot = await notificationsCollection().doc(notificationId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeNotificationDocument(snapshot.data());
}

export type ListNotificationsPage = {
  items: Notification[];
  nextCursor: string | null;
};

export async function listNotificationsForRecipient(
  recipientUid: string,
  options: { limit: number; cursor?: string | null } = { limit: 50 },
): Promise<ListNotificationsPage> {
  requireId(recipientUid, "recipientUid");

  const limit = Math.min(Math.max(1, options.limit), 100);

  const snapshot = await notificationsCollection()
    .where("recipientUid", "==", recipientUid)
    .get();

  let items = snapshot.docs
    .map((doc) => normalizeNotificationDocument(doc.data()))
    .filter((item): item is Notification => item !== undefined);

  items.sort((a, b) => {
    const timeCmp = b.createdAt.localeCompare(a.createdAt);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    return b.id.localeCompare(a.id);
  });

  if (options.cursor) {
    const decoded = decodeNotificationCursor(options.cursor);
    if (decoded) {
      items = items.filter((item) => {
        const timeCmp = item.createdAt.localeCompare(decoded.createdAt);
        if (timeCmp < 0) {
          return true;
        }
        if (timeCmp > 0) {
          return false;
        }
        return item.id.localeCompare(decoded.id) < 0;
      });
    }
  }

  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = items.length > page.length;

  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeNotificationCursor(last.createdAt, last.id)
        : null,
  };
}

export async function countUnreadNotifications(
  recipientUid: string,
): Promise<number> {
  requireId(recipientUid, "recipientUid");

  const snapshot = await notificationsCollection()
    .where("recipientUid", "==", recipientUid)
    .get();

  let count = 0;
  for (const doc of snapshot.docs) {
    const item = normalizeNotificationDocument(doc.data());
    if (item && !item.isRead) {
      count += 1;
    }
  }

  return count;
}

export type MarkNotificationReadResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "ok"; notification: Notification };

/**
 * Idempotent mark-read. recipientUid must match the authenticated user.
 */
export async function markNotificationRead(
  notificationId: string,
  recipientUid: string,
  nowIso: string = new Date().toISOString(),
): Promise<MarkNotificationReadResult> {
  requireId(notificationId, "notificationId");
  requireId(recipientUid, "recipientUid");

  const ref = notificationsCollection().doc(notificationId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = normalizeNotificationDocument(snapshot.data());

    if (!current) {
      return { kind: "not_found" as const };
    }

    if (current.recipientUid !== recipientUid) {
      return { kind: "forbidden" as const };
    }

    if (current.isRead) {
      return { kind: "ok" as const, notification: current };
    }

    const updated: Notification = {
      ...current,
      isRead: true,
      readAt: nowIso,
    };

    tx.set(ref, updated, { merge: false });
    return { kind: "ok" as const, notification: updated };
  });
}

export async function markAllNotificationsRead(
  recipientUid: string,
  nowIso: string = new Date().toISOString(),
): Promise<number> {
  requireId(recipientUid, "recipientUid");

  const snapshot = await notificationsCollection()
    .where("recipientUid", "==", recipientUid)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    const current = normalizeNotificationDocument(doc.data());
    if (!current || current.isRead) {
      continue;
    }

    batch.set(
      doc.ref,
      {
        ...current,
        isRead: true,
        readAt: nowIso,
      },
      { merge: false },
    );
    count += 1;
  }

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

export function encodeNotificationCursor(
  createdAt: string,
  id: string,
): string {
  return `${createdAt}|${id}`;
}

export function decodeNotificationCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const trimmed = cursor.trim();
  const sep = trimmed.indexOf("|");
  if (sep <= 0 || sep === trimmed.length - 1) {
    return null;
  }
  return {
    createdAt: trimmed.slice(0, sep),
    id: trimmed.slice(sep + 1),
  };
}
