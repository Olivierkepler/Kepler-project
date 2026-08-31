import React, { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../auth/AuthProvider";
import HomeFeedPost from "../components/home/feed/HomeFeedPost";
import EditProjectUpdateModal from "../components/home/feed/EditProjectUpdateModal";
import FeedCommentsModal from "../components/home/feed/FeedCommentsModal";
import type { RootStackParamList } from "../navigation/types";
import {
  acknowledgeRemoteFeedPost,
  deleteRemoteFeedPost,
  getRemoteFeedPost,
  removeRemoteFeedPostAcknowledgement,
  requestFeedMediaReadUrl,
  type RemoteFeedPost,
} from "../services/api/feedPosts";
import { colors, typography } from "../theme/colors";
import { mapRemoteFeedPostToHumanUpdate } from "../utils/home/mapRemoteFeedPost";
import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../utils/domain/memberDisplay";
import { getLocalProjectIdForRemote } from "../store/projectCloudMappings";

const KEPLER_NAVY = "#012169";

type Props = NativeStackScreenProps<RootStackParamList, "FeedPostDetail">;

export default function FeedPostDetailScreen({
  navigation,
  route,
}: Props) {
  const { user } = useAuth();
  const { projectId, postId, openComments = false } = route.params;

  const [post, setPost] = useState<RemoteFeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(openComments);
  const [ackPending, setAckPending] = useState(false);
  const [editing, setEditing] = useState(false);

  const userLabel = formatMemberDisplayLabel({
    displayName: user?.displayName,
    email: user?.email,
    userId: user?.uid,
  });
  const userInitial = memberDisplayInitial(userLabel);

  const loadPost = useCallback(async () => {
    if (!user?.uid) {
      setError("Sign in to view this update.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setUnavailable(false);

    try {
      const loaded = await getRemoteFeedPost(projectId, postId);
      setPost(loaded);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Project update could not be loaded.";

      if (
        message.includes("could not be loaded") ||
        message.toLowerCase().includes("not found")
      ) {
        setUnavailable(true);
        setError(null);
      } else {
        setError(message);
      }

      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId, projectId, user?.uid]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  useEffect(() => {
    if (openComments && post) {
      setCommentsOpen(true);
    }
  }, [openComments, post]);

  const openProject = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    const localProjectId = await getLocalProjectIdForRemote(
      user.uid,
      projectId,
    );

    if (localProjectId) {
      navigation.navigate("Project", { projectId: localProjectId });
      return;
    }

    navigation.navigate("Project", {
      projectId,
      source: "shared",
    });
  }, [navigation, projectId, user?.uid]);

  const resolveMediaReadUrl = useCallback(
    async (mediaId: string) => {
      if (!post) {
        return null;
      }

      try {
        const response = await requestFeedMediaReadUrl(
          post.projectId,
          post.id,
          mediaId,
        );
        return response.readUrl;
      } catch {
        return null;
      }
    },
    [post],
  );

  const toggleAcknowledgement = useCallback(async () => {
    if (!post || ackPending) {
      return null;
    }

    setAckPending(true);

    try {
      const result = post.acknowledgedByCurrentUser
        ? await removeRemoteFeedPostAcknowledgement(
            post.projectId,
            post.id,
          )
        : await acknowledgeRemoteFeedPost(post.projectId, post.id);

      setPost((current) =>
        current
          ? {
              ...current,
              acknowledgedByCurrentUser:
                result.acknowledgedByCurrentUser,
              acknowledgementCount: result.acknowledgementCount,
            }
          : current,
      );

      return result;
    } catch {
      Alert.alert(
        "Unable to update acknowledgement",
        "Please try again.",
      );
      return null;
    } finally {
      setAckPending(false);
    }
  }, [ackPending, post]);

  const handleCommentCreated = useCallback((createdPostId: string) => {
    if (createdPostId !== postId) {
      return;
    }

    setPost((current) =>
      current
        ? {
            ...current,
            commentCount: current.commentCount + 1,
          }
        : current,
    );
  }, [postId]);

  const confirmDelete = useCallback(() => {
    if (!post) {
      return;
    }

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
                await deleteRemoteFeedPost(post.projectId, post.id);
                navigation.goBack();
              } catch (deleteError) {
                const message =
                  deleteError instanceof Error
                    ? deleteError.message
                    : "Project update could not be deleted.";

                Alert.alert("Unable to delete", message);
              }
            })();
          },
        },
      ],
    );
  }, [navigation, post]);

  const openOwnerMenu = useCallback(() => {
    if (!post || post.author.userId !== user?.uid) {
      return;
    }

    Alert.alert("Project update", undefined, [
      {
        text: "Edit post",
        onPress: () => setEditing(true),
      },
      {
        text: "Delete post",
        style: "destructive",
        onPress: confirmDelete,
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [confirmDelete, post, user?.uid]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={KEPLER_NAVY} />
        </Pressable>
        <Text style={styles.title}>Project update</Text>
        {post && post.author.userId === user?.uid ? (
          <Pressable
            style={styles.menuButton}
            onPress={openOwnerMenu}
            accessibilityRole="button"
            accessibilityLabel="Post options"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={KEPLER_NAVY}
            />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={KEPLER_NAVY} />
        </View>
      ) : unavailable ? (
        <View style={styles.centered}>
          <Text style={styles.unavailableTitle}>Update unavailable</Text>
          <Text style={styles.unavailableBody}>
            This update is no longer available.
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.retryText}>Back</Text>
          </Pressable>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              void loadPost();
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : post ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <HomeFeedPost
            item={mapRemoteFeedPostToHumanUpdate(post)}
            currentUserId={user?.uid}
            onProjectPress={() => {
              void openProject();
            }}
            onCommentPress={() => setCommentsOpen(true)}
            onEditPress={() => setEditing(true)}
            onDeletePress={confirmDelete}
            onToggleAcknowledgement={toggleAcknowledgement}
            acknowledgementPending={ackPending}
            resolveMediaReadUrl={resolveMediaReadUrl}
          />
        </ScrollView>
      ) : null}

      {post ? (
        <FeedCommentsModal
          visible={commentsOpen}
          post={post}
          userInitial={userInitial}
          onClose={() => setCommentsOpen(false)}
          onCommentCreated={handleCommentCreated}
        />
      ) : null}

      <EditProjectUpdateModal
        visible={editing}
        post={post}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setPost(updated);
        }}
        resolveMediaReadUrl={resolveMediaReadUrl}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.sectionTitle,
    color: KEPLER_NAVY,
  },
  headerSpacer: {
    width: 36,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  unavailableTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    textAlign: "center",
  },
  unavailableBody: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.shadow.soft,
  },
  retryText: {
    ...typography.button,
    color: KEPLER_NAVY,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
});
