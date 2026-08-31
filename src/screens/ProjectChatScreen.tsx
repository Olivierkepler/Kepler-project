import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import ChatPlanItemReferenceCard from "../components/chat/ChatPlanItemReferenceCard";
import {
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from "../services/api/conversations";
import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { colors, typography } from "../theme/colors";
import type {
  ChatMessage,
  ChatParticipantPresentation,
  ChatPlanItemReferencePresentation,
  Conversation,
} from "../types/chat";
import {
  getLocalPlanItemIdForRemote,
} from "../store/planItemCloudMappings";
import { getPlanItemById } from "../store/planItems";
import {
  getLocalProjectIdForRemote,
} from "../store/projectCloudMappings";
import {
  formatMemberDisplayLabel,
  shortenUserIdentifier,
} from "../utils/domain/memberDisplay";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectChat">;

const POLL_MS = 2500;
const PAGE_SIZE = 50;

function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function resolveParticipantLabel(
  participant: ChatParticipantPresentation | undefined,
  projectMemberId: string,
): string {
  if (!participant) {
    return shortenUserIdentifier(projectMemberId);
  }
  return formatMemberDisplayLabel({
    displayName: participant.displayName,
    email: participant.email,
    userId: participant.userId,
    role: participant.role,
  });
}

export default function ProjectChatScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const {
    remoteProjectId,
    conversationId,
    titleHint,
    subtitleHint,
    pendingPlanItemId,
    pendingPlanItemLabel,
    pendingDraftText,
  } = route.params;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participantsById, setParticipantsById] = useState<
    Map<string, ChatParticipantPresentation>
  >(() => new Map());
  const [referencePresentations, setReferencePresentations] = useState<
    Record<string, ChatPlanItemReferencePresentation>
  >({});
  const [currentProjectMemberId, setCurrentProjectMemberId] = useState<
    string | null
  >(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState(pendingDraftText ?? "");
  const [pendingReferenceId, setPendingReferenceId] = useState<string | null>(
    pendingPlanItemId ?? null,
  );
  const [pendingReferenceLabel, setPendingReferenceLabel] = useState<
    string | null
  >(pendingPlanItemLabel ?? null);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const stickToBottomRef = useRef(true);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((item) => [item.id, item] as const));
      for (const item of incoming) {
        byId.set(item.id, item);
        knownIdsRef.current.add(item.id);
      }
      return [...byId.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    });
  }, []);

  const loadLatest = useCallback(async () => {
    try {
      const page = await listConversationMessages({
        remoteProjectId,
        conversationId,
        limit: PAGE_SIZE,
      });

      setConversation(page.conversation);
      setCurrentProjectMemberId(page.currentProjectMemberId);
      setNextCursor(page.nextCursor);
      setParticipantsById(
        new Map(
          page.participants.map(
            (item) => [item.projectMemberId, item] as const,
          ),
        ),
      );
      setReferencePresentations((current) => ({
        ...current,
        ...page.referencePresentations,
      }));

      // API returns newest-first; reverse for chronological list.
      mergeMessages([...page.items].reverse());
      setError(null);

      await markConversationRead({ remoteProjectId, conversationId }).catch(
        () => undefined,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load conversation.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId, mergeMessages, remoteProjectId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void (async () => {
        if (!active) {
          return;
        }
        setLoading(true);
        await loadLatest();
      })();

      pollRef.current = setInterval(() => {
        void loadLatest();
      }, POLL_MS);

      return () => {
        active = false;
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [loadLatest]),
  );

  const headerTitle = useMemo(() => {
    if (titleHint?.trim()) {
      return titleHint.trim();
    }
    if (conversation?.type === "project") {
      return "Project Chat.";
    }
    return "Direct Chat";
  }, [conversation?.type, titleHint]);

  const headerSubtitle = useMemo(() => {
    if (subtitleHint?.trim()) {
      return subtitleHint.trim();
    }
    if (conversation?.type === "project") {
      return "Team conversation";
    }
    return "Private conversation";
  }, [conversation?.type, subtitleHint]);

  const canSend =
    (draft.trim().length > 0 || !!pendingReferenceId) && !sending;

  const handleOpenPlanItem = async (remotePlanItemId: string) => {
    const presentation = referencePresentations[remotePlanItemId];
    if (!presentation?.available) {
      return;
    }

    // Prefer owned local detail only when the local plan item actually exists.
    // Field members must use shared/cloud context with the remote plan item id.
    if (user?.uid) {
      const localProjectId = await getLocalProjectIdForRemote(
        user.uid,
        remoteProjectId,
      );
      if (localProjectId) {
        const localPlanItemId = await getLocalPlanItemIdForRemote(
          user.uid,
          localProjectId,
          remotePlanItemId,
        );
        if (localPlanItemId) {
          const localItem = await getPlanItemById(user.uid, localPlanItemId);
          if (localItem && localItem.projectId === localProjectId) {
            navigation.navigate("PlanItemDetail", {
              projectId: localProjectId,
              planItemId: localPlanItemId,
            });
            return;
          }
        }
      }
    }

    navigation.navigate("PlanItemDetail", {
      projectId: remoteProjectId,
      planItemId: remotePlanItemId,
      source: "shared",
    });
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !pendingReferenceId) || sending) {
      return;
    }

    setSending(true);
    const reference = pendingReferenceId
      ? ({ type: "plan_item" as const, planItemId: pendingReferenceId })
      : null;
    setDraft("");

    try {
      const message = await sendConversationMessage({
        remoteProjectId,
        conversationId,
        text,
        reference,
      });
      mergeMessages([message]);
      if (reference) {
        setPendingReferenceId(null);
        setPendingReferenceLabel(null);
        navigation.setParams({
          pendingPlanItemId: undefined,
          pendingPlanItemLabel: undefined,
          pendingDraftText: undefined,
        });
      }
      stickToBottomRef.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch (err) {
      setDraft(text);
      setError(
        err instanceof Error ? err.message : "Unable to send message.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleLoadOlder = async () => {
    if (!nextCursor || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    try {
      const page = await listConversationMessages({
        remoteProjectId,
        conversationId,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setNextCursor(page.nextCursor);
      setReferencePresentations((current) => ({
        ...current,
        ...page.referencePresentations,
      }));
      mergeMessages([...page.items].reverse());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load older messages.",
      );
    } finally {
      setLoadingOlder(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderProjectMemberId === currentProjectMemberId;
    const participant = participantsById.get(item.senderProjectMemberId);
    const showSenderName =
      conversation?.type === "project" && !isMine;
    const senderLabel = resolveParticipantLabel(
      participant,
      item.senderProjectMemberId,
    );
    const planRef =
      item.reference?.type === "plan_item" ? item.reference : null;
    const presentation = planRef
      ? referencePresentations[planRef.planItemId]
      : undefined;

    return (
      <View
        style={[
          styles.bubbleRow,
          isMine ? styles.bubbleRowMine : styles.bubbleRowOther,
        ]}
        accessibilityRole="text"
        accessibilityLabel={`${showSenderName ? `${senderLabel}. ` : ""}${item.text}${planRef ? ". Plan Item reference." : ""}. ${formatTimeLabel(item.createdAt)}`}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleOther,
          ]}
        >
          {showSenderName ? (
            <Text style={styles.senderName}>{senderLabel}</Text>
          ) : null}
          {item.text.trim() ? (
            <Text
              style={[
                styles.bubbleText,
                isMine ? styles.bubbleTextMine : styles.bubbleTextOther,
              ]}
            >
              {item.text}
            </Text>
          ) : null}
          {planRef ? (
            <ChatPlanItemReferenceCard
              presentation={presentation}
              isMine={isMine}
              onViewPlanItem={
                presentation?.available
                  ? () => {
                      void handleOpenPlanItem(planRef.planItemId);
                    }
                  : undefined
              }
            />
          ) : null}
          <Text
            style={[
              styles.bubbleTime,
              isMine ? styles.bubbleTimeMine : styles.bubbleTimeOther,
            ]}
          >
            {formatTimeLabel(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <View style={styles.topBarCopy}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <Text style={styles.topBarSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>
        <View style={styles.topBarSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand.navy} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              const distanceFromBottom =
                contentSize.height -
                (contentOffset.y + layoutMeasurement.height);
              stickToBottomRef.current = distanceFromBottom < 80;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (stickToBottomRef.current) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListHeaderComponent={
              nextCursor ? (
                <Pressable
                  onPress={() => {
                    void handleLoadOlder();
                  }}
                  style={styles.loadOlderButton}
                  accessibilityRole="button"
                  accessibilityLabel="Load older messages"
                  accessibilityState={{ busy: loadingOlder }}
                >
                  {loadingOlder ? (
                    <ActivityIndicator color={colors.brand.navy} />
                  ) : (
                    <Text style={styles.loadOlderText}>Load earlier messages</Text>
                  )}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No messages yet. Start the conversation.
              </Text>
            }
          />
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.composer}>
          {pendingReferenceId ? (
            <View style={styles.pendingChip}>
              <Text style={styles.pendingChipText} numberOfLines={1}>
                PLAN ITEM: {pendingReferenceLabel ?? "Plan Item"}
              </Text>
              <Pressable
                onPress={() => {
                  setPendingReferenceId(null);
                  setPendingReferenceLabel(null);
                  navigation.setParams({
                    pendingPlanItemId: undefined,
                    pendingPlanItemLabel: undefined,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove Plan Item reference"
                hitSlop={8}
              >
                <Text style={styles.pendingChipClear}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor="#98A2B3"
            multiline
            editable={!sending}
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={() => {
              void handleSend();
            }}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              pressed && canSend && styles.sendButtonPressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  topBarCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  topBarSubtitle: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  topBarSpacer: {
    width: 40,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexGrow: 1,
  },
  loadOlderButton: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  loadOlderText: {
    ...typography.caption,
    color: colors.brand.navy,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: 40,
  },
  bubbleRow: {
    marginBottom: 10,
    flexDirection: "row",
  },
  bubbleRowMine: {
    justifyContent: "flex-end",
  },
  bubbleRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: "#E8EEF8",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#F4F6F8",
    borderBottomLeftRadius: 4,
  },
  senderName: {
    ...typography.caption,
    color: colors.brand.navy,
    marginBottom: 2,
  },
  bubbleText: {
    ...typography.body,
  },
  bubbleTextMine: {
    color: colors.text.primary,
  },
  bubbleTextOther: {
    color: colors.text.primary,
  },
  bubbleTime: {
    ...typography.caption,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  bubbleTimeMine: {
    color: colors.text.muted,
  },
  bubbleTimeOther: {
    color: colors.text.muted,
  },
  composer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D6EAF9",
    backgroundColor: "#F8FBFE",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingChipText: {
    ...typography.caption,
    color: colors.brand.navy,
    flex: 1,
    marginRight: 8,
  },
  pendingChipClear: {
    ...typography.title,
    color: colors.text.muted,
    lineHeight: 20,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.body,
    color: colors.text.primary,
    backgroundColor: "#FFFFFF",
  },
  sendButton: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: 14,
    backgroundColor: colors.brand.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
  sendButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
});
