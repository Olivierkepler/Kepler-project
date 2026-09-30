import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../../auth/AuthProvider";
import {
  ensureProjectConversation,
  listMessageableMembers,
  listProjectConversations,
} from "../../services/api/conversations";
import {
  listProjectInvitations,
  type RemoteProjectInvitation,
} from "../../services/api/invitations";
import { getRemoteProjectMembers } from "../../services/api/projects";
import { resolveProjectCollaborationContext } from "../../services/collaboration/projectCollaborationContext";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import type {
  ChatParticipantPresentation,
  Conversation,
} from "../../types/chat";
import { getMeasurementsForProject } from "../../store/measurements";
import {
  findProjectMemberByUserId,
  getProjectMembersForProject,
} from "../../store/projectMembers";
import { getProjectById } from "../../store/projects";
import {
  getWorkPackageAssignmentsForProject,
} from "../../store/workPackageAssignments";
import { getWorkPackagesForProject } from "../../store/workPackages";
import { getPlanItemsForProject } from "../../store/planItems";
import { colors, typography } from "../../theme/colors";
import GroupAvatar from "../user/GroupAvatar";
import UserAvatar from "../user/UserAvatar";
import ProjectTeamsSection from "./ProjectTeamsSection";
import ProjectRecentAssignmentsSection from "./ProjectRecentAssignmentsSection";
import type {
  ProjectMember,
  ProjectMemberStatus,
} from "../../types/projectMember";
import type { Project } from "../../types/project";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  formatMemberDisplayLabel,
  type UserPresentationRecord,
} from "../../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";
import { formatProjectMemberRoleLabel } from "../../utils/domain/memberRoleLabels";
import {
  buildTeamMemberWorkSummaries,
  buildTeamProjectWorkMaps,
  formatTeamMemberWorkLine,
} from "../../utils/domain/teamMemberWork";

const KEPLER_NAVY = colors.brand.navy;
const CHEVRON_COLOR = colors.text.muted;

export type OpenChatConversationParams = {
  remoteProjectId: string;
  conversationId: string;
  titleHint?: string;
  subtitleHint?: string;
};

export type ProjectTeamContentProps = {
  projectId: string;
  /** Shared cloud project: projectId is already the remote Firestore id. */
  isShared?: boolean;
  /** Display name when local project row is unavailable (shared). */
  projectNameHint?: string;
  onInviteMember?: () => void;
  onOpenMember?: (projectMemberId: string) => void;
  onOpenConversation?: (params: OpenChatConversationParams) => void;
};

function formatStatusLabel(status: ProjectMemberStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "invited":
      return "Invited";
    case "removed":
      return "Removed";
    default:
      return status;
  }
}

function canInviteMembers(
  membership: ProjectMember | undefined,
): boolean {
  if (!membership) {
    return true;
  }

  if (membership.status !== "active") {
    return false;
  }

  return (
    membership.role === "owner" ||
    membership.role === "project_admin"
  );
}

function resolveDirectConversationPresentation(input: {
  conversation: Conversation;
  currentProjectMemberId?: string;
  members: ProjectMember[];
  messageableMembers: ChatParticipantPresentation[];
  profileByUserId: Map<string, UserPresentationRecord>;
}): {
  titleHint: string;
  subtitleHint: string;
  avatarUrl: string | null;
  rowPrimary: string;
  rowSecondary: string;
} {
  const otherMemberId =
    input.conversation.participantProjectMemberIds.find(
      (memberId) => memberId !== input.currentProjectMemberId,
    ) ?? input.conversation.participantProjectMemberIds[0];
  const member = input.members.find((item) => item.id === otherMemberId);
  const messageableMember = input.messageableMembers.find(
    (item) => item.projectMemberId === otherMemberId,
  );
  const profile = member
    ? input.profileByUserId.get(member.userId)
    : undefined;
  const label = formatMemberDisplayLabel({
    displayName: profile?.displayName ?? messageableMember?.displayName,
    email: profile?.email ?? messageableMember?.email,
    role: member?.role ?? messageableMember?.role,
    userId: member?.userId ?? messageableMember?.userId,
  });
  const subtitle = "Private conversation";

  return {
    titleHint: label,
    subtitleHint: subtitle,
    avatarUrl: profile?.avatarUrl ?? messageableMember?.avatarUrl ?? null,
    rowPrimary: label,
    rowSecondary:
      input.conversation.lastMessagePreview?.trim() || subtitle,
  };
}

