import React, {
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  typography,
} from "../../../theme/colors";

import type { Delta } from "../../../types/delta";
import type {
  HomeFeedItem,
  HomeFeedIntelligenceUpdate,
} from "../../../types/homeFeed";
import type { PlanItem } from "../../../types/plan";
import type { Project } from "../../../types/project";

import type {
  RemoteFeedAcknowledgementState,
  RemoteFeedPost,
} from "../../../services/api/feedPosts";

import { mapRemoteFeedPostToHumanUpdate } from "../../../utils/home/mapRemoteFeedPost";

import HomeFeedPost from "./HomeFeedPost";
import { HomeIntelligencePost } from "./HomeIntelligencePost";

const KEPLER_NAVY = "#012169";

type Props = {
  humanPosts: RemoteFeedPost[];
  recentDeltas: Delta[];
  projectsById: Map<string, Project>;
  planItemsById: Map<string, PlanItem>;
  loading: boolean;
  loadingMore: boolean;
  currentUserId?: string;
  onProjectPress: (
    remoteProjectId: string,
  ) => void;
  onDeltaPress: (
    deltaId: string,
  ) => void;
  onShareUpdate: () => void;
  onOpenComments: (post: RemoteFeedPost) => void;
  onEditPost?: (post: RemoteFeedPost) => void;
  onDeletePost?: (post: RemoteFeedPost) => void;
  onToggleAcknowledgement: (
    post: RemoteFeedPost,
  ) => Promise<RemoteFeedAcknowledgementState | null>;
  resolveMediaReadUrl: (
    post: RemoteFeedPost,
    mediaId: string,
  ) => Promise<string | null>;
};

function mapDeltaToFeedItem(
  delta: Delta,
  projectsById: Map<string, Project>,
  planItemsById: Map<string, PlanItem>,
): HomeFeedIntelligenceUpdate {
  const project =
    projectsById.get(delta.projectId);

  const planItem =
    planItemsById.get(delta.planItemId);

  return {
    kind: "intelligence",
    id: `delta-${delta.id}`,
    deltaId: delta.id,
    projectId: delta.projectId,
    projectName:
      project?.name ??
      "Unknown project",
    planItemLabel:
      planItem?.label ??
      "Unknown plan item",
    createdAt: delta.createdAt,
    plannedValue: delta.plannedValue,
    actualValue: delta.actualValue,
    difference: delta.difference,
    unit: delta.unit,
    percentDifference:
      delta.percentDifference,
    status: delta.status,
  };
}

export default function HomeActivityFeed({
  humanPosts,
  recentDeltas,
  projectsById,
  planItemsById,
  loading,
  loadingMore,
  currentUserId,
  onProjectPress,
  onDeltaPress,
  onShareUpdate,
  onOpenComments,
  onEditPost,
  onDeletePost,
  onToggleAcknowledgement,
  resolveMediaReadUrl,
}: Props) {
  const [
    acknowledgementPendingIds,
    setAcknowledgementPendingIds,
  ] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const humanPostsById = useMemo(
    () =>
      new Map(
        humanPosts.map((post) => [
          post.id,
          post,
        ] as const),
      ),
    [humanPosts],
  );

  const items = useMemo(() => {
    const intelligenceItems =
      recentDeltas.map((delta) =>
        mapDeltaToFeedItem(
          delta,
          projectsById,
          planItemsById,
        ),
      );

    const humanItems = humanPosts.map(
      mapRemoteFeedPostToHumanUpdate,
    );

    const combined: HomeFeedItem[] = [
      ...humanItems,
      ...intelligenceItems,
    ];

    return combined.sort((a, b) =>
      b.createdAt.localeCompare(
        a.createdAt,
      ),
    );
  }, [
    humanPosts,
    recentDeltas,
    projectsById,
    planItemsById,
  ]);

  if (loading && items.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          color={KEPLER_NAVY}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          No updates yet
        </Text>
        <Text style={styles.emptyBody}>
          Share progress, photos, videos, or
          field notes with your project team.
        </Text>

        <Pressable
          onPress={onShareUpdate}
          accessibilityRole="button"
          accessibilityLabel="Share an update"
          style={({ pressed }) => [
            styles.emptyButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emptyButtonText}>
            Share an update
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.feed}>
      {items.map((item) => {
        switch (item.kind) {
          case "human": {
            const remotePost =
              humanPostsById.get(item.id);

            return (
              <HomeFeedPost
                key={item.id}
                item={item}
                currentUserId={currentUserId}
                onProjectPress={
                  onProjectPress
                }
                onCommentPress={() => {
                  if (remotePost) {
                    onOpenComments(remotePost);
                  }
                }}
                onEditPress={() => {
                  if (remotePost) {
                    onEditPost?.(remotePost);
                  }
                }}
                onDeletePress={() => {
                  if (remotePost) {
                    onDeletePost?.(remotePost);
                  }
                }}
                onToggleAcknowledgement={async () => {
                  if (!remotePost) {
                    return null;
                  }

                  setAcknowledgementPendingIds(
                    (current) =>
                      new Set(current).add(
                        remotePost.id,
                      ),
                  );

                  try {
                    return await onToggleAcknowledgement(
                      remotePost,
                    );
                  } finally {
                    setAcknowledgementPendingIds(
                      (current) => {
                        const next = new Set(
                          current,
                        );
                        next.delete(
                          remotePost.id,
                        );
                        return next;
                      },
                    );
                  }
                }}
                acknowledgementPending={acknowledgementPendingIds.has(
                  item.id,
                )}
                resolveMediaReadUrl={
                  remotePost
                    ? (mediaId) =>
                        resolveMediaReadUrl(
                          remotePost,
                          mediaId,
                        )
                    : undefined
                }
              />
            );
          }

          case "intelligence":
            return (
              <HomeIntelligencePost
                key={item.id}
                item={item}
                onDeltaPress={
                  onDeltaPress
                }
                onProjectPress={
                  onProjectPress
                }
              />
            );

          default:
            return null;
        }
      })}

      {loadingMore ? (
        <View style={styles.loadingMore}>
          <ActivityIndicator
            color={KEPLER_NAVY}
            size="small"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  feed: {
    paddingTop: 4,
  },

  loading: {
    paddingVertical: 36,
    alignItems: "center",
  },

  loadingMore: {
    paddingVertical: 16,
    alignItems: "center",
  },

  empty: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: "center",
  },

  emptyTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontWeight: "700",
  },

  emptyBody: {
    ...typography.caption,
    color: "#667085",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 300,
  },

  emptyButton: {
    marginTop: 16,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(1,33,105,0.08)",
  },

  emptyButtonText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontWeight: "700",
    fontSize: 13,
  },

  pressed: {
    opacity: 0.68,
  },
});
