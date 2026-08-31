import React, { useMemo } from "react";

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../auth/AuthProvider";
import BuildSigmaFoldBackground from "../components/background/BuildSigmaFoldBackground";
import useNotifications from "../hooks/useNotifications";
import type { RootStackParamList } from "../navigation/types";
import { colors, typography } from "../theme/colors";
import type { RemoteNotification } from "../types/notification";
import {
  formatNotificationBody,
  formatNotificationProjectLabel,
  formatNotificationTime,
  formatNotificationTitle,
  notificationAccessibilityLabel,
  notificationDateGroup,
  notificationIconName,
  notificationUsesAttentionIcon,
  type NotificationDateGroup,
} from "../utils/domain/notificationPresentation";
import { handleNotificationPress } from "../utils/navigation/notificationDeepLink";

const KEPLER_NAVY = "#012169";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

type ListRow =
  | { kind: "header"; id: string; label: NotificationDateGroup }
  | { kind: "item"; id: string; notification: RemoteNotification };

function NotificationRow({
  item,
  onPress,
}: {
  item: RemoteNotification;
  onPress: () => void;
}) {
  const title = formatNotificationTitle(item);
  const body = formatNotificationBody(item);
  const projectLabel = formatNotificationProjectLabel(item);
  const iconName = notificationIconName(item.type);
  const attention = notificationUsesAttentionIcon(item.type);
  const unread = !item.isRead;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notificationAccessibilityLabel(item)}
      accessibilityState={{ selected: unread }}
    >
      <View style={styles.rowLeading}>
        {unread ? (
          <View style={styles.unreadDot} />
        ) : (
          <View style={styles.unreadDotSpacer} />
        )}
        <View
          style={[
            styles.iconWrap,
            attention && styles.iconWrapAttention,
          ]}
        >
          <Ionicons
            name={iconName}
            size={17}
            color={attention ? colors.danger : KEPLER_NAVY}
          />
        </View>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.rowTitle,
              unread && styles.rowTitleUnread,
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text style={styles.rowTime}>
            {formatNotificationTime(item.createdAt)}
          </Text>
        </View>

        {body ? (
          <Text
            style={[
              styles.rowBodyText,
              unread && styles.rowBodyTextUnread,
            ]}
          >
            {body}
          </Text>
        ) : null}

        {projectLabel ? (
          <Text style={styles.rowProject} numberOfLines={1}>
            {projectLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function buildRows(items: RemoteNotification[]): ListRow[] {
  const rows: ListRow[] = [];
  let currentGroup: NotificationDateGroup | null = null;

  for (const notification of items) {
    const group = notificationDateGroup(notification.createdAt);
    if (group !== currentGroup) {
      currentGroup = group;
      rows.push({
        kind: "header",
        id: `header-${group}-${notification.id}`,
        label: group,
      });
    }

    rows.push({
      kind: "item",
      id: notification.id,
      notification,
    });
  }

  return rows;
}

export default function NotificationsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    hasUnread,
    unreadCount,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();

  const rows = useMemo(() => buildRows(items), [items]);

  const handleOpen = (item: RemoteNotification) => {
    if (!user?.uid) {
      return;
    }

    void handleNotificationPress({
      navigation,
      notification: item,
      currentUid: user.uid,
    });

    if (!item.isRead) {
      void markRead(item.id);
    }
  };

  const bottomPad = Math.max(insets.bottom, 12) + 20;

  return (
    <BuildSigmaFoldBackground intensity={0.55}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            style={styles.headerSide}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={KEPLER_NAVY}
            />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.title}>Notifications</Text>
            {hasUnread && unreadCount > 0 ? (
              <Text style={styles.unreadSummary}>
                {unreadCount} unread
              </Text>
            ) : null}
          </View>

          {hasUnread ? (
            <Pressable
              style={styles.markAllButton}
              onPress={() => {
                void markAllRead();
              }}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              hitSlop={6}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={KEPLER_NAVY}
              />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={KEPLER_NAVY} />
            <Text style={styles.stateText}>Loading notifications…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                void refresh();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.id}
            contentContainerStyle={[
              rows.length === 0
                ? styles.emptyContainer
                : styles.listContent,
              { paddingBottom: bottomPad },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void refresh();
                }}
                tintColor={KEPLER_NAVY}
              />
            }
            renderItem={({ item: row }) => {
              if (row.kind === "header") {
                return (
                  <Text style={styles.sectionLabel}>{row.label}</Text>
                );
              }

              return (
                <NotificationRow
                  item={row.notification}
                  onPress={() => handleOpen(row.notification)}
                />
              );
            }}
            ItemSeparatorComponent={({ leadingItem }) =>
              leadingItem &&
              (leadingItem as ListRow).kind === "item" ? (
                <View style={styles.separator} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name="notifications-outline"
                    size={22}
                    color={KEPLER_NAVY}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  No notifications yet
                </Text>
                <Text style={styles.emptyText}>
                  Project updates, comments, assignments,{"\n"}
                  and review activity will appear here.
                </Text>
              </View>
            }
            onEndReached={() => {
              void loadMore();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  style={styles.footerLoader}
                  color={KEPLER_NAVY}
                />
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </BuildSigmaFoldBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.08)",
  },
  headerSide: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  title: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  unreadSummary: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 11.5,
    marginTop: 1,
  },
  markAllButton: {
    minHeight: 44,
    minWidth: 44,
    maxWidth: 118,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  markAllText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 12,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  errorTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    fontSize: 15,
    textAlign: "center",
  },
  stateText: {
    ...typography.body,
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    ...typography.button,
    color: KEPLER_NAVY,
    fontSize: 14,
  },
  listContent: {
    paddingTop: 2,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
  },
  emptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    backgroundColor: "rgba(1,33,105,0.05)",
  },
  emptyTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    fontSize: 15,
    textAlign: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.text.muted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "transparent",
  },
  rowUnread: {
    backgroundColor: "rgba(1, 33, 105, 0.035)",
  },
  rowPressed: {
    opacity: 0.72,
    backgroundColor: "rgba(1, 33, 105, 0.05)",
  },
  rowLeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginRight: 10,
    paddingTop: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 14,
    marginRight: 8,
    backgroundColor: KEPLER_NAVY,
  },
  unreadDotSpacer: {
    width: 7,
    marginRight: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(1,33,105,0.06)",
  },
  iconWrapAttention: {
    backgroundColor: "rgba(224, 48, 55, 0.08)",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  rowTitle: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.text.secondary,
    fontSize: 14.5,
    fontWeight: "500",
    lineHeight: 19,
  },
  rowTitleUnread: {
    color: colors.text.primary,
    fontWeight: "600",
  },
  rowBodyText: {
    ...typography.body,
    color: colors.text.muted,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 3,
  },
  rowBodyTextUnread: {
    color: colors.text.secondary,
  },
  rowProject: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 12.5,
    fontWeight: "500",
    marginTop: 4,
    opacity: 0.92,
  },
  rowTime: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 11.5,
    marginTop: 1,
    flexShrink: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(15,23,42,0.07)",
    marginLeft: 77,
  },
  footerLoader: {
    marginVertical: 14,
  },
});
