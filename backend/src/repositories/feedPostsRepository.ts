import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { FeedPost } from "../domain/feedPost.js";
import { isActiveFeedPost } from "../domain/feedPost.js";
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from "./activityEventsRepository.js";
import { normalizeFeedPostDocument } from "../validation/feedPost.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function feedPostsCollection() {
  return db.collection(COLLECTIONS.feedPosts);
}

export { feedPostsCollection };

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

export type CreateFeedPostIfAbsentResult = {
  created: boolean;
  post: FeedPost;
};

export async function createFeedPostIfAbsent(
  candidate: FeedPost,
): Promise<CreateFeedPostIfAbsentResult> {
  const normalized = normalizeFeedPostDocument(candidate);

  if (!normalized) {
    throw new Error("Invalid FeedPost");
  }

  requireId(normalized.id, "feedPost.id");

  const ref = feedPostsCollection().doc(normalized.id);
  const existingSnap = await ref.get();

  if (existingSnap.exists) {
    const existing = normalizeFeedPostDocument(existingSnap.data());

    if (!existing) {
      throw new Error("Corrupt FeedPost document");
    }

    return { created: false, post: existing };
  }

  try {
    await ref.create(normalized);
    return { created: true, post: normalized };
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    const raced = await ref.get();
    const existing = normalizeFeedPostDocument(raced.data());

    if (!existing) {
      throw error;
    }

    return { created: false, post: existing };
  }
}

export async function getFeedPostById(
  postId: string,
): Promise<FeedPost | undefined> {
  requireId(postId, "postId");

  const snapshot = await feedPostsCollection().doc(postId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeFeedPostDocument(snapshot.data());
}

export type ListFeedPostsPage = {
  items: FeedPost[];
  nextCursor: string | null;
};

function sortFeedPostsNewestFirst(items: FeedPost[]): FeedPost[] {
  return [...items].sort((a, b) => {
    const timeCmp = b.createdAt.localeCompare(a.createdAt);

    if (timeCmp !== 0) {
      return timeCmp;
    }

    return b.id.localeCompare(a.id);
  });
}

function paginateFeedPosts(
  items: FeedPost[],
  limit: number,
  cursor?: string | null,
): ListFeedPostsPage {
  const sorted = sortFeedPostsNewestFirst(items);

  let startIndex = 0;

  if (cursor) {
    const decoded = decodeActivityCursor(cursor);

    if (decoded) {
      const cursorIndex = sorted.findIndex(
        (item) =>
          item.createdAt === decoded.createdAt &&
          item.id === decoded.id,
      );

      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const last = page[page.length - 1];

  return {
    items: page,
    nextCursor:
      startIndex + limit < sorted.length && last
        ? encodeActivityCursor(last.createdAt, last.id)
        : null,
  };
}

export async function listFeedPostsForProject(
  projectId: string,
  options: { limit: number; cursor?: string | null } = { limit: 25 },
): Promise<ListFeedPostsPage> {
  requireId(projectId, "projectId");

  const limit = Math.min(Math.max(1, options.limit), 100);

  const snapshot = await feedPostsCollection()
    .where("projectId", "==", projectId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeFeedPostDocument(doc.data()))
    .filter(
      (item): item is FeedPost =>
        item !== undefined && isActiveFeedPost(item),
    );

  return paginateFeedPosts(items, limit, options.cursor);
}

export type UpdateFeedPostContentResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "deleted" }
  | { kind: "conflict"; post: FeedPost }
  | { kind: "ok"; post: FeedPost };

export async function updateFeedPostContent(input: {
  postId: string;
  projectId: string;
  authorUserId: string;
  text: string;
  locationLabel: string | null;
  expectedUpdatedAt?: string | null;
  nowIso: string;
}): Promise<UpdateFeedPostContentResult> {
  requireId(input.postId, "postId");

  const ref = feedPostsCollection().doc(input.postId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = normalizeFeedPostDocument(snapshot.data());

    if (!current) {
      return { kind: "not_found" as const };
    }

    if (current.projectId !== input.projectId) {
      return { kind: "not_found" as const };
    }

    if (!isActiveFeedPost(current)) {
      return { kind: "deleted" as const };
    }

    if (current.authorUserId !== input.authorUserId) {
      return { kind: "forbidden" as const };
    }

    if (
      input.expectedUpdatedAt &&
      current.updatedAt !== input.expectedUpdatedAt
    ) {
      return { kind: "conflict" as const, post: current };
    }

    const updated: FeedPost = {
      ...current,
      text: input.text,
      locationLabel: input.locationLabel,
      updatedAt: input.nowIso,
    };

    tx.set(ref, updated, { merge: false });
    return { kind: "ok" as const, post: updated };
  });
}

export type SoftDeleteFeedPostResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "ok"; post: FeedPost; alreadyDeleted: boolean };

export async function softDeleteFeedPost(input: {
  postId: string;
  projectId: string;
  authorUserId: string;
  nowIso: string;
}): Promise<SoftDeleteFeedPostResult> {
  requireId(input.postId, "postId");

  const ref = feedPostsCollection().doc(input.postId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = normalizeFeedPostDocument(snapshot.data());

    if (!current) {
      return { kind: "not_found" as const };
    }

    if (current.projectId !== input.projectId) {
      return { kind: "not_found" as const };
    }

    if (current.authorUserId !== input.authorUserId) {
      return { kind: "forbidden" as const };
    }

    if (!isActiveFeedPost(current)) {
      return {
        kind: "ok" as const,
        post: current,
        alreadyDeleted: true,
      };
    }

    const updated: FeedPost = {
      ...current,
      deletedAt: input.nowIso,
      deletedByUserId: input.authorUserId,
      updatedAt: input.nowIso,
    };

    tx.set(ref, updated, { merge: false });
    return {
      kind: "ok" as const,
      post: updated,
      alreadyDeleted: false,
    };
  });
}

export async function listFeedPostsForProjects(
  projectIds: readonly string[],
  options: { limit: number; cursor?: string | null } = { limit: 25 },
): Promise<ListFeedPostsPage> {
  const uniqueIds = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const limit = Math.min(Math.max(1, options.limit), 100);

  const snapshots = await Promise.all(
    uniqueIds.map((projectId) =>
      feedPostsCollection().where("projectId", "==", projectId).get(),
    ),
  );

  const items = snapshots
    .flatMap((snapshot) => snapshot.docs)
    .map((doc) => normalizeFeedPostDocument(doc.data()))
    .filter(
      (item): item is FeedPost =>
        item !== undefined && isActiveFeedPost(item),
    );

  return paginateFeedPosts(items, limit, options.cursor);
}
