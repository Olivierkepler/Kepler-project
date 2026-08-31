import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, typography } from "../../theme/colors";
import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import {
  assignmentProgressStatusColor,
  formatAssignmentProgressStatusLabel,
  getMemberProgressAction,
  getOwnerProgressActions,
  type OwnerProgressAction,
} from "../../utils/assignmentProgress";

const NOTE_MAX = 2000;

type Props = {
  status: WorkPackageAssignmentStatus;
  mode: "member" | "owner";
  mutating: boolean;
  onTransition: (
    nextStatus: WorkPackageAssignmentStatus,
    note?: string,
  ) => void;
  /** Owner complete may supply an external confirm (pending-review warning). */
  onOwnerCompleteRequest?: () => void;
};

/**
 * Assignment lifecycle action controls (Phase 2K.2).
 * Member vs owner surfaces are intentionally separate.
 */
export default function AssignmentProgressActions({
  status,
  mode,
  mutating,
  onTransition,
  onOwnerCompleteRequest,
}: Props) {
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    nextStatus: WorkPackageAssignmentStatus;
    label: string;
  } | null>(null);

  const statusColor = assignmentProgressStatusColor(status);
  const statusLabel = formatAssignmentProgressStatusLabel(status);

  const openNoteFlow = (
    nextStatus: WorkPackageAssignmentStatus,
    label: string,
  ) => {
    setPendingAction({ nextStatus, label });
    setNoteDraft("");
    setNoteVisible(true);
  };

  const submitNoteFlow = () => {
    if (!pendingAction || mutating) {
      return;
    }
    const trimmed = noteDraft.trim();
    onTransition(
      pendingAction.nextStatus,
      trimmed.length > 0 ? trimmed.slice(0, NOTE_MAX) : undefined,
    );
    setNoteVisible(false);
    setPendingAction(null);
    setNoteDraft("");
  };

  const runOwnerAction = (action: OwnerProgressAction) => {
    if (mutating) {
      return;
    }
    if (action.kind === "complete" && onOwnerCompleteRequest) {
      onOwnerCompleteRequest();
      return;
    }
    if (action.kind === "reopen" && action.requiresConfirm) {
      onTransition(action.nextStatus);
      return;
    }
    if (action.asksNote) {
      openNoteFlow(action.nextStatus, action.label);
      return;
    }
    onTransition(action.nextStatus);
  };

  const memberAction =
    mode === "member" ? getMemberProgressAction(status) : null;
  const ownerActions =
    mode === "owner" ? getOwnerProgressActions(status) : [];

  return (
    <View style={styles.wrap}>
      <Text
        style={[styles.statusChip, { color: statusColor }]}
        accessibilityRole="text"
        accessibilityLabel={`Assignment status ${statusLabel}`}
      >
        {statusLabel}
      </Text>

      {status === "ready_for_review" && mode === "member" ? (
        <Text style={styles.readyHint}>Ready for owner review</Text>
      ) : null}

      {memberAction ? (
        <Pressable
          style={[styles.primaryButton, mutating ? styles.disabled : null]}
          onPress={() => {
            if (mutating) {
              return;
            }
            if (memberAction.asksNote) {
              openNoteFlow(memberAction.nextStatus, memberAction.label);
              return;
            }
            onTransition(memberAction.nextStatus);
          }}
          disabled={mutating}
          accessibilityRole="button"
          accessibilityLabel={memberAction.label}
          accessibilityState={{ disabled: mutating }}
        >
          {mutating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{memberAction.label}</Text>
          )}
        </Pressable>
      ) : null}

      {ownerActions.length > 0 ? (
        <View style={styles.ownerRow}>
          {ownerActions.map((action) => {
            const isComplete = action.kind === "complete";
            return (
              <Pressable
                key={action.kind}
                style={[
                  isComplete ? styles.primaryButton : styles.secondaryButton,
                  styles.ownerButton,
                  mutating ? styles.disabled : null,
                ]}
                onPress={() => runOwnerAction(action)}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: mutating }}
              >
                {mutating ? (
                  <ActivityIndicator
                    color={isComplete ? "#FFFFFF" : colors.brand.blue}
                  />
                ) : (
                  <Text
                    style={
                      isComplete
                        ? styles.primaryButtonText
                        : styles.secondaryButtonText
                    }
                  >
                    {action.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Modal
        visible={noteVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!mutating) {
            setNoteVisible(false);
            setPendingAction(null);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pendingAction?.label ?? "Add note"}
            </Text>
            <Text style={styles.modalHint}>
              Optional note (max {NOTE_MAX} characters).
            </Text>
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={(value) => setNoteDraft(value.slice(0, NOTE_MAX))}
              placeholder="Add a short note"
              placeholderTextColor={colors.text.muted}
              multiline
              maxLength={NOTE_MAX}
              editable={!mutating}
              accessibilityLabel="Progress note"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => {
                  setNoteVisible(false);
                  setPendingAction(null);
                }}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirm,
                  mutating ? styles.disabled : null,
                ]}
                onPress={submitNoteFlow}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel="Confirm"
                accessibilityState={{ disabled: mutating }}
              >
                {mutating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    gap: 8,
  },
  statusChip: {
    ...typography.caption,
  },
  readyHint: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  ownerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ownerButton: {
    flexGrow: 1,
    flexBasis: "40%",
  },
  disabled: {
    opacity: 0.55,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  modalHint: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  noteInput: {
    ...typography.bodyLarge,
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    textAlignVertical: "top",
    color: colors.text.primary,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    ...typography.button,
    color: colors.text.secondary,
  },
  modalConfirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    ...typography.button,
    color: "#FFFFFF",
  },
});
