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

export type WorkPackagePlanItemOption = {
  id: string;
  label: string;
};

export type WorkPackageFormValues = {
  name: string;
  description: string;
  status: WorkPackageStatus;
  planItemIds: string[];
};

type Props = {
  visible: boolean;
  mode: "create" | "edit";
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

  useEffect(() => {
    if (!visible) {
      return;
    }

    const seed = initial ?? EMPTY_VALUES;
    setName(seed.name);
    setDescription(seed.description);
    setStatus(seed.status);
    setPlanItemIds([...seed.planItemIds]);
    setError(null);
  }, [visible, initial]);

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
    });
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
          { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            disabled={saving}
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
            disabled={saving}
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
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Electrical Rough-In"
            placeholderTextColor={colors.text.muted}
            editable={!saving}
            accessibilityLabel="Work package name"
          />

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
