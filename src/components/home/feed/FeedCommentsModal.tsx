import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { typography } from "../../../theme/colors";

import type { RemoteFeedPost } from "../../../services/api/feedPosts";
import { MAX_FEED_POST_COMMENT_LENGTH } from "../../../services/api/feedPosts";

import useFeedPostComments from "../../../hooks/useFeedPostComments";

import {
  formatMemberDisplayLabel,
  memberDisplayInitial,
} from "../../../utils/domain/memberDisplay";

import FeedAvatar from "./FeedAvatar";

const KEPLER_NAVY = "#012169";

type Props = {
  visible: boolean;
  post: RemoteFeedPost | null;
  userInitial: string;
  onClose: () => void;
  onCommentCreated: (postId: string) => void;
};

function formatCommentTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function FeedCommentsModal({
  visible,
  post,
  userInitial,
  onClose,
  onCommentCreated,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef =
    useRef<FlatList>(null);

  const [draft, setDraft] = useState("");

  const {
    comments,
    loading,
    loadingMore,
    sending,
    error,
    hasMore,
    loadMore,
    sendComment,
  } = useFeedPostComments({
    projectId: post?.projectId ?? null,
    postId: post?.id ?? null,
    enabled: visible && post != null,
  });

  useEffect(() => {
    if (!visible) {
      setDraft("");
    }
  }, [visible]);

  const trimmedDraft = draft.trim();
  const canSend =
    trimmedDraft.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend || !post) {
      return;
    }

    const created = await sendComment(trimmedDraft);

    if (!created) {
      return;
    }

    setDraft("");
    onCommentCreated(post.id);

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    });
  };

  const headerTitle = useMemo(() => {
    if (!post) {
      return "Comments";
    }

    const count = post.commentCount;

    return count > 0 ? `Comments (${count})` : "Comments";
  }, [post]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View
          style={[
            styles.container,
            {
              paddingTop: Math.max(
                insets.top,
                10,
              ),
            },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close comments"
              hitSlop={10}
              style={styles.headerAction}
            >
              <Text style={styles.close}>
                Close
              </Text>
            </Pressable>

            <Text style={styles.title}>
              {headerTitle}
            </Text>

            <View
              style={styles.headerAction}
            />
          </View>

          {loading && comments.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator
                color={KEPLER_NAVY}
              />
            </View>
          ) : null}

          {error && comments.length === 0 ? (
            <Text style={styles.error}>
              {error}
            </Text>
          ) : null}

          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              comments.length === 0 &&
                !loading &&
                styles.listContentEmpty,
            ]}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons
                      name="chatbubbles-outline"
                      size={26}
                      color="#5B6B7C"
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    No comments yet
                  </Text>
                  <Text style={styles.emptyBody}>
                    Start the conversation with
                    your project team.
                  </Text>
                </View>
              ) : null
            }
            onEndReached={() => {
              if (hasMore && !loadingMore) {
                void loadMore();
              }
            }}
            onEndReachedThreshold={0.2}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footer}>
                  <ActivityIndicator
                    size="small"
                    color={KEPLER_NAVY}
                  />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const authorLabel =
                formatMemberDisplayLabel({
                  displayName:
                    item.author.displayName,
                  userId:
                    item.author.userId,
                });

              return (
                <View style={styles.commentRow}>
                  <FeedAvatar
                    initial={memberDisplayInitial(
                      authorLabel,
                    )}
                    size={36}
                  />

                  <View style={styles.commentBody}>
                    <View style={styles.commentMeta}>
                      <Text
                        style={
                          styles.commentAuthor
                        }
                        numberOfLines={1}
                      >
                        {authorLabel}
                      </Text>
                      <Text style={styles.commentTime}>
                        {formatCommentTime(
                          item.createdAt,
                        )}
                      </Text>
                    </View>

                    <Text style={styles.commentText}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View
            style={[
              styles.composer,
              {
                paddingBottom: Math.max(
                  insets.bottom,
                  12,
                ),
              },
            ]}
          >
            {error && comments.length > 0 ? (
              <Text style={styles.composerError}>
                {error}
              </Text>
            ) : null}

            <View style={styles.composerRow}>
              <FeedAvatar
                initial={userInitial}
                size={34}
              />

              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment..."
                placeholderTextColor="#667085"
                multiline
                maxLength={
                  MAX_FEED_POST_COMMENT_LENGTH
                }
                editable={!sending}
                accessibilityLabel="Comment text"
              />

              <Pressable
                onPress={() => {
                  void handleSend();
                }}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send comment"
                accessibilityState={{
                  disabled: !canSend,
                }}
                style={({ pressed }) => [
                  styles.sendButton,
                  !canSend &&
                    styles.sendButtonDisabled,
                  pressed &&
                    canSend &&
                    styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator
                    size="small"
                    color={KEPLER_NAVY}
                  />
                ) : (
                  <Text
                    style={[
                      styles.sendLabel,
                      !canSend &&
                        styles.sendLabelDisabled,
                    ]}
                  >
                    Send
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor:
      "rgba(248,250,252,0.98)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor:
      "rgba(15,23,42,0.08)",
  },

  headerAction: {
    width: 72,
    minHeight: 44,
    justifyContent: "center",
  },

  close: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontWeight: "600",
  },

  title: {
    ...typography.bodyMedium,
    flex: 1,
    textAlign: "center",
    color: "#101828",
    fontWeight: "700",
  },

  centered: {
    paddingVertical: 24,
    alignItems: "center",
  },

  empty: {
    paddingHorizontal: 36,
    alignItems: "center",
    gap: 8,
  },

  emptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    backgroundColor: "rgba(1,33,105,0.06)",
  },

  emptyTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 15.5,
    fontWeight: "600",
  },

  emptyBody: {
    ...typography.body,
    color: "#667085",
    fontSize: 13.5,
    lineHeight: 19.5,
    textAlign: "center",
    maxWidth: 260,
  },

  error: {
    ...typography.caption,
    color: "#B42318",
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },

  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 36,
  },

  footer: {
    paddingVertical: 12,
    alignItems: "center",
  },

  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  commentBody: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor:
      "rgba(15,23,42,0.06)",
    paddingBottom: 12,
  },

  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },

  commentAuthor: {
    ...typography.caption,
    color: "#101828",
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },

  commentTime: {
    ...typography.caption,
    color: "#98A2B3",
    fontSize: 11.5,
  },

  commentText: {
    ...typography.body,
    color: "#344054",
    fontSize: 14,
    lineHeight: 20,
  },

  composer: {
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor:
      "rgba(15,23,42,0.08)",
    backgroundColor:
      "rgba(255,255,255,0.96)",
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  composerError: {
    ...typography.caption,
    color: "#B42318",
    marginBottom: 8,
  },

  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 108,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor:
      "rgba(15,23,42,0.07)",
    backgroundColor:
      "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 11 : 9,
    paddingBottom: Platform.OS === "ios" ? 11 : 9,
    ...typography.body,
    color: "#101828",
    fontSize: 14,
  },

  sendButton: {
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },

  sendButtonDisabled: {
    opacity: 0.45,
  },

  sendLabel: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontWeight: "700",
    fontSize: 13,
  },

  sendLabelDisabled: {
    color: "#98A2B3",
  },

  pressed: {
    opacity: 0.68,
  },
});
