import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
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
import Ionicons from "@expo/vector-icons/Ionicons";

import ChatPlanItemReferenceCard from "../components/chat/ChatPlanItemReferenceCard";
import GroupAvatar from "../components/user/GroupAvatar";
import UserAvatar from "../components/user/UserAvatar";
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
const KEPLER_NAVY = "#012169";
const backgroundImage = require("../../assets/bgproject.png");

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
      return "Project Chat";
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

  const headerAvatarIcon = useMemo<"people" | "person">(() => {
    if (conversation?.type === "direct") {
      return "person";
    }
    if (conversation?.type === "project") {
      return "people";
    }
    if (subtitleHint?.trim() === "Private conversation") {
      return "person";
    }
    if (subtitleHint?.trim() === "Project Chat") {
      return "people";
    }
    return "people";
  }, [conversation?.type, subtitleHint]);

  const otherParticipant = useMemo(() => {
    if (!currentProjectMemberId) {
      return [...participantsById.values()].find(
        (participant) => participant.userId !== user?.uid,
      );
    }

    return [...participantsById.values()].find(
      (participant) =>
        participant.projectMemberId !== currentProjectMemberId,
    );
  }, [currentProjectMemberId, participantsById, user?.uid]);

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
    <ImageBackground
      source={backgroundImage}
      style={styles.background}
      resizeMode="cover"
    >
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={25} color={KEPLER_NAVY} />
        </Pressable>
        <Pressable
          onPress={() =>
            navigation.navigate("ChatInfo", {
              remoteProjectId,
              conversationId,
              titleHint,
              subtitleHint,
            })
          }
          style={styles.headerIdentity}
          accessibilityRole="button"
          accessibilityLabel="Open chat information"
        >
          {headerAvatarIcon === "people" ? (
            <GroupAvatar
              size={44}
              imageUrl={
                conversation?.type === "project"
                  ? conversation.avatarUrl
                  : undefined
              }
              style={styles.headerAvatarSpacing}
            />
          ) : (
            <UserAvatar
              imageUrl={otherParticipant?.avatarUrl}
              size={44}
              style={styles.headerAvatarSpacing}
            />
          )}
          <View style={styles.topBarCopy}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={styles.topBarSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={KEPLER_NAVY} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.messageList}
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
                    <ActivityIndicator color={KEPLER_NAVY} size="small" />
                  ) : (
                    <View style={styles.loadOlderContent}>
                      <Ionicons
                        name="chevron-up"
                        size={14}
                        color="#667085"
                      />
                      <Text style={styles.loadOlderText}>
                        Load earlier messages
                      </Text>
                    </View>
                  )}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyStatePanel}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={28}
                    color="#98A2B3"
                  />
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Start the conversation.
                  </Text>
                </View>
              </View>
            }
          />
        )}

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons
              name="alert-circle-outline"
              size={15}
              color={colors.danger}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          {pendingReferenceId ? (
            <View style={styles.pendingChip}>
              <View style={styles.pendingChipIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={KEPLER_NAVY}
                />
              </View>
              <View style={styles.pendingChipCopy}>
                <Text style={styles.pendingChipEyebrow}>Plan item</Text>
                <Text style={styles.pendingChipText} numberOfLines={1}>
                  {pendingReferenceLabel ?? "Plan Item"}
                </Text>
              </View>
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
                style={styles.pendingChipClearButton}
              >
                <Ionicons name="close" size={18} color="#667085" />
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
              <Ionicons name="send" size={19} color="#FFFFFF" />
            )}
          </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  flex: {
    flex: 1,
    backgroundColor: "transparent",
  },
  messageList: {
    backgroundColor: "transparent",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.06)",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  headerIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  headerAvatarSpacing: {
    marginRight: 10,
    flexShrink: 0,
  },
  topBarCopy: {
    flex: 1,
    minWidth: 0,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 16,
    fontWeight: "600",
  },
  topBarSubtitle: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
    marginTop: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  listContent: {
    paddingHorizontal: 11,
    paddingVertical: 14,
    flexGrow: 1,
  },
  loadOlderButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  loadOlderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  loadOlderText: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyStatePanel: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 16,
    // backgroundColor: "rgba(255,255,255,0.88)",
  },
  emptyTitle: {
    ...typography.bodyMedium,
    color: "#475467",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  emptySubtitle: {
    ...typography.body,
    color: "#98A2B3",
    fontSize: 13.5,
    textAlign: "center",
  },
  bubbleRow: {
    marginBottom: 5,
    flexDirection: "row",
  },
  bubbleRowMine: {
    justifyContent: "flex-end",
  },
  bubbleRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleMine: {
    backgroundColor: "rgba(231,238,249,0.96)",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
  },
  senderName: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11.5,
    fontWeight: "600",
    marginBottom: 2,
  },
  bubbleText: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: "#101828",
  },
  bubbleTextMine: {
    color: "#101828",
  },
  bubbleTextOther: {
    color: "#101828",
  },
  bubbleTime: {
    ...typography.caption,
    marginTop: 3,
    alignSelf: "flex-end",
    fontSize: 10.5,
    color: "#98A2B3",
  },
  bubbleTimeMine: {
    color: "#98A2B3",
  },
  bubbleTimeOther: {
    color: "#98A2B3",
  },
  composer: {
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.06)",
    backgroundColor: "rgba(255,255,255,0.95)",
    gap: 8,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.08)",
  },
  pendingChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(1,33,105,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pendingChipCopy: {
    flex: 1,
    minWidth: 0,
  },
  pendingChipEyebrow: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  pendingChipText: {
    ...typography.caption,
    color: "#101828",
    fontSize: 13,
    marginTop: 1,
  },
  pendingChipClearButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...typography.body,
    fontSize: 15,
    lineHeight: 20,
    color: "#101828",
    backgroundColor: "rgba(244,246,248,0.96)",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: KEPLER_NAVY,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(1,33,105,0.30)",
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 12.5,
    lineHeight: 17,
    flex: 1,
    minWidth: 0,
  },
});