export default function ProjectTeamContent({
  projectId,
  isShared = false,
  projectNameHint,
  onInviteMember,
  onOpenMember,
  onOpenConversation,
}: ProjectTeamContentProps) {
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [localMemberIds, setLocalMemberIds] = useState<Set<string>>(() => new Set());
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [assignments, setAssignments] = useState<WorkPackageAssignment[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    RemoteProjectInvitation[]
  >([]);
  const [canInvite, setCanInvite] = useState(false);
  const [inviteCloudReady, setInviteCloudReady] = useState(false);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [directConversations, setDirectConversations] = useState<Conversation[]>(
    [],
  );
  const [projectConversation, setProjectConversation] =
    useState<Conversation | null>(null);
  const [messageableMembers, setMessageableMembers] = useState<
    ChatParticipantPresentation[]
  >([]);
  const [openingProjectChat, setOpeningProjectChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [profileByUserId, setProfileByUserId] = useState<
    Map<string, UserPresentationRecord>
  >(() => new Map());

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setMembers([]);
        setWorkPackages([]);
        setAssignments([]);
        setPlanItems([]);
        setMeasurements([]);
        setPendingInvitations([]);
        setCanInvite(false);
        setInviteCloudReady(false);
        setRemoteProjectId(null);
        setDirectConversations([]);
        setProjectConversation(null);
        setMessageableMembers([]);
        setInvitationsError(null);
        setChatError(null);
        return;
      }

      const currentUserId = user.uid;
      let active = true;

      async function loadChatExtras(mappedRemoteId: string) {
        setMessageableMembers([]);
        try {
          const conversations = await listProjectConversations(mappedRemoteId);
          if (!active) {
            return;
          }
          setDirectConversations(
            conversations.filter((item) => item.type === "direct"),
          );
          setProjectConversation(
            conversations.find((item) => item.type === "project") ?? null,
          );
          setChatError(null);

          try {
            const presentations = await listMessageableMembers(mappedRemoteId);
            if (active) {
              setMessageableMembers(presentations);
            }
          } catch {
            if (active) {
              setMessageableMembers([]);
            }
          }
        } catch (err) {
          if (!active) {
            return;
          }
          setDirectConversations([]);
          setProjectConversation(null);
          setMessageableMembers([]);
          setChatError(
            err instanceof Error
              ? err.message
              : "Conversations could not be loaded.",
          );
        }
      }

      async function load() {
        if (isShared) {
          setProject(null);
          setMembers([]);
          setWorkPackages([]);
          setAssignments([]);
          setPlanItems([]);
          setMeasurements([]);
          setPendingInvitations([]);
          setCanInvite(false);
          setInviteCloudReady(false);
          setRemoteProjectId(projectId);
          setInvitationsError(null);
          await loadChatExtras(projectId);
          return;
        }

        const context = await resolveProjectCollaborationContext({
          currentUserId,
          projectId,
        });

        if (!active) {
          return;
        }

        if (!context) {
          setProject(null);
          setMembers([]);
          setWorkPackages([]);
          setAssignments([]);
          setPlanItems([]);
          setMeasurements([]);
          setPendingInvitations([]);
          setCanInvite(false);
          setInviteCloudReady(false);
          setRemoteProjectId(null);
          setDirectConversations([]);
          setProjectConversation(null);
          setMessageableMembers([]);
          setInvitationsError(null);
          return;
        }

        const { storageOwnerUid } = context;

        const [
          found,
          memberItems,
          membership,
          mappedRemoteId,
          packageItems,
          assignmentItems,
          planItemItems,
          measurementItems,
        ] = await Promise.all([
          getProjectById(storageOwnerUid, projectId),
          getProjectMembersForProject(storageOwnerUid, projectId),
          findProjectMemberByUserId(
            storageOwnerUid,
            projectId,
            currentUserId,
          ),
          getRemoteProjectId(storageOwnerUid, projectId),
          getWorkPackagesForProject(storageOwnerUid, projectId),
          getWorkPackageAssignmentsForProject(storageOwnerUid, projectId),
          getPlanItemsForProject(storageOwnerUid, projectId),
          getMeasurementsForProject(storageOwnerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        if (!found) {
          setProject(null);
          setMembers([]);
          setWorkPackages([]);
          setAssignments([]);
          setPlanItems([]);
          setMeasurements([]);
          setPendingInvitations([]);
          setCanInvite(false);
          setInviteCloudReady(false);
          setRemoteProjectId(null);
          setDirectConversations([]);
          setProjectConversation(null);
          setMessageableMembers([]);
          setInvitationsError(null);
          return;
        }

        const sortedMembers = [...memberItems].sort((a, b) => {
          if (a.role === "owner" && b.role !== "owner") {
            return -1;
          }
          if (b.role === "owner" && a.role !== "owner") {
            return 1;
          }
          return a.userId.localeCompare(b.userId);
        });

        let displayMembers: ProjectMember[] = sortedMembers;
        if (
          mappedRemoteId &&
          (!membership || membership.role === "owner")
        ) {
          try {
            const remoteMembers = await getRemoteProjectMembers(mappedRemoteId);
            if (remoteMembers.length > 0) {
              displayMembers = [...remoteMembers].sort((a, b) => {
                if (a.role === "owner" && b.role !== "owner") return -1;
                if (b.role === "owner" && a.role !== "owner") return 1;
                return a.userId.localeCompare(b.userId);
              });
            }
          } catch {
            // Local member rows remain available if owner cloud reads fail.
          }
        }

        if (!active) return;

        setProject(found);
        setMembers(displayMembers);
        setLocalMemberIds(new Set(memberItems.map((member) => member.id)));
        setWorkPackages(packageItems);
        setAssignments(assignmentItems);
        setPlanItems(planItemItems);
        setMeasurements(measurementItems);
        setCanInvite(canInviteMembers(membership));
        setInviteCloudReady(!!mappedRemoteId);
        setRemoteProjectId(mappedRemoteId ?? null);

        try {
          const presentationContext = await fetchMemberPresentationContext({
            members: displayMembers,
          });

          if (!active) {
            return;
          }

          setProfileByUserId(
            new Map(presentationContext.profileByUserId ?? []),
          );
        } catch {
          if (active) {
            setProfileByUserId(new Map());
          }
        }

        if (mappedRemoteId) {
          try {
            const cloudInvites = await listProjectInvitations(mappedRemoteId);
            if (!active) {
              return;
            }
            setPendingInvitations(
              cloudInvites.filter((item) => item.status === "pending"),
            );
            setInvitationsError(null);
          } catch (err) {
            if (!active) {
              return;
            }
            setPendingInvitations([]);
            setInvitationsError(
              err instanceof Error
                ? err.message
                : "Pending invitations could not be loaded.",
            );
          }

          await loadChatExtras(mappedRemoteId);
        } else {
          setPendingInvitations([]);
          setInvitationsError(null);
          setDirectConversations([]);
          setProjectConversation(null);
          setMessageableMembers([]);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [isShared, projectId, user?.uid]),
  );

  const workMaps = useMemo(
    () =>
      buildTeamProjectWorkMaps({
        workPackages,
        assignments,
        planItems,
      }),
    [assignments, planItems, workPackages],
  );

  const memberSummaries = useMemo(
    () =>
      buildTeamMemberWorkSummaries({
        members,
        maps: workMaps,
        measurements,
      }),
    [members, measurements, workMaps],
  );

  const memberCountLabel = useMemo(
    () => String(members.length),
    [members.length],
  );

  const pendingCountLabel = useMemo(
    () => String(pendingInvitations.length),
    [pendingInvitations.length],
  );

  const displayProjectName =
    project?.name?.trim() || projectNameHint?.trim() || "Project";

  const currentProjectMember = useMemo(() => {
    if (!user?.uid) {
      return undefined;
    }

    return members.find((member) => member.userId === user.uid);
  }, [members, user?.uid]);

  const canManageTeams =
    !isShared &&
    !!remoteProjectId &&
    (!currentProjectMember ||
      (currentProjectMember.status === "active" &&
        currentProjectMember.role === "owner"));

  const handleOpenProjectChat = async () => {
    if (!remoteProjectId || openingProjectChat) {
      return;
    }

    setOpeningProjectChat(true);
    setChatError(null);
    try {
      const conversation = await ensureProjectConversation(remoteProjectId);
      onOpenConversation?.({
        remoteProjectId,
        conversationId: conversation.id,
        titleHint: displayProjectName,
        subtitleHint: "Project Chat",
      });
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Unable to open Project Chat.",
      );
    } finally {
      setOpeningProjectChat(false);
    }
  };

  if (project === undefined && !isShared) {
    return <View style={styles.container} />;
  }

  if (!project && !isShared) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Project not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      {canInvite && !inviteCloudReady ? (
        <View style={styles.syncNotice}>
          <Ionicons
            name="cloud-offline-outline"
            size={16}
            color={colors.delta}
          />
          <Text style={styles.syncNoticeText}>
            Cloud sync is required before invitations can be sent.
          </Text>
        </View>
      ) : null}

      {invitationsError ? (
        <Text style={styles.errorText}>{invitationsError}</Text>
      ) : null}

      {members.length > 0 ? (
        <>
          <View style={styles.memberSectionHeader}>
            <Text style={styles.memberSectionTitle}>Project Members</Text>
            <View style={styles.memberHeaderActions}>
              <Text style={styles.memberSectionCount}>{memberCountLabel} members</Text>
              {canInvite && inviteCloudReady ? (
                <Pressable
                  onPress={() => onInviteMember?.()}
                  style={styles.inviteButton}
                  accessibilityRole="button"
                  accessibilityLabel="Invite project member"
                >
                  <Ionicons name="person-add-outline" size={15} color={colors.brand.navy} />
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {members.map((member) => {
            const isOwner = member.role === "owner";
            const localMember = localMemberIds.has(member.id);
            const profile = profileByUserId.get(member.userId);
            const displayLabel = formatMemberDisplayLabel({
              displayName: profile?.displayName,
              email: profile?.email,
              role: member.role,
              userId:
                localMember || profile?.displayName || profile?.email
                  ? member.userId
                  : undefined,
            });
            const summary = localMember ? memberSummaries.get(member.id) : undefined;
            const workLine = localMember
              ? summary ? formatTeamMemberWorkLine(summary) : "No work assigned yet"
              : "";
            const packageLine = localMember ? summary?.workPackageLabel ?? "" : "";

            return (
              <View key={member.id}>
                <Pressable
                  onPress={() => onOpenMember?.(member.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayLabel}, ${formatProjectMemberRoleLabel(member.role)}${workLine ? `, ${workLine}` : ""}`}
                  style={({ pressed }) => [
                    styles.memberRow,
                    pressed && styles.memberRowPressed,
                  ]}
                >
                  <UserAvatar
                    imageUrl={
                      profile?.avatarUrl ??
                      messageableMembers.find(
                        (item) => item.projectMemberId === member.id,
                      )?.avatarUrl
                    }
                    size={44}
                    isOwner={isOwner}
                    style={styles.memberRowAvatar}
                  />

                  <View style={styles.memberRowContent}>
                    <Text
                      style={[
                        styles.memberRowPrimary,
                        isOwner && styles.ownerMemberRowPrimary,
                      ]}
                      numberOfLines={1}
                    >
                      {displayLabel}
                    </Text>
                    {profile?.email?.trim() ? (
                      <Text style={styles.memberRowWorkPackage} numberOfLines={1}>
                        {profile.email.trim()}
                      </Text>
                    ) : null}
                    {packageLine ? (
                      <Text style={styles.memberRowWorkPackage} numberOfLines={1}>
                        {packageLine}
                      </Text>
                    ) : null}
                    {workLine ? (
                      <Text style={styles.memberRowWorkSummary} numberOfLines={1}>
                        {workLine}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.memberRoleBadge}>
                    <Text style={styles.memberRoleBadgeText} numberOfLines={1}>
                      {formatProjectMemberRoleLabel(member.role)}
                      {member.status !== "active" ? ` · ${formatStatusLabel(member.status)}` : ""}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={CHEVRON_COLOR}
                  />
                </Pressable>
                <View style={styles.memberRowSeparator} />
              </View>
            );
          })}
        </>
      ) : null}

      {pendingInvitations.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending invitations</Text>
            <Text style={styles.sectionCount}>{pendingCountLabel}</Text>
          </View>

          {pendingInvitations.map((invitation) => (
            <View key={invitation.id}>
              <View style={styles.row}>
                <UserAvatar pending size={44} style={styles.rowAvatar} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {invitation.email}
                  </Text>
                  <Text style={styles.rowSecondary} numberOfLines={1}>
                    {formatProjectMemberRoleLabel(invitation.role)}
                  </Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>PENDING</Text>
                </View>
              </View>
              <View style={styles.rowSeparator} />
            </View>
          ))}
        </>
      ) : null}

      <ProjectTeamsSection
        projectId={remoteProjectId}
        canManage={canManageTeams}
      />

      <ProjectRecentAssignmentsSection
        remoteProjectId={remoteProjectId}
        navigationProjectId={projectId}
        isShared={isShared}
        members={members}
        profileByUserId={profileByUserId}
      />

      {remoteProjectId ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Project Chat</Text>
          </View>
          <Pressable
            onPress={() => { void handleOpenProjectChat(); }}
            disabled={openingProjectChat}
            accessibilityRole="button"
            accessibilityLabel="Open Project Chat"
            accessibilityState={{ disabled: openingProjectChat, busy: openingProjectChat }}
            style={({ pressed }) => [styles.row, styles.projectChatRow, pressed && styles.rowPressed, openingProjectChat && styles.chatRowDisabled]}
          >
            <GroupAvatar size={46} imageUrl={projectConversation?.avatarUrl} style={styles.rowAvatar} />
            <View style={styles.rowContent}>
              <Text style={styles.rowPrimary}>Project Chat</Text>
              <Text style={styles.rowSecondary}>Team conversation</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={CHEVRON_COLOR} />
          </Pressable>
          <View style={styles.rowSeparator} />
        </>
      ) : (
        <View style={[styles.syncNotice, styles.projectChatSyncNotice]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.delta} />
          <Text style={styles.syncNoticeText}>Cloud sync is required before Project Chat is available.</Text>
        </View>
      )}

      {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}

      {directConversations.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Direct conversations</Text>
            <Text style={styles.sectionCount}>{String(directConversations.length)}</Text>
          </View>
          {directConversations.map((conversation) => {
            const presentation = resolveDirectConversationPresentation({
              conversation,
              currentProjectMemberId: currentProjectMember?.id,
              members,
              messageableMembers,
              profileByUserId,
            });
            return (
              <View key={conversation.id}>
                <Pressable
                  onPress={() => {
                    if (!remoteProjectId) return;
                    onOpenConversation?.({ remoteProjectId, conversationId: conversation.id, titleHint: presentation.titleHint, subtitleHint: presentation.subtitleHint });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open direct conversation"
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <UserAvatar imageUrl={presentation.avatarUrl} size={44} style={styles.rowAvatar} />
                  <View style={styles.rowContent}>
                    <Text style={styles.rowPrimary} numberOfLines={1}>{presentation.rowPrimary}</Text>
                    <Text style={styles.rowSecondary} numberOfLines={1}>{presentation.rowSecondary}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={CHEVRON_COLOR} />
                </Pressable>
                <View style={styles.rowSeparator} />
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>

    {canInvite && !inviteCloudReady ? (
      <Pressable
        style={({ pressed }) => [
          styles.floatingAddButton,
          pressed && styles.floatingAddButtonPressed,
        ]}
        onPress={() => onInviteMember?.()}
        accessibilityRole="button"
        accessibilityLabel="Invite a team member"
        hitSlop={8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 100,
  },
  memberSectionHeader: {
    marginTop: 22,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberSectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    fontSize: 16,
  },
  memberSectionCount: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 12,
  },
  inviteButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "rgba(1, 33, 105, 0.06)",
  },
  inviteButtonText: {
    ...typography.caption,
    color: colors.brand.navy,
    fontWeight: "600",
  },
  memberEmptyText: {
    ...typography.body,
    color: colors.text.muted,
    marginVertical: 4,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingVertical: 10,
    paddingRight: 3,
  },
  memberRowPressed: {
    backgroundColor: colors.shadow.soft,
  },
  memberRowAvatar: {
    marginRight: 12,
    flexShrink: 0,
  },
  memberRowContent: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  memberRowPrimary: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  ownerMemberRowPrimary: {
    color: KEPLER_NAVY,
  },
  memberRowSecondary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  memberRoleBadge: {
    maxWidth: 112,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(1, 33, 105, 0.06)",
    marginRight: 7,
  },
  memberRoleBadgeText: {
    ...typography.metadata,
    color: colors.brand.navy,
  },
  memberRowWorkPackage: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 3,
  },
  memberRowWorkSummary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  memberRowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 58,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    fontSize: 16,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.text.muted,
    fontSize: 12,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.muted,
    marginVertical: 6,
  },
  syncNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.10)",
  },
  projectChatSyncNotice: {
    marginTop: 24,
  },
  syncNoticeText: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingVertical: 9,
    paddingRight: 3,
  },
  rowPressed: {
    backgroundColor: colors.shadow.soft,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 58,
  },
  rowAvatar: {
    marginRight: 12,
    flexShrink: 0,
  },
  chatRowDisabled: {
    opacity: 0.55,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  rowPrimary: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  ownerRowPrimary: {
    color: KEPLER_NAVY,
  },
  rowSecondary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  rowWorkPackage: {
    ...typography.caption,
    color: colors.brand.blue,
    marginTop: 3,
  },
  rowWorkSummary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  projectChatRow: {
    minHeight: 72,
    marginTop: 24,
    borderRadius: 10,
  },
  pendingBadge: {
    alignSelf: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.shadow.soft,
    marginLeft: 8,
    flexShrink: 0,
  },
  pendingBadgeText: {
    ...typography.metadata,
    color: colors.text.secondary,
    textTransform: "uppercase",
  },
  floatingAddButton: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: KEPLER_NAVY,
    shadowColor: KEPLER_NAVY,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 7,
    zIndex: 20,
  },
  floatingAddButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
});
