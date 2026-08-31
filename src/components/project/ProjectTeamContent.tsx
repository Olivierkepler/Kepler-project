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
  listProjectConversations,
} from "../../services/api/conversations";
import {
  listProjectInvitations,
  type RemoteProjectInvitation,
} from "../../services/api/invitations";
import { resolveProjectCollaborationContext } from "../../services/collaboration/projectCollaborationContext";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import type { Conversation } from "../../types/chat";
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
  memberDisplayInitial,
  type UserPresentationRecord,
} from "../../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";
import { formatProjectMemberRoleLabel } from "../../utils/domain/memberRoleLabels";
import {
  buildTeamMemberWorkSummaries,
  buildTeamProjectWorkMaps,
  formatTeamMemberWorkLine,
} from "../../utils/domain/teamMemberWork";

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
        setInvitationsError(null);
        setChatError(null);
        return;
      }

      const currentUserId = user.uid;
      let active = true;

      async function loadChatExtras(mappedRemoteId: string) {
        try {
          const conversations = await listProjectConversations(mappedRemoteId);
          if (!active) {
            return;
          }
          setDirectConversations(
            conversations.filter((item) => item.type === "direct"),
          );
          setChatError(null);
        } catch (err) {
          if (!active) {
            return;
          }
          setDirectConversations([]);
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

        setProject(found);
        setMembers(sortedMembers);
        setWorkPackages(packageItems);
        setAssignments(assignmentItems);
        setPlanItems(planItemItems);
        setMeasurements(measurementItems);
        setCanInvite(canInviteMembers(membership));
        setInviteCloudReady(!!mappedRemoteId);
        setRemoteProjectId(mappedRemoteId ?? null);

        try {
          const presentationContext = await fetchMemberPresentationContext({
            members: sortedMembers,
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
        <Text style={styles.title}>Project not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>PROJECT COLLABORATION</Text>
      <Text style={styles.title}>Project Team</Text>
      <Text style={styles.subtitle}>
        {isShared
          ? "Collaborate with the people on this project."
          : "Manage the people working on this project."}
      </Text>
      <Text style={styles.projectName}>{displayProjectName}</Text>

      {canInvite ? (
        <Pressable
          style={styles.inviteButton}
          onPress={() => onInviteMember?.()}
          accessibilityRole="button"
          accessibilityLabel="Invite member"
        >
          <Text style={styles.inviteButtonText}>+ Invite member</Text>
        </Pressable>
      ) : null}

      {canInvite && !inviteCloudReady ? (
        <Text style={styles.cloudHint}>
          Cloud sync is required before invitations can be sent.
        </Text>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Project Chat</Text>
      </View>

      {remoteProjectId ? (
        <Pressable
          onPress={() => {
            void handleOpenProjectChat();
          }}
          disabled={openingProjectChat}
          accessibilityRole="button"
          accessibilityLabel="Open Project Chat"
          accessibilityState={{ disabled: openingProjectChat, busy: openingProjectChat }}
          style={({ pressed }) => [
            styles.rowCard,
            styles.chatRowCard,
            pressed && styles.rowCardPressed,
            openingProjectChat && styles.chatRowDisabled,
          ]}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowPrimary}>Project Chat</Text>
            <Text style={styles.rowSecondary}>Team conversation</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
        </Pressable>
      ) : (
        <Text style={styles.emptyText}>
          Cloud sync is required before Project Chat is available.
        </Text>
      )}

      {chatError ? <Text style={styles.errorText}>{chatError}</Text> : null}

      {directConversations.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Direct conversations</Text>
            <Text style={styles.sectionCount}>
              {String(directConversations.length)}
            </Text>
          </View>
          {directConversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              onPress={() => {
                if (!remoteProjectId) {
                  return;
                }
                onOpenConversation?.({
                  remoteProjectId,
                  conversationId: conversation.id,
                  titleHint: "Direct Chat",
                  subtitleHint: "Private conversation",
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Open direct conversation"
              style={({ pressed }) => [
                styles.rowCard,
                pressed && styles.rowCardPressed,
              ]}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowPrimary}>Direct Chat</Text>
                <Text style={styles.rowSecondary} numberOfLines={1}>
                  {conversation.lastMessagePreview?.trim() ||
                    "Private conversation"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
            </Pressable>
          ))}
        </>
      ) : null}

      {!isShared ? (
        <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Members</Text>
        <Text style={styles.sectionCount}>{memberCountLabel}</Text>
      </View>

      {members.length === 0 ? (
        <Text style={styles.emptyText}>No project members yet.</Text>
      ) : (
        members.map((member) => {
          const isOwner = member.role === "owner";
          const profile = profileByUserId.get(member.userId);
          const displayLabel = formatMemberDisplayLabel({
            displayName: profile?.displayName,
            email: profile?.email,
            role: member.role,
            userId: member.userId,
          });
          const summary = memberSummaries.get(member.id);
          const workLine = summary
            ? formatTeamMemberWorkLine(summary)
            : "No work assigned yet";
          const packageLine = summary?.workPackageLabel ?? "";

          return (
            <Pressable
              key={member.id}
              onPress={() => onOpenMember?.(member.id)}
              accessibilityRole="button"
              accessibilityLabel={`${displayLabel}, ${formatProjectMemberRoleLabel(member.role)}, ${workLine}`}
              style={({ pressed }) => [
                styles.rowCard,
                isOwner && styles.ownerRowCard,
                pressed && styles.rowCardPressed,
              ]}
            >
              <View style={[styles.avatar, isOwner && styles.ownerAvatar]}>
                <Text
                  style={[
                    styles.avatarText,
                    isOwner && styles.ownerAvatarText,
                  ]}
                >
                  {memberDisplayInitial(displayLabel)}
                </Text>
              </View>

              <View style={styles.rowContent}>
                <Text style={styles.rowPrimary} numberOfLines={1}>
                  {displayLabel}
                </Text>
                <Text style={styles.rowSecondary}>
                  {formatProjectMemberRoleLabel(member.role)}
                  {member.status !== "active"
                    ? ` · ${formatStatusLabel(member.status)}`
                    : ""}
                </Text>
                {packageLine ? (
                  <Text style={styles.rowWorkPackage} numberOfLines={1}>
                    {packageLine}
                  </Text>
                ) : null}
                <Text style={styles.rowWorkSummary} numberOfLines={1}>
                  {workLine}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
            </Pressable>
          );
        })
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pending invitations</Text>
        <Text style={styles.sectionCount}>{pendingCountLabel}</Text>
      </View>

      {invitationsError ? (
        <Text style={styles.errorText}>{invitationsError}</Text>
      ) : null}

      {!inviteCloudReady ? (
        <Text style={styles.emptyText}>
          Pending cloud invitations appear after this project is connected.
        </Text>
      ) : pendingInvitations.length === 0 ? (
        <Text style={styles.emptyText}>No pending invitations.</Text>
      ) : (
        pendingInvitations.map((invitation) => (
          <View key={invitation.id} style={styles.rowCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {memberDisplayInitial(
                  formatMemberDisplayLabel({ email: invitation.email }),
                )}
              </Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowPrimary} numberOfLines={1}>
                {invitation.email}
              </Text>
              <Text style={styles.rowSecondary}>
                {formatProjectMemberRoleLabel(invitation.role)} · Pending
              </Text>
            </View>
          </View>
        ))
      )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.text.muted,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
    marginTop: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
  },
  projectName: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    marginTop: 10,
  },
  inviteButton: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  inviteButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  sectionHeader: {
    marginTop: 30,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.brand.navy,
    textTransform: "uppercase",
  },
  sectionCount: {
    ...typography.caption,
    color: colors.text.muted,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  cloudHint: {
    ...typography.caption,
    color: colors.delta,
    marginTop: 10,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: 8,
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  chatRowCard: {
    borderColor: "#D6EAF9",
    backgroundColor: "#F8FBFE",
  },
  chatRowDisabled: {
    opacity: 0.6,
  },
  rowCardPressed: {
    backgroundColor: "#F8FAFC",
  },
  ownerRowCard: {
    borderColor: "#D6EAF9",
    backgroundColor: "#F8FBFE",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F8FD",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  ownerAvatar: {
    backgroundColor: colors.brand.blue,
  },
  avatarText: {
    ...typography.bodyMedium,
    color: colors.brand.blue,
  },
  ownerAvatarText: {
    color: "#FFFFFF",
  },
  rowContent: {
    flex: 1,
    paddingRight: 8,
  },
  rowPrimary: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  rowSecondary: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 3,
  },
  rowWorkPackage: {
    ...typography.caption,
    color: colors.text.primary,
    marginTop: 6,
  },
  rowWorkSummary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
});
