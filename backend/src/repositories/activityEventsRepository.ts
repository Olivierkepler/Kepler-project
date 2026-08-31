import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { ActivityEvent } from "../domain/activityEvent.js";
import { normalizeActivityEventDocument } from "../validation/activityEvent.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function activityEventsCollection() {
  return db.collection(COLLECTIONS.activityEvents);
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

export type CreateActivityEventIfAbsentResult = {
  created: boolean;
  activityEvent: ActivityEvent;
};

/**
 * Append-only create-if-absent. Document id = activityEvent.id.
 */
export async function createActivityEventIfAbsent(
  candidate: ActivityEvent,
): Promise<CreateActivityEventIfAbsentResult> {
  const normalized = normalizeActivityEventDocument(candidate);

  if (!normalized) {
    throw new Error("Invalid ActivityEvent");
  }

  requireId(normalized.id, "activityEvent.id");

  const ref = activityEventsCollection().doc(normalized.id);
  const existingSnap = await ref.get();

  if (existingSnap.exists) {
    const existing = normalizeActivityEventDocument(existingSnap.data());
    if (!existing) {
      throw new Error("Corrupt ActivityEvent document");
    }
    return { created: false, activityEvent: existing };
  }

  try {
    await ref.create(normalized);
    return { created: true, activityEvent: normalized };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const raced = await ref.get();
    const existing = normalizeActivityEventDocument(raced.data());
    if (!existing) {
      throw error;
    }
    return { created: false, activityEvent: existing };
  }
}

export async function getActivityEventById(
  activityEventId: string,
): Promise<ActivityEvent | undefined> {
  requireId(activityEventId, "activityEventId");

  const snapshot = await activityEventsCollection().doc(activityEventId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeActivityEventDocument(snapshot.data());
}

export type ListActivityEventsPage = {
  items: ActivityEvent[];
  nextCursor: string | null;
};

/**
 * Lists Activity for a project, newest first.
 * Cursor format: `${createdAt}|${id}`
 * Sorts in memory (Phase 2M.1) to avoid requiring composite indexes in tests;
 * firestore.indexes.json documents production indexes for scale.
 */
export async function listActivityEventsForProject(
  projectId: string,
  options: { limit: number; cursor?: string | null } = { limit: 50 },
): Promise<ListActivityEventsPage> {
  requireId(projectId, "projectId");

  const limit = Math.min(Math.max(1, options.limit), 100);

  const snapshot = await activityEventsCollection()
    .where("projectId", "==", projectId)
    .get();

  let items = snapshot.docs
    .map((doc) => normalizeActivityEventDocument(doc.data()))
    .filter((item): item is ActivityEvent => item !== undefined);

  items.sort((a, b) => {
    const timeCmp = b.createdAt.localeCompare(a.createdAt);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    return b.id.localeCompare(a.id);
  });

  if (options.cursor) {
    const decoded = decodeActivityCursor(options.cursor);
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
  const nextCursor =
    page.length === limit && last && items.length > limit
      ? encodeActivityCursor(last.createdAt, last.id)
      : page.length === limit && last && items.length > page.length
        ? encodeActivityCursor(last.createdAt, last.id)
        : null;

  const hasMore = items.length > page.length;

  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeActivityCursor(last.createdAt, last.id)
        : null,
  };
}

export function encodeActivityCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function decodeActivityCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const trimmed = cursor.trim();
  const sep = trimmed.indexOf("|");
  if (sep <= 0 || sep === trimmed.length - 1) {
    return null;
  }
  const createdAt = trimmed.slice(0, sep);
  const id = trimmed.slice(sep + 1);
  if (!createdAt || !id) {
    return null;
  }
  return { createdAt, id };
}
