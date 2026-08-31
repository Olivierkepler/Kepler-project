import { useCallback, useRef, useState } from "react";

import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../auth/AuthProvider";
import {
  getNotificationUnreadCount,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/api/notifications";
import type { RemoteNotification } from "../types/notification";
import { emitNotificationUnreadChanged } from "../utils/notifications/unreadBadgeEvents";

const DEFAULT_LIMIT = 30;

export type UseNotificationsResult = {
  items: RemoteNotification[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  unreadCount: number;
  hasUnread: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markReadLocally: (notificationId: string) => void;
};

export default function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const [items, setItems] = useState<RemoteNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const loadingMoreRef = useRef(false);

  const loadUnreadCount = useCallback(async () => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await getNotificationUnreadCount();
      setUnreadCount(count);
    } catch {
      // Keep last known count.
    }
  }, [user?.uid]);

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!user?.uid) {
        setItems([]);
        setNextCursor(null);
        setLoading(false);
        setUnreadCount(0);
        setError("Sign in to view notifications.");
        return;
      }

      if (append) {
        if (loadingMoreRef.current || !cursor) {
          return;
        }
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else if (!append && !refreshing) {
        setLoading(true);
        setError(null);
        knownIdsRef.current = new Set();
      }

      try {
        const page = await getNotifications({
          limit: DEFAULT_LIMIT,
          cursor: cursor ?? undefined,
        });

        if (append) {
          const fresh = page.items.filter(
            (item) => !knownIdsRef.current.has(item.id),
          );
          for (const item of fresh) {
            knownIdsRef.current.add(item.id);
          }
          setItems((prev) => [...prev, ...fresh]);
        } else {
          for (const item of page.items) {
            knownIdsRef.current.add(item.id);
          }
          setItems(page.items);
        }

        setNextCursor(page.nextCursor);
        setError(null);
        await loadUnreadCount();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Notifications could not be loaded.";
        if (!append) {
          setError(message);
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [loadUnreadCount, refreshing, user?.uid],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(null, false);
      return () => {
        emitNotificationUnreadChanged();
      };
    }, [loadPage]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(null, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) {
      return;
    }
    await loadPage(nextCursor, true);
  }, [loadPage, nextCursor]);

  const markReadLocally = useCallback((notificationId: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === notificationId
          ? {
              ...entry,
              isRead: true,
              readAt: new Date().toISOString(),
            }
          : entry,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markRead = useCallback(
    async (notificationId: string) => {
      const target = items.find((item) => item.id === notificationId);
      if (!target || target.isRead) {
        return;
      }

      markReadLocally(notificationId);

      try {
        await markNotificationRead(notificationId);
        emitNotificationUnreadChanged();
        await loadUnreadCount();
      } catch {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === notificationId
              ? { ...entry, isRead: false, readAt: null }
              : entry,
          ),
        );
        await loadUnreadCount();
      }
    },
    [items, loadUnreadCount, markReadLocally],
  );

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev.map((item) =>
          item.isRead
            ? item
            : {
                ...item,
                isRead: true,
                readAt: new Date().toISOString(),
              },
        ),
      );
      setUnreadCount(0);
      emitNotificationUnreadChanged();
    } catch {
      await loadUnreadCount();
    }
  }, [loadUnreadCount]);

  const hasUnread =
    unreadCount > 0 || items.some((item) => !item.isRead);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    nextCursor,
    unreadCount,
    hasUnread,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    markReadLocally,
  };
}
