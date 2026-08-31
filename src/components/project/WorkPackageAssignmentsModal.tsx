import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, typography } from "../../theme/colors";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import { formatAssignmentProgressStatusLabel } from "../../utils/assignmentProgress";
import {
  type MemberPresentationContext,
  resolveMemberPresentation,
} from "../../utils/domain/memberDisplay";

export type AssignmentView = {
  id: string;
  workPackageId: string;
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
};

type Props = {
  visible: boolean;
  workPackageName: string;
  projectId: string;
  assignments: AssignmentView[];
  members: ProjectMember[];
  canMutate: boolean;
  /** True when local project has no ACTIVE members to assign. */
  noAssignableMembersAvailable: boolean;
  saving: boolean;
  onClose: () => void;
  onAssign: (projectMemberId: string) => void;
  onUpdateStatus: (
    assignmentId: string,
    status: WorkPackageAssignmentStatus,
  ) => void;
  onRemove: (assignmentId: string) => void;
  /** Presentation-only profile/email context for member labels. */
  presentationContext?: MemberPresentationContext;
};

const BLOCKING_STATUSES: readonly WorkPackageAssignmentStatus[] = [
  "assigned",
  "accepted",
  "in_progress",
  "ready_for_review",
  "completed",
];

const STATUS_OPTIONS: readonly {
  value: WorkPackageAssignmentStatus;
  label: string;
}[] = [
  { value: "assigned", label: "Assigned" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready_for_review", label: "Ready for review" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function formatAssignmentStatusLabel(
  status: WorkPackageAssignmentStatus,
): string {
  return formatAssignmentProgressStatusLabel(status);
}

export function isBlockingAssignmentStatus(
  status: WorkPackageAssignmentStatus,
): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(status);
}

/**
 * Resolve display fields from ProjectMember when present.
 * Falls back to profile/email presentation, then shortened identifier.
 */
export function resolveAssignmentMemberDisplay(
  projectId: string,
  projectMemberId: string,
  members: ProjectMember[],
  context?: MemberPresentationContext,
): { initial: string; label: string; roleLabel: string } {
  const display = resolveMemberPresentation({
    projectId,
    projectMemberId,
    members,
    context,
  });

  return {
    initial: display.initial,
    label: display.label,
    roleLabel: display.roleLabel,
  };
}

