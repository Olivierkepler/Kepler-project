import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, typography } from "../../theme/colors";
import type { WorkPackageStatus } from "../../types/workPackage";
import WorkPackageImage from "./WorkPackageImage";
import {
  pickWorkPackageImage,
  type PickedWorkPackageImage,
} from "../../services/workPackages/workPackageImage";

export type WorkPackagePlanItemOption = {
  id: string;
  label: string;
};

export type WorkPackageFormValues = {
  name: string;
  description: string;
  status: WorkPackageStatus;
  planItemIds: string[];
  pickedImage?: PickedWorkPackageImage | null;
  removeImage?: boolean;
};

type Props = {
  visible: boolean;
  mode: "create" | "edit";
  nameOnly?: boolean;
  imageUrl?: string | null;
  initial?: WorkPackageFormValues | null;
  planItems: WorkPackagePlanItemOption[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: WorkPackageFormValues) => void;
};

const STATUS_OPTIONS: readonly {
  value: WorkPackageStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const EMPTY_VALUES: WorkPackageFormValues = {
  name: "",
  description: "",
  status: "draft",
  planItemIds: [],
};

export function formatWorkPackageStatusLabel(
  status: WorkPackageStatus,
): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready":
      return "Ready";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export default function WorkPackageEditorModal({
  visible,
  mode,
  nameOnly = false,
  imageUrl = null,
  initial,
  planItems,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<WorkPackageStatus>("draft");
  const [planItemIds, setPlanItemIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<PickedWorkPackageImage | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageActionBusy, setImageActionBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const seed = initial ?? EMPTY_VALUES;
    setName(seed.name);
    setDescription(seed.description);
    setStatus(seed.status);
    setPlanItemIds([...seed.planItemIds]);
    setPickedImage(null);
    setRemoveImage(false);
    setError(null);
  }, [visible, initial, imageUrl]);

  const selectedSet = useMemo(() => new Set(planItemIds), [planItemIds]);

  const togglePlanItem = (id: string) => {
    setPlanItemIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setError(null);
    onSubmit({
      name: trimmedName,
      description,
      status,
      planItemIds: [...planItemIds],
      pickedImage,
      removeImage,
    });
  };

  const handleChangeImage = async () => {
    if (saving || imageActionBusy) return;
    setImageActionBusy(true);
    try {
      const selected = await pickWorkPackageImage();
      if (selected) {
        setPickedImage(selected);
        setRemoveImage(false);
        setError(null);
      }
    } catch (pickError) {
      setError(
        pickError instanceof Error
          ? pickError.message
          : "Unable to choose a Work Package image.",
      );
    } finally {
      setImageActionBusy(false);
    }
  };

  const previewUri = pickedImage?.uri ?? (!removeImage ? imageUrl : null);

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
          { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            disabled={saving || imageActionBusy}
            accessibilityRole="button"
            accessibilityLabel="Cancel work package editor"
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.topTitle}>
            {mode === "create" ? "New Work Package" : "Edit Work Package"}
          </Text>
          <Pressable
            onPress={handleSubmit}
            disabled={saving || imageActionBusy}
            accessibilityRole="button"
            accessibilityLabel={
              mode === "create" ? "Save work package" : "Update work package"
            }
            hitSlop={8}
          >
            {saving ? (
              <ActivityIndicator color={colors.brand.blue} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {nameOnly && mode === "edit" ? (
            <View style={styles.imageSection}>
              <Text style={styles.fieldLabel}>WORK PACKAGE IMAGE</Text>
              <View style={styles.imageActionsRow}>
                <WorkPackageImage uri={previewUri} size={74} radius={13} />
                <View style={styles.imageActions}>
                  <Pressable
                    onPress={() => void handleChangeImage()}
                    disabled={saving || imageActionBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Change Work Package image"
                    style={styles.imageActionButton}
                  >
                    <Text style={styles.imageActionText}>
                      {imageActionBusy ? "Opening…" : "Change"}
                    </Text>
                  </Pressable>
                  {previewUri ? (
                    <Pressable
                      onPress={() => {
                        setPickedImage(null);
                        setRemoveImage(true);
                      }}
                      disabled={saving || imageActionBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Remove Work Package image"
                      style={styles.imageActionButton}
                    >
                      <Text style={styles.imageRemoveText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Text style={styles.helper}>Optional</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>
            {nameOnly ? "WORK PACKAGE NAME" : "NAME"}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Electrical Rough-In"
            placeholderTextColor={colors.text.muted}
            editable={!saving}
            accessibilityLabel="Work package name"
          />

          {!nameOnly ? (
            <>
              <Text style={styles.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional scope notes"
                placeholderTextColor={colors.text.muted}
                editable={!saving}
                multiline
                accessibilityLabel="Work package description"
              />

              <Text style={styles.fieldLabel}>STATUS</Text>
              <View style={styles.chipRow}>
                {STATUS_OPTIONS.map((option) => {
                  const selected = status === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setStatus(option.value)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Status ${option.label}`}
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

              <Text style={styles.fieldLabel}>PLAN ITEMS</Text>
              <Text style={styles.helper}>
                Select existing plan items for this scope. Empty is allowed.
              </Text>

              {planItems.length === 0 ? (
                <Text style={styles.emptyPlanItems}>
                  No plan items available on this project yet.
                </Text>
              ) : (
                planItems.map((item) => {
                  const selected = selectedSet.has(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.planRow,
                        selected && styles.planRowSelected,
                      ]}
                      onPress={() => togglePlanItem(item.id)}
                      disabled={saving}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Plan item ${item.label}`}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          selected && styles.checkboxSelected,
                        ]}
                      >
                        {selected ? (
                          <Text style={styles.checkboxMark}>✓</Text>
                        ) : null}
                      </View>
                      <Text style={styles.planLabel} numberOfLines={2}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
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
  },
  topTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  cancelText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
    minWidth: 56,
  },
  saveText: {
    ...typography.button,
    color: colors.brand.blue,
    minWidth: 56,
    textAlign: "right",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 40,
  },
  fieldLabel: {
    ...typography.metadata,
    color: colors.text.muted,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    ...typography.bodyLarge,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top",
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
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: colors.brand.blue,
    backgroundColor: "#EAF5FC",
  },
  chipText: {
    ...typography.button,
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: colors.brand.blue,
  },
  helper: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: 10,
  },
  imageSection: {
    marginBottom: 8,
  },
  imageActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  imageActions: {
    alignItems: "flex-start",
    gap: 6,
  },
  imageActionButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  imageActionText: {
    ...typography.button,
    color: colors.brand.blue,
  },
  imageRemoveText: {
    ...typography.button,
    color: colors.text.secondary,
  },
  emptyPlanItems: {
    ...typography.caption,
    color: colors.text.muted,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  planRowSelected: {
    borderColor: colors.brand.blue,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  checkboxSelected: {
    borderColor: colors.brand.blue,
    backgroundColor: colors.brand.blue,
  },
  checkboxMark: {
    ...typography.caption,
    color: "#FFFFFF",
  },
  planLabel: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.text.primary,
  },
  errorText: {
    ...typography.caption,
    marginTop: 16,
    color: colors.danger,
  },
});
