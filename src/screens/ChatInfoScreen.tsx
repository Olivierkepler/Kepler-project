import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";
import { listConversationMessages } from "../services/api/conversations";
import type { RootStackParamList } from "../navigation/types";
import { getLocalPlanItemIdForRemote } from "../store/planItemCloudMappings";
import { getPlanItemById } from "../store/planItems";
import {
  getLocalProjectIdForRemote,
} from "../store/projectCloudMappings";
import { getProjectById } from "../store/projects";
import type {
  ChatParticipantPresentation,
  ChatPlanItemReferencePresentation,
  Conversation,
} from "../types/chat";
import { colors, typography } from "../theme/colors";
import GroupAvatar from "../components/user/GroupAvatar";
import UserAvatar from "../components/user/UserAvatar";
import {
  formatMemberDisplayLabel,
} from "../utils/domain/memberDisplay";
import { formatProjectMemberRoleLabel } from "../utils/domain/memberRoleLabels";

const KEPLER_NAVY = "#012169";
const PAGE_SIZE = 50;

type Props = NativeStackScreenProps<RootStackParamList, "ChatInfo">;

type SharedPlanItemEntry = {
  planItemId: string;
  presentation: ChatPlanItemReferencePresentation;
};

export default function ChatInfoScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { remoteProjectId, conversationId, titleHint, subtitleHint } =
    route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [participants, setParticipants] = useState<ChatParticipantPresentation[]>(
    [],
  );
  const [currentProjectMemberId, setCurrentProjectMemberId] = useState<
    string | null
  >(null);
  const [sharedPlanItems, setSharedPlanItems] = useState<SharedPlanItemEntry[]>(
    [],
  );
  const [resolvedProjectName, setResolvedProjectName] = useState<string | null>(
    null,
  );
  const [localProjectId, setLocalProjectId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const membersSectionOffsetY = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        setError(null);

        try {
          const planItemMap = new Map<string, ChatPlanItemReferencePresentation>();
          let cursor: string | null = null;
          let pageConversation: Conversation | null = null;
          let pageParticipants: ChatParticipantPresentation[] = [];
          let pageCurrentMemberId: string | null = null;

          do {
            const page = await listConversationMessages({
              remoteProjectId,
              conversationId,
              limit: PAGE_SIZE,
              cursor,
            });

            if (!active) {
              return;
            }

            if (!pageConversation) {
              pageConversation = page.conversation;
              pageParticipants = page.participants;
              pageCurrentMemberId = page.currentProjectMemberId;
            }

            for (const message of page.items) {
              if (message.reference?.type !== "plan_item") {
                continue;
              }
              const presentation =
                page.referencePresentations[message.reference.planItemId];
              if (presentation && !planItemMap.has(message.reference.planItemId)) {
                planItemMap.set(message.reference.planItemId, presentation);
              }
            }

            cursor = page.nextCursor;
          } while (cursor);

          if (!active) {
            return;
          }

          setConversation(pageConversation);
          setParticipants(pageParticipants);
          setCurrentProjectMemberId(pageCurrentMemberId);
          setSharedPlanItems(
            [...planItemMap.entries()].map(([planItemId, presentation]) => ({
              planItemId,
              presentation,
            })),
          );

          if (user?.uid) {
            const mappedLocalProjectId = await getLocalProjectIdForRemote(
              user.uid,
              remoteProjectId,
            );
            if (!active) {
              return;
            }
            setLocalProjectId(mappedLocalProjectId ?? null);
            if (mappedLocalProjectId) {
              const project = await getProjectById(
                user.uid,
                mappedLocalProjectId,
              );
              if (active && project?.name?.trim()) {
                setResolvedProjectName(project.name.trim());
              }
            }
          }
        } catch (err) {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to load chat information.",
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [conversationId, remoteProjectId, user?.uid]),
  );

  const isProjectConversation = conversation?.type === "project";

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
    return "people";
  }, [conversation?.type, subtitleHint]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) =>
      formatMemberDisplayLabel({
        displayName: a.displayName,
        email: a.email,
        userId: a.userId,
        role: a.role,
      }).localeCompare(
        formatMemberDisplayLabel({
          displayName: b.displayName,
          email: b.email,
          userId: b.userId,
          role: b.role,
        }),
      ),
    );
  }, [participants]);

  const otherParticipants = useMemo(() => {
    if (!currentProjectMemberId) {
      return sortedParticipants;
    }
    return sortedParticipants.filter(
      (item) => item.projectMemberId !== currentProjectMemberId,
    );
  }, [currentProjectMemberId, sortedParticipants]);

  const identityTitle = useMemo(() => {
    if (titleHint?.trim()) {
      return titleHint.trim();
    }
    if (isProjectConversation) {
      return resolvedProjectName ?? "Project Chat";
    }
    const other = otherParticipants[0];
    if (other) {
      return formatMemberDisplayLabel({
        displayName: other.displayName,
        email: other.email,
        userId: other.userId,
        role: other.role,
      });
    }
    return "Direct Chat";
  }, [
    isProjectConversation,
    otherParticipants,
    resolvedProjectName,
    titleHint,
  ]);

  const identitySubtitle = useMemo(() => {
    if (subtitleHint?.trim()) {
      return subtitleHint.trim();
    }
    if (isProjectConversation) {
      return "Project Chat";
    }
    return "Private conversation";
  }, [isProjectConversation, subtitleHint]);

  const projectDisplayName =
    resolvedProjectName ?? titleHint?.trim() ?? "Project";

  const projectIdForNavigation = localProjectId ?? remoteProjectId;

  const openProject = useCallback(() => {
    if (localProjectId) {
      navigation.navigate("Project", { projectId: localProjectId });
      return;
    }
    navigation.navigate("Project", {
      projectId: remoteProjectId,
      source: "shared",
    });
  }, [localProjectId, navigation, remoteProjectId]);

  const openMemberProfile = useCallback(
    (projectMemberId: string) => {
      navigation.navigate("ProjectTeamMember", {
        projectId: projectIdForNavigation,
        projectMemberId,
      });
    },
    [navigation, projectIdForNavigation],
  );

  const scrollToMembersSection = useCallback(() => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, membersSectionOffsetY.current - 8),
      animated: true,
    });
  }, []);

  const handleIdentityPress = useCallback(() => {
    if (isProjectConversation) {
      scrollToMembersSection();
      return;
    }

    const otherParticipant = otherParticipants[0];
    if (otherParticipant) {
      openMemberProfile(otherParticipant.projectMemberId);
    }
  }, [
    isProjectConversation,
    openMemberProfile,
    otherParticipants,
    scrollToMembersSection,
  ]);

  const identityIsInteractive =
    isProjectConversation || otherParticipants.length > 0;

  const identityAccessibilityLabel = useMemo(() => {
    if (isProjectConversation) {
      return "Scroll to members";
    }
    return `Open member profile for ${identityTitle}`;
  }, [identityTitle, isProjectConversation]);

  const openPlanItem = useCallback(
    async (remotePlanItemId: string) => {
      if (user?.uid && localProjectId) {
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

      navigation.navigate("PlanItemDetail", {
        projectId: remoteProjectId,
        planItemId: remotePlanItemId,
        source: "shared",
      });
    },
    [localProjectId, navigation, remoteProjectId, user?.uid],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
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
        <Text style={styles.topBarTitle}>Chat info</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={KEPLER_NAVY} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {identityIsInteractive ? (
            <Pressable
              onPress={handleIdentityPress}
              accessibilityRole="button"
              accessibilityLabel={identityAccessibilityLabel}
              hitSlop={8}
              style={({ pressed }) => [
                styles.identityBlock,
                pressed && styles.identityBlockPressed,
              ]}
            >
              {headerAvatarIcon === "people" ? (
                <GroupAvatar
                  size={76}
                  imageUrl={
                    conversation?.type === "project"
                      ? conversation.avatarUrl
                      : undefined
                  }
                />
              ) : (
                <UserAvatar
                  imageUrl={otherParticipants[0]?.avatarUrl}
                  size={76}
                />
              )}
              <Text style={styles.identityTitle} numberOfLines={2}>
                {identityTitle}
              </Text>
              <Text style={styles.identitySubtitle} numberOfLines={1}>
                {identitySubtitle}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.identityBlock}>
              {headerAvatarIcon === "people" ? (
                <GroupAvatar
                  size={76}
                  imageUrl={
                    conversation?.type === "project"
                      ? conversation.avatarUrl
                      : undefined
                  }
                />
              ) : (
                <UserAvatar
                  imageUrl={otherParticipants[0]?.avatarUrl}
                  size={76}
                />
              )}
              <Text style={styles.identityTitle} numberOfLines={2}>
                {identityTitle}
              </Text>
              <Text style={styles.identitySubtitle} numberOfLines={1}>
                {identitySubtitle}
              </Text>
            </View>
          )}

          {isProjectConversation ? (
            <>
              <View
                onLayout={(event) => {
                  membersSectionOffsetY.current = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.sectionLabel}>
                  Members · {sortedParticipants.length}
                </Text>
              </View>
              <View style={styles.group}>
                {sortedParticipants.map((participant, index) => {
                  const label = formatMemberDisplayLabel({
                    displayName: participant.displayName,
                    email: participant.email,
                    userId: participant.userId,
                    role: participant.role,
                  });
                  return (
                    <View key={participant.projectMemberId}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.row,
                          pressed && styles.rowPressed,
                        ]}
                        onPress={() =>
                          openMemberProfile(participant.projectMemberId)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`View ${label}`}
                      >
                        <UserAvatar
                          imageUrl={participant.avatarUrl}
                          size={44}
                          style={styles.rowAvatar}
                        />
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowPrimary} numberOfLines={1}>
                            {label}
                          </Text>
                          <Text style={styles.rowSecondary} numberOfLines={1}>
                            {formatProjectMemberRoleLabel(participant.role)}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#98A2B3"
                        />
                      </Pressable>
                      {index < sortedParticipants.length - 1 ? (
                        <View style={styles.rowSeparator} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </>
          ) : otherParticipants.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Contact</Text>
              <View style={styles.group}>
                {otherParticipants.map((participant) => {
                  const label = formatMemberDisplayLabel({
                    displayName: participant.displayName,
                    email: participant.email,
                    userId: participant.userId,
                    role: participant.role,
                  });
                  return (
                    <Pressable
                      key={participant.projectMemberId}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() =>
                        openMemberProfile(participant.projectMemberId)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`View member profile for ${label}`}
                    >
                      <UserAvatar
                        imageUrl={participant.avatarUrl}
                        size={44}
                        style={styles.rowAvatar}
                      />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowPrimary} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.rowSecondary} numberOfLines={1}>
                          {formatProjectMemberRoleLabel(participant.role)}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#98A2B3"
                      />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Shared content</Text>
          <View style={styles.group}>
            <View style={styles.subsectionHeader}>
              <Text style={styles.subsectionTitle}>Plan items</Text>
              <Text style={styles.subsectionCount}>
                {sharedPlanItems.length}
              </Text>
            </View>
            {sharedPlanItems.length === 0 ? (
              <Text style={styles.emptyRowText}>
                No plan items shared in this conversation yet.
              </Text>
            ) : (
              sharedPlanItems.map((entry, index) => {
                const label =
                  entry.presentation.label?.trim() || "Plan item";
                return (
                  <View key={entry.planItemId}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.row,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => {
                        if (entry.presentation.available) {
                          void openPlanItem(entry.planItemId);
                        }
                      }}
                      disabled={!entry.presentation.available}
                      accessibilityRole="button"
                      accessibilityLabel={`View plan item ${label}`}
                    >
                      <View style={styles.planItemIcon}>
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color={KEPLER_NAVY}
                        />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowPrimary} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.rowSecondary} numberOfLines={1}>
                          {entry.presentation.available
                            ? entry.presentation.typeLabel ?? "Plan item"
                            : "Not available to your access"}
                        </Text>
                      </View>
                      {entry.presentation.available ? (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color="#98A2B3"
                        />
                      ) : null}
                    </Pressable>
                    {index < sharedPlanItems.length - 1 ? (
                      <View style={styles.rowSeparator} />
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <Text style={styles.sectionLabel}>Project</Text>
          <View style={styles.group}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={openProject}
              accessibilityRole="button"
              accessibilityLabel={`Open project ${projectDisplayName}`}
            >
              <View style={styles.planItemIcon}>
                <Ionicons
                  name="business-outline"
                  size={18}
                  color={KEPLER_NAVY}
                />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowPrimary} numberOfLines={1}>
                  {projectDisplayName}
                </Text>
                <Text style={styles.rowSecondary} numberOfLines={1}>
                  View project
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.06)",
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 16,
    fontWeight: "600",
  },
  topBarPlaceholder: {
    width: 44,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 12,
    marginBottom: 4,
  },
  identityBlock: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 24,
  },
  identityBlockPressed: {
    opacity: 0.82,
  },
  rowAvatar: {
    marginRight: 12,
    flexShrink: 0,
  },
  identityTitle: {
    ...typography.title,
    color: "#101828",
    fontSize: 21,
    fontWeight: "600",
    marginTop: 14,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  identitySubtitle: {
    ...typography.body,
    color: "#667085",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  sectionLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 11.5,
    letterSpacing: 0.5,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.07)",
    overflow: "hidden",
    marginBottom: 8,
  },
  subsectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  subsectionTitle: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontSize: 14,
    fontWeight: "600",
  },
  subsectionCount: {
    ...typography.caption,
    color: "#98A2B3",
    fontSize: 12.5,
  },
  emptyRowText: {
    ...typography.body,
    color: "#667085",
    fontSize: 13,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowPressed: {
    backgroundColor: "rgba(1,33,105,0.04)",
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(15,23,42,0.07)",
    marginLeft: 56,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowPrimary: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 15,
    fontWeight: "600",
  },
  rowSecondary: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
    marginTop: 2,
  },
  planItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(1,33,105,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
});