export default function WorkPackageAssignmentsModal({
  visible,
  workPackageName,
  projectId,
  assignments,
  members,
  canMutate,
  noAssignableMembersAvailable,
  saving,
  onClose,
  onAssign,
  onUpdateStatus,
  onRemove,
  presentationContext,
}: Props) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeAssignments = useMemo(
    () => assignments.filter((item) => item.status !== "cancelled"),
    [assignments],
  );

  const assignedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of assignments) {
      if (isBlockingAssignmentStatus(item.status)) {
        ids.add(item.projectMemberId);
      }
    }
    return ids;
  }, [assignments]);

  const assignableMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === "active" && !assignedMemberIds.has(member.id),
      ),
    [members, assignedMemberIds],
  );

  const confirmRemove = (assignment: AssignmentView) => {
    const display = resolveAssignmentMemberDisplay(
      projectId,
      assignment.projectMemberId,
      members,
      presentationContext,
    );

    Alert.alert(
      "Remove assignment?",
      `${display.label} will be removed from this work package. The member and work package are not deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(assignment.id),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.safe,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Close assignments"
            hitSlop={8}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            Assigned team
          </Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.workPackageName} numberOfLines={2}>
            {workPackageName}
          </Text>

          <Text style={styles.sectionLabel}>ASSIGNED TEAM</Text>

          {activeAssignments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No one assigned yet</Text>
              <Text style={styles.emptyBody}>
                {canMutate
                  ? "Assign ACTIVE project members to this work package."
                  : "The project owner has not assigned anyone yet."}
              </Text>
            </View>
          ) : (
            activeAssignments.map((assignment) => {
              const display = resolveAssignmentMemberDisplay(
                projectId,
                assignment.projectMemberId,
                members,
                presentationContext,
              );

              return (
                <View key={assignment.id} style={styles.memberCard}>
                  <View style={styles.memberTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{display.initial}</Text>
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberLabel} numberOfLines={1}>
                        {display.label}
                      </Text>
                      <Text style={styles.memberRole}>{display.roleLabel}</Text>
                    </View>
                    <Text style={styles.memberStatus}>
                      {formatAssignmentStatusLabel(assignment.status)}
                    </Text>
                  </View>

                  {canMutate ? (
                    <>
                      <Text style={styles.fieldLabel}>STATUS</Text>
                      <View style={styles.chipRow}>
                        {STATUS_OPTIONS.map((option) => {
                          const selected = assignment.status === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              style={[
                                styles.chip,
                                selected && styles.chipSelected,
                              ]}
                              disabled={saving}
                              onPress={() =>
                                onUpdateStatus(assignment.id, option.value)
                              }
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              accessibilityLabel={`Set status ${option.label}`}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  selected && styles.chipTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Pressable
                        onPress={() => confirmRemove(assignment)}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${display.label}`}
                        style={styles.removeButton}
                      >
                        <Text style={styles.removeText}>Remove</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              );
            })
          )}

          {canMutate ? (
            <Pressable
              style={styles.assignButton}
              disabled={saving}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Assign member"
            >
              {saving ? (
                <ActivityIndicator color={colors.brand.blue} />
              ) : (
                <Text style={styles.assignButtonText}>+ Assign member</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>

        <Modal
          visible={pickerOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setPickerOpen(false)}
        >
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Assign member</Text>
              <Text style={styles.pickerSubtitle}>
                ACTIVE project members only.
              </Text>

              {noAssignableMembersAvailable ? (
                <Text style={styles.pickerEmpty}>
                  No ACTIVE project members are available. Add team members
                  first.
                </Text>
              ) : assignableMembers.length === 0 ? (
                <Text style={styles.pickerEmpty}>
                  Every ACTIVE member is already assigned to this work package.
                </Text>
              ) : (
                <ScrollView style={styles.pickerList}>
                  {assignableMembers.map((member) => {
                    const display = resolveAssignmentMemberDisplay(
                      projectId,
                      member.id,
                      members,
                      presentationContext,
                    );

                    return (
                    <Pressable
                      key={member.id}
                      style={styles.pickerRow}
                      disabled={saving}
                      onPress={() => {
                        setPickerOpen(false);
                        onAssign(member.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Assign ${display.label}`}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {display.initial}
                        </Text>
                      </View>
                      <View style={styles.memberCopy}>
                        <Text style={styles.memberLabel} numberOfLines={1}>
                          {display.label}
                        </Text>
                        <Text style={styles.memberRole}>
                          {display.roleLabel}
                        </Text>
                      </View>
                    </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Pressable
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel assign member"
                style={styles.pickerCancel}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  closeText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
    minWidth: 56,
  },
  topTitle: {
    ...typography.bodyMedium,
    flex: 1,
    textAlign: "center",
    color: colors.text.primary,
  },
  topSpacer: {
    minWidth: 56,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
  },
  workPackageName: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    marginBottom: 18,
  },
  sectionLabel: {
    ...typography.metadata,
    color: colors.text.muted,
    marginBottom: 10,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
  },
  emptyTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  emptyBody: {
    ...typography.body,
    marginTop: 6,
    color: colors.text.secondary,
  },
  memberCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 10,
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EAF5FC",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.bodyMedium,
    color: colors.brand.blue,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberLabel: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  memberRole: {
    ...typography.caption,
    marginTop: 2,
    color: colors.text.secondary,
  },
  memberStatus: {
    ...typography.caption,
    color: colors.brand.blue,
  },
  fieldLabel: {
    ...typography.metadata,
    marginTop: 14,
    marginBottom: 8,
    color: colors.text.muted,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    minHeight: 36,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: colors.brand.blue,
    backgroundColor: "#EAF5FC",
  },
  chipText: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: colors.brand.blue,
  },
  removeButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
  },
  removeText: {
    ...typography.button,
    color: colors.danger,
  },
  assignButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  assignButtonText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: "70%",
  },
  pickerTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  pickerSubtitle: {
    ...typography.caption,
    marginTop: 4,
    marginBottom: 14,
    color: colors.text.secondary,
  },
  pickerEmpty: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  pickerList: {
    maxHeight: 320,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  pickerCancel: {
    marginTop: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCancelText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
  },
});
