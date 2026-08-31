import { useCallback, useRef, useState } from "react";

import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../auth/AuthProvider";
import {
  getAuthorizedProjectFeed,
  requestFeedMediaReadUrl,
  acknowledgeRemoteFeedPost,
  removeRemoteFeedPostAcknowledgement,
  type RemoteFeedAcknowledgementState,
  type RemoteFeedPost,
} from "../services/api/feedPosts";

const DEFAULT_LIMIT = 25;

export type FeedPostEngagementPatch = {
  acknowledgementCount?: number;
  commentCount?: number;
  acknowledgedByCurrentUser?: boolean;
};

export type UseHomeActivityFeedResult = {
  humanPosts: RemoteFeedPost[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  prependPost: (post: RemoteFeedPost) => void;
  updatePost: (post: RemoteFeedPost) => void;
  removePost: (postId: string) => void;
  updatePostEngagement: (
    postId: string,
    patch: FeedPostEngagementPatch,
  ) => void;
  togglePostAcknowledgement: (
    post: RemoteFeedPost,
  ) => Promise<RemoteFeedAcknowledgementState | null>;
  resolveMediaReadUrl: (
    post: RemoteFeedPost,
    mediaId: string,
  ) => Promise<string | null>;
};

export default function useHomeActivityFeed(): UseHomeActivityFeedResult {
  const { user } = useAuth();

  const [humanPosts, setHumanPosts] = useState<
    RemoteFeedPost[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );
  const [nextCursor, setNextCursor] = useState<
    string | null
  >(null);

  const readUrlCache = useRef(
    new Map<string, string>(),
  );

  const loadInitial = useCallback(async () => {
    if (!user?.uid) {
      setHumanPosts([]);
      setNextCursor(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const page = await getAuthorizedProjectFeed({
        limit: DEFAULT_LIMIT,
      });

      setHumanPosts(page.items);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Project feed could not be loaded.";

      setError(message);
      setHumanPosts([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  const refresh = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setRefreshing(true);
    setError(null);
    readUrlCache.current.clear();

    try {
      const page = await getAuthorizedProjectFeed({
        limit: DEFAULT_LIMIT,
      });

      setHumanPosts(page.items);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Project feed could not be loaded.";

      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid]);

  const loadMore = useCallback(async () => {
    if (
      !user?.uid ||
      !nextCursor ||
      loadingMore
    ) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await getAuthorizedProjectFeed({
        limit: DEFAULT_LIMIT,
        cursor: nextCursor,
      });

      setHumanPosts((current) => {
        const seen = new Set(
          current.map((post) => post.id),
        );

        const merged = [...current];

        for (const post of page.items) {
          if (!seen.has(post.id)) {
            merged.push(post);
            seen.add(post.id);
          }
        }

        return merged;
      });

      setNextCursor(page.nextCursor);
    } catch {
      // Keep existing feed visible on pagination failure.
    } finally {
      setLoadingMore(false);
    }
  }, [user?.uid, nextCursor, loadingMore]);

  const prependPost = useCallback(
    (post: RemoteFeedPost) => {
      setHumanPosts((current) => {
        if (
          current.some(
            (entry) => entry.id === post.id,
          )
        ) {
          return current;
        }

        return [post, ...current];
      });
    },
    [],
  );

  const updatePost = useCallback((post: RemoteFeedPost) => {
    setHumanPosts((current) =>
      current.map((entry) =>
        entry.id === post.id ? post : entry,
      ),
    );
  }, []);

  const removePost = useCallback((postId: string) => {
    setHumanPosts((current) =>
      current.filter((entry) => entry.id !== postId),
    );
    readUrlCache.current.forEach((_value, key) => {
      if (key.startsWith(`${postId}:`)) {
        readUrlCache.current.delete(key);
      }
    });
  }, []);

  const updatePostEngagement = useCallback(
    (
      postId: string,
      patch: FeedPostEngagementPatch,
    ) => {
      setHumanPosts((current) =>
        current.map((post) => {
          if (post.id !== postId) {
            return post;
          }

          return {
            ...post,
            ...patch,
          };
        }),
      );
    },
    [],
  );

  const togglePostAcknowledgement = useCallback(
    async (
      post: RemoteFeedPost,
    ): Promise<RemoteFeedAcknowledgementState | null> => {
      const previous = {
        acknowledgedByCurrentUser:
          post.acknowledgedByCurrentUser,
        acknowledgementCount:
          post.acknowledgementCount,
      };

      const optimistic = post.acknowledgedByCurrentUser
        ? {
            acknowledgedByCurrentUser: false,
            acknowledgementCount: Math.max(
              0,
              post.acknowledgementCount - 1,
            ),
          }
        : {
            acknowledgedByCurrentUser: true,
            acknowledgementCount:
              post.acknowledgementCount + 1,
          };

      updatePostEngagement(post.id, optimistic);

      try {
        const result = post.acknowledgedByCurrentUser
          ? await removeRemoteFeedPostAcknowledgement(
              post.projectId,
              post.id,
            )
          : await acknowledgeRemoteFeedPost(
              post.projectId,
              post.id,
            );

        updatePostEngagement(post.id, result);
        return result;
      } catch {
        updatePostEngagement(post.id, previous);
        return null;
      }
    },
    [updatePostEngagement],
  );

  const resolveMediaReadUrl = useCallback(
    async (
      post: RemoteFeedPost,
      mediaId: string,
    ): Promise<string | null> => {
      const cacheKey = `${post.id}:${mediaId}`;
      const cached =
        readUrlCache.current.get(cacheKey);

      if (cached) {
        return cached;
      }

      try {
        const signed =
          await requestFeedMediaReadUrl(
            post.projectId,
            post.id,
            mediaId,
          );

        readUrlCache.current.set(
          cacheKey,
          signed.readUrl,
        );

        return signed.readUrl;
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    humanPosts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    refresh,
    loadMore,
    prependPost,
    updatePost,
    removePost,
    updatePostEngagement,
    togglePostAcknowledgement,
    resolveMediaReadUrl,
  };
}
