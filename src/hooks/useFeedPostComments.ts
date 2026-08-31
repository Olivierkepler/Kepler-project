import { useCallback, useEffect, useRef, useState } from "react";

import {
  createRemoteFeedPostComment,
  getRemoteFeedPostComments,
  MAX_FEED_POST_COMMENT_LENGTH,
  type RemoteFeedPostComment,
} from "../services/api/feedPosts";

const DEFAULT_LIMIT = 30;

export type UseFeedPostCommentsResult = {
  comments: RemoteFeedPostComment[];
  loading: boolean;
  loadingMore: boolean;
  sending: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sendComment: (text: string) => Promise<RemoteFeedPostComment | null>;
  refresh: () => Promise<void>;
};

export default function useFeedPostComments(input: {
  projectId: string | null;
  postId: string | null;
  enabled: boolean;
}): UseFeedPostCommentsResult {
  const [comments, setComments] = useState<
    RemoteFeedPostComment[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );
  const [nextCursor, setNextCursor] = useState<
    string | null
  >(null);

  const loadingMoreRef = useRef(false);

  const loadInitial = useCallback(async () => {
    if (!input.enabled || !input.projectId || !input.postId) {
      setComments([]);
      setNextCursor(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const page = await getRemoteFeedPostComments(
        input.projectId,
        input.postId,
        { limit: DEFAULT_LIMIT },
      );

      setComments(page.items);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Comments could not be loaded.";

      setError(message);
      setComments([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [input.enabled, input.postId, input.projectId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const refresh = useCallback(async () => {
    await loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (
      !input.projectId ||
      !input.postId ||
      !nextCursor ||
      loadingMoreRef.current
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const page = await getRemoteFeedPostComments(
        input.projectId,
        input.postId,
        {
          limit: DEFAULT_LIMIT,
          cursor: nextCursor,
        },
      );

      setComments((current) => {
        const seen = new Set(
          current.map((comment) => comment.id),
        );
        const merged = [...current];

        for (const comment of page.items) {
          if (!seen.has(comment.id)) {
            merged.push(comment);
            seen.add(comment.id);
          }
        }

        return merged;
      });

      setNextCursor(page.nextCursor);
    } catch {
      // Keep existing comments visible.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [input.postId, input.projectId, nextCursor]);

  const sendComment = useCallback(
    async (
      text: string,
    ): Promise<RemoteFeedPostComment | null> => {
      if (!input.projectId || !input.postId || sending) {
        return null;
      }

      const trimmed = text.trim();

      if (
        trimmed.length === 0 ||
        trimmed.length > MAX_FEED_POST_COMMENT_LENGTH
      ) {
        return null;
      }

      setSending(true);
      setError(null);

      try {
        const created = await createRemoteFeedPostComment(
          input.projectId,
          input.postId,
          trimmed,
        );

        setComments((current) => {
          if (
            current.some(
              (comment) => comment.id === created.id,
            )
          ) {
            return current;
          }

          return [...current, created];
        });

        return created;
      } catch (sendError) {
        const message =
          sendError instanceof Error
            ? sendError.message
            : "Unable to post comment.";

        setError(message);
        return null;
      } finally {
        setSending(false);
      }
    },
    [input.postId, input.projectId, sending],
  );

  return {
    comments,
    loading,
    loadingMore,
    sending,
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    sendComment,
    refresh,
  };
}
