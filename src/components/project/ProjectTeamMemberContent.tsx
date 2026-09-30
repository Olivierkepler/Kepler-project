import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../../auth/AuthProvider";
import { ensureDirectConversation } from "../../services/api/conversations";
import { getRemoteProjectMembers } from "../../services/api/projects";
import { resolveProjectCollaborationContext } from "../../services/collaboration/projectCollaborationContext";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getDeltasForProject } from "../../store/deltas";
import { getMeasurementsForProject } from "../../store/measurements";
import { getPlanItemsForProject } from "../../store/planItems";
import {
  getProjectMembersForProject,
} from "../../store/projectMembers";
import { getProjectById } from "../../store/projects";
import {
  getWorkPackageAssignmentsForProject,
} from "../../store/workPackageAssignments";
import { getWorkPackagesForProject } from "../../store/workPackages";
import { colors, typography } from "../../theme/colors";
import type { Delta } from "../../types/delta";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  formatMemberDisplayLabel,
  type UserPresentationRecord,
} from "../../utils/domain/memberDisplay";
import { fetchMemberPresentationContext } from "../../utils/domain/memberPresentationContext";
import {
  getLatestDeltaForPlanItem,
  getLatestMeasurementForPlanItem,
} from "../../utils/domain/planItemFieldContext";
import { formatProjectMemberRoleLabel } from "../../utils/domain/memberRoleLabels";
import {
  buildTeamMemberWorkDetail,
  buildTeamProjectWorkMaps,
} from "../../utils/domain/teamMemberWork";
import PlanItemCard from "./PlanItemCard";
import UserAvatar from "../user/UserAvatar";

export type OpenChatConversationParams = {
  remoteProjectId: string;
  conversationId: string;
  titleHint?: string;
  subtitleHint?: string;
};

export type ProjectTeamMemberContentProps = {
  projectId: string;
  projectMemberId: string;
  onOpenPlanItem?: (planItemId: string) => void;
  onOpenConversation?: (params: OpenChatConversationParams) => void;
};

