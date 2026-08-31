import React, { useCallback, useRef, useState } from "react";

import {
  Alert,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

import type {
  CompositeScreenProps,
} from "@react-navigation/native";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";

import BuildSigmaFoldBackground from "../components/background/BuildSigmaFoldBackground";

import HomeHeader from "../components/home/HomeHeader";
import HomeProjectPulse from "../components/home/HomeProjectPulse";
import HomeSearchEntry from "../components/home/HomeSearchEntry";
import HomeActivityFeed from "../components/home/feed/HomeActivityFeed";
import CreateProjectUpdateModal from "../components/home/feed/CreateProjectUpdateModal";
import EditProjectUpdateModal from "../components/home/feed/EditProjectUpdateModal";
import FeedCommentsModal from "../components/home/feed/FeedCommentsModal";
import HomeFeedComposer, {
  type ComposerLaunchMode,
} from "../components/home/feed/HomeFeedComposer";

import useHomeActivityFeed from "../hooks/useHomeActivityFeed";
import useHomeDashboard from "../hooks/useHomeDashboard";

import type { RemoteFeedPost } from "../services/api/feedPosts";
import { deleteRemoteFeedPost } from "../services/api/feedPosts";

import type {
  MainTabParamList,
  RootStackParamList,
} from "../navigation/types";

import { getLocalProjectIdForRemote } from "../store/projectCloudMappings";

import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../utils/domain/memberDisplay";

const KEPLER_NAVY = "#012169";

type Props = CompositeScreenProps<
  BottomTabScreenProps<
    MainTabParamList,
    "Home"
  >,
  NativeStackScreenProps<
    RootStackParamList
  >
>;

export default function HomeScreen({
  navigation,
}: Props) {
  const { user } = useAuth();
  const dashboard =
    useHomeDashboard();

  const {
    humanPosts,
    loading: feedLoading,
    refreshing,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    prependPost,
    updatePost,
    removePost,
    updatePostEngagement,
    togglePostAcknowledgement,
    resolveMediaReadUrl,
  } = useHomeActivityFeed();

  const scrollY = useRef(
    new Animated.Value(0),
  ).current;

  const loadingMoreRef = useRef(false);

  const [
    commentsPost,
    setCommentsPost,
  ] = useState<RemoteFeedPost | null>(
    null,
  );

  const [
    composerOpen,
    setComposerOpen,
  ] = useState(false);

  const [
    composerMode,
    setComposerMode,
  ] = useState<ComposerLaunchMode>(
    "text",
  );

  const [
    editingPost,
    setEditingPost,
  ] = useState<RemoteFeedPost | null>(null);

  const userLabel =
    formatMemberDisplayLabel({
      displayName:
        user?.displayName,
      email: user?.email,
      userId: user?.uid,
    });

  const userInitial =
    memberDisplayInitial(userLabel);

  const projects = [
    ...dashboard.projectsById.values(),
  ];

  const openProject = (
    projectId: string,
  ) => {
    navigation
      .getParent()
      ?.navigate(
        "Project",
        {
          projectId,
        },
      );
  };

  const openProjectFromFeed = useCallback(
    async (projectId: string) => {
      if (
        dashboard.projectsById.has(
          projectId,
        )
      ) {
        openProject(projectId);
        return;
      }

      if (!user?.uid) {
        return;
      }

      const localProjectId =
        await getLocalProjectIdForRemote(
          user.uid,
          projectId,
        );

      if (localProjectId) {
        openProject(localProjectId);
        return;
      }

      navigation
        .getParent()
        ?.navigate("Project", {
          projectId,
          source: "shared",
        });
    },
    [
      dashboard.projectsById,
      navigation,
      user?.uid,
    ],
  );

  const openDeltaDetail = (
    deltaId: string,
  ) => {
    navigation
      .getParent()
      ?.navigate(
        "DeltaDetail",
        {
          deltaId,
        },
      );
  };

  const openComposer = (
    mode: ComposerLaunchMode,
  ) => {
    setComposerMode(mode);
    setComposerOpen(true);
  };

  const confirmDeletePost = useCallback(
    (post: RemoteFeedPost) => {
      Alert.alert(
        "Delete project update?",
        "This update will be removed from the project feed.\n\nComments and activity history may remain for project traceability.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await deleteRemoteFeedPost(
                    post.projectId,
                    post.id,
                  );
                  removePost(post.id);

                  if (commentsPost?.id === post.id) {
                    setCommentsPost(null);
                  }
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Project update could not be deleted.";

                  Alert.alert(
                    "Unable to delete",
                    message,
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [commentsPost, removePost],
  );

  const handleScroll = useCallback(
    (
      event: NativeSyntheticEvent<NativeScrollEvent>,
    ) => {
      const {
        layoutMeasurement,
        contentOffset,
        contentSize,
      } = event.nativeEvent;

      const distanceFromBottom =
        contentSize.height -
        (layoutMeasurement.height +
          contentOffset.y);

      if (
        distanceFromBottom < 240 &&
        hasMore &&
        !loadingMoreRef.current
      ) {
        loadingMoreRef.current = true;
        void loadMore().finally(() => {
          loadingMoreRef.current = false;
        });
      }
    },
    [hasMore, loadMore],
  );

  return (
    <BuildSigmaFoldBackground
      intensity={0.9}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top"]}
      >
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
          stickyHeaderIndices={[0]}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void refresh();
              }}
              tintColor={KEPLER_NAVY}
            />
          }
          onScroll={Animated.event(
            [
              {
                nativeEvent: {
                  contentOffset: {
                    y: scrollY,
                  },
                },
              },
            ],
            {
              useNativeDriver: false,
              listener: handleScroll,
            },
          )}
        >
          <HomeHeader scrollY={scrollY} />

          <View style={styles.content}>
            <HomeSearchEntry
              onPress={() => {
                navigation
                  .getParent()
                  ?.navigate("Search");
              }}
            />

            <HomeProjectPulse
              activeProjectCount={
                dashboard.activeProjectCount
              }
              openDeltaCount={
                dashboard.deltaSummary
                  .openCount
              }
              reviewedCount={
                dashboard.deltaSummary
                  .reviewedCount
              }
              measurementCount={
                dashboard.measurementCount
              }
            />

            <HomeFeedComposer
              userInitial={userInitial}
              onOpenComposer={openComposer}
            />

            <HomeActivityFeed
              humanPosts={humanPosts}
              recentDeltas={
                dashboard.recentDeltas
              }
              projectsById={
                dashboard.projectsById
              }
              planItemsById={
                dashboard.planItemsById
              }
              loading={feedLoading}
              loadingMore={loadingMore}
              currentUserId={user?.uid}
              onProjectPress={(projectId) => {
                void openProjectFromFeed(
                  projectId,
                );
              }}
              onDeltaPress={
                openDeltaDetail
              }
              onShareUpdate={() =>
                openComposer("text")
              }
              onOpenComments={setCommentsPost}
              onEditPost={setEditingPost}
              onDeletePost={confirmDeletePost}
              onToggleAcknowledgement={
                togglePostAcknowledgement
              }
              resolveMediaReadUrl={
                resolveMediaReadUrl
              }
            />

            <View
              style={
                styles.bottomSpace
              }
            />
          </View>
        </Animated.ScrollView>

        <CreateProjectUpdateModal
          visible={composerOpen}
          launchMode={composerMode}
          projects={projects}
          ownerUid={user?.uid}
          onClose={() =>
            setComposerOpen(false)
          }
          onPublished={(post) => {
            prependPost(post);
          }}
        />

        <EditProjectUpdateModal
          visible={editingPost != null}
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={(post) => {
            updatePost(post);
          }}
          resolveMediaReadUrl={
            editingPost
              ? (mediaId) =>
                  resolveMediaReadUrl(
                    editingPost,
                    mediaId,
                  )
              : undefined
          }
        />

        <FeedCommentsModal
          visible={commentsPost != null}
          post={commentsPost}
          userInitial={userInitial}
          onClose={() =>
            setCommentsPost(null)
          }
          onCommentCreated={(postId) => {
            const current =
              humanPosts.find(
                (post) => post.id === postId,
              );

            if (current) {
              updatePostEngagement(postId, {
                commentCount:
                  current.commentCount + 1,
              });
            }

            if (
              commentsPost &&
              commentsPost.id === postId
            ) {
              setCommentsPost({
                ...commentsPost,
                commentCount:
                  commentsPost.commentCount + 1,
              });
            }
          }}
        />
      </SafeAreaView>
    </BuildSigmaFoldBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor:
      "transparent",
  },

  scroll: {
    flex: 1,
    backgroundColor:
      "transparent",
  },

  scrollContent: {
    paddingBottom: 168,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  bottomSpace: {
    height: 24,
  },
});