function formatStatusLabel(status: ProjectMember["status"]): string {
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

export default function ProjectTeamMemberContent({
  projectId,
  projectMemberId,
  onOpenPlanItem,
  onOpenConversation,
}: ProjectTeamMemberContentProps) {
  const { user } = useAuth();

  const [member, setMember] = useState<ProjectMember | null | undefined>(
    undefined,
  );
  const [memberIsLocal, setMemberIsLocal] = useState<boolean | null>(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [profileByUserId, setProfileByUserId] = useState<
    Map<string, UserPresentationRecord>
  >(() => new Map());
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [assignments, setAssignments] = useState<WorkPackageAssignment[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [deltas, setDeltas] = useState<Delta[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setMember(null);
        return;
      }

      const currentUserId = user.uid;
      let active = true;

      async function load() {
        const context = await resolveProjectCollaborationContext({
          currentUserId,
          projectId,
        });

        if (!active || !context) {
          if (active) {
            setMember(null);
          }
          return;
        }

        const { storageOwnerUid } = context;

        const [
          foundProject,
          memberItems,
          packageItems,
          assignmentItems,
          planItemItems,
          measurementItems,
          deltaItems,
        ] = await Promise.all([
          getProjectById(storageOwnerUid, projectId),
          getProjectMembersForProject(storageOwnerUid, projectId),
          getWorkPackagesForProject(storageOwnerUid, projectId),
          getWorkPackageAssignmentsForProject(storageOwnerUid, projectId),
          getPlanItemsForProject(storageOwnerUid, projectId),
          getMeasurementsForProject(storageOwnerUid, projectId),
          getDeltasForProject(storageOwnerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        if (!foundProject) {
          setMember(null);
          return;
        }

        let foundMember: ProjectMember | null =
          memberItems.find((item) => item.id === projectMemberId) ?? null;
        let isLocalMember = !!foundMember;

        const mappedRemoteId = await getRemoteProjectId(
          storageOwnerUid,
          projectId,
        );
        if (!active) return;
        if (!foundMember && mappedRemoteId) {
          try {
            foundMember =
              (await getRemoteProjectMembers(mappedRemoteId)).find(
                (item) => item.id === projectMemberId,
              ) ?? null;
            isLocalMember = false;
          } catch {
            // Existing local members continue to work when cloud reads fail.
          }
        }

        setMember(foundMember);
        setMemberIsLocal(isLocalMember);
        setWorkPackages(packageItems);
        setAssignments(assignmentItems);
        setPlanItems(planItemItems);
        setMeasurements(measurementItems);
        setDeltas(deltaItems);

        if (active) {
          setRemoteProjectId(mappedRemoteId ?? null);
        }

        if (foundMember) {
          try {
            const presentationContext = await fetchMemberPresentationContext({
              members: [foundMember],
            });

            if (active) {
              setProfileByUserId(
                new Map(presentationContext.profileByUserId ?? []),
              );
            }
          } catch {
            if (active) {
              setProfileByUserId(new Map());
            }
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, projectMemberId, user?.uid]),
  );

  const detail = useMemo(() => {
    if (!member) {
      return null;
    }

    const maps = buildTeamProjectWorkMaps({
      workPackages,
      assignments,
      planItems,
    });

    return buildTeamMemberWorkDetail({
      member,
      maps,
      measurements,
    });
  }, [assignments, member, measurements, planItems, workPackages]);

  if (member === undefined) {
    return <View style={styles.container} />;
  }

  if (!member || !detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Project member not found.</Text>
      </View>
    );
  }

  const profile = profileByUserId.get(member.userId);
  const displayLabel = formatMemberDisplayLabel({
    displayName: profile?.displayName,
    email: profile?.email,
    role: member.role,
    userId: member.userId,
  });
  const emailLabel = profile?.email?.trim() || null;
  const roleLabel = formatProjectMemberRoleLabel(member.role);
  const canMessage =
    !!remoteProjectId &&
    member.status === "active" &&
    member.userId !== user?.uid &&
    !!onOpenConversation;

  const handleMessage = async () => {
    if (!remoteProjectId || !canMessage || openingMessage) {
      return;
    }

    setOpeningMessage(true);
    setMessageError(null);
    try {
      const conversation = await ensureDirectConversation(
        remoteProjectId,
        member.id,
      );
      onOpenConversation?.({
        remoteProjectId,
        conversationId: conversation.id,
        titleHint: displayLabel,
        subtitleHint: roleLabel,
      });
    } catch (err) {
      setMessageError(
        err instanceof Error ? err.message : "Unable to open conversation.",
      );
    } finally {
      setOpeningMessage(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerCard}>
        <UserAvatar
          imageUrl={profile?.avatarUrl}
          size={64}
          style={styles.headerAvatar}
        />

        <Text style={styles.memberName} numberOfLines={2}>
          {displayLabel}
        </Text>
        <Text style={styles.memberRole}>{roleLabel}</Text>
        <Text style={styles.memberStatus}>
          {formatStatusLabel(member.status)}
        </Text>
        {emailLabel ? (
          <Text style={styles.memberEmail} numberOfLines={1}>
            {emailLabel}
          </Text>
        ) : null}

        {canMessage ? (
          <Pressable
            style={[
              styles.messageButton,
              openingMessage && styles.messageButtonDisabled,
            ]}
            onPress={() => {
              void handleMessage();
            }}
            disabled={openingMessage}
            accessibilityRole="button"
            accessibilityLabel={`Message ${displayLabel}`}
            accessibilityState={{
              disabled: openingMessage,
              busy: openingMessage,
            }}
          >
            <Text style={styles.messageButtonText}>Message</Text>
          </Pressable>
        ) : null}

        {messageError ? (
          <Text style={styles.messageError}>{messageError}</Text>
        ) : null}
      </View>

      {memberIsLocal ? (
        <>
      <Text style={styles.sectionEyebrow}>ASSIGNED WORK</Text>

      {detail.summary.hasAssignedWork ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>
            {detail.summary.workPackageCount} Work Package
            {detail.summary.workPackageCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.summaryLine}>
            {detail.summary.planItemCount} Plan Item
            {detail.summary.planItemCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.summaryLine}>
            {detail.summary.measuredCount} Measured
          </Text>
          <Text style={styles.summaryLine}>
            {detail.summary.pendingCount} Pending
          </Text>
        </View>
      ) : (
        <Text style={styles.emptyText}>No work assigned yet.</Text>
      )}

      {detail.workPackageGroups.map((group) => {
        const itemCountLabel = `${group.items.length} ${
          group.items.length === 1 ? "item" : "items"
        }`;

        return (
          <View key={group.workPackageId} style={styles.packageGroup}>
            <View style={styles.packageHeader}>
              <View style={styles.packageHeaderText}>
                <View style={styles.packageTitleRow}>
                  <Text style={styles.packageTitle} numberOfLines={2}>
                    {group.workPackageName}
                  </Text>
                  <Text style={styles.packageCount}>{itemCountLabel}</Text>
                </View>
                <Text style={styles.packageSummary}>
                  {group.measuredCount} measured · {group.pendingCount} pending
                </Text>
              </View>
            </View>

            {group.items.length === 0 ? (
              <Text style={styles.packageEmpty}>
                No Plan Items in this work package.
              </Text>
            ) : (
              group.items.map((item, index) => (
                <PlanItemCard
                  key={item.id}
                  item={item}
                  latestMeasurement={getLatestMeasurementForPlanItem(
                    measurements,
                    item.id,
                  )}
                  latestDelta={getLatestDeltaForPlanItem(deltas, item.id)}
                  showAssignmentMeta={false}
                  onPress={
                    onOpenPlanItem
                      ? () => onOpenPlanItem(item.id)
                      : undefined
                  }
                  showDivider={index !== group.items.length - 1}
                />
              ))
            )}
          </View>
        );
      })}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  headerCard: {
    marginTop: 8,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  headerAvatar: {
    marginBottom: 12,
  },
  memberName: {
    ...typography.title,
    color: colors.text.primary,
    textAlign: "center",
  },
  memberRole: {
    ...typography.bodyMedium,
    color: colors.text.secondary,
    marginTop: 4,
  },
  memberStatus: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 6,
  },
  memberEmail: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 8,
  },
  messageButton: {
    marginTop: 16,
    minHeight: 44,
    minWidth: 140,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  messageButtonDisabled: {
    opacity: 0.6,
  },
  messageButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  messageError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 10,
    textAlign: "center",
  },
  sectionEyebrow: {
    ...typography.caption,
    color: colors.brand.navy,
    marginTop: 28,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
    marginBottom: 8,
  },
  summaryLine: {
    ...typography.body,
    color: colors.text.primary,
  },
  packageGroup: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  packageHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "#FAFBFC",
  },
  packageHeaderText: {
    flex: 1,
  },
  packageTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  packageTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flex: 1,
    textTransform: "uppercase",
  },
  packageCount: {
    ...typography.caption,
    color: colors.text.muted,
  },
  packageSummary: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
  },
  packageEmpty: {
    ...typography.body,
    color: colors.text.secondary,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
