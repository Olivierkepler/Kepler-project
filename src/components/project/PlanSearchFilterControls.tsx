import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, typography } from "../../theme/colors";
import type { PlanListFilter } from "../../utils/domain/planWorkPackageGroups";

export type PlanStatusFilter = Extract<PlanListFilter, "all" | "measured" | "pending">;
export type PlanAssignmentFilter = Extract<PlanListFilter, "all" | "assigned" | "unassigned">;

type Props = {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  statusFilter: PlanStatusFilter;
  assignmentFilter: PlanAssignmentFilter;
  allowUnassigned?: boolean;
  onApply: (status: PlanStatusFilter, assignment: PlanAssignmentFilter) => void;
};

const STATUS_OPTIONS: { id: PlanStatusFilter; label: string }[] = [
  { id: "all", label: "Any" },
  { id: "measured", label: "Measured" },
  { id: "pending", label: "Pending" },
];

const ASSIGNMENT_OPTIONS: { id: PlanAssignmentFilter; label: string }[] = [
  { id: "all", label: "Any" },
  { id: "assigned", label: "Assigned" },
  { id: "unassigned", label: "Unassigned" },
];

export default function PlanSearchFilterControls({
  searchText,
  onSearchTextChange,
  statusFilter,
  assignmentFilter,
  allowUnassigned = true,
  onApply,
}: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [draftStatus, setDraftStatus] = useState(statusFilter);
  const [draftAssignment, setDraftAssignment] = useState(assignmentFilter);
  const filtersActive = statusFilter !== "all" || assignmentFilter !== "all";

  useEffect(() => {
    if (visible) {
      setDraftStatus(statusFilter);
      setDraftAssignment(assignmentFilter);
    }
  }, [assignmentFilter, statusFilter, visible]);

  const close = () => setVisible(false);
  const apply = () => {
    onApply(draftStatus, draftAssignment);
    close();
  };
  const reset = () => {
    setDraftStatus("all");
    setDraftAssignment("all");
    onApply("all", "all");
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={17} color={colors.text.muted} />
        <TextInput
          value={searchText}
          onChangeText={onSearchTextChange}
          placeholder="Search work packages or plan items..."
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search work packages or plan items"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchText.length > 0 ? (
          <Pressable
            onPress={() => onSearchTextChange("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={17} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={[styles.filterButton, filtersActive && styles.filterButtonActive]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Open plan filters"
        accessibilityState={{ selected: filtersActive }}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color={filtersActive ? colors.brand.navy : colors.text.secondary}
        />
        {filtersActive ? <View style={styles.activeDot} /> : null}
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close filters" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close filters">
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
            <Text style={styles.sectionLabel}>Status</Text>
            <View style={styles.optionsRow}>
              {STATUS_OPTIONS.map((option) => (
                <Option
                  key={option.id}
                  label={option.label}
                  selected={draftStatus === option.id}
                  onPress={() => setDraftStatus(option.id)}
                />
              ))}
            </View>
            <Text style={styles.sectionLabel}>Assignment</Text>
            <View style={styles.optionsRow}>
              {ASSIGNMENT_OPTIONS.filter((option) => allowUnassigned || option.id !== "unassigned").map((option) => (
                <Option
                  key={option.id}
                  label={option.label}
                  selected={draftAssignment === option.id}
                  onPress={() => setDraftAssignment(option.id)}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Pressable onPress={reset} style={styles.resetButton} accessibilityRole="button">
                <Text style={styles.resetLabel}>Reset</Text>
              </Pressable>
              <Pressable onPress={apply} style={styles.applyButton} accessibilityRole="button">
                <Text style={styles.applyLabel}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioCenter} /> : null}
      </View>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  searchBox: {
    height: 40,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "#F7F9FC",
  },
  searchInput: { ...typography.caption, flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text.primary },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: { borderColor: colors.brand.navy, backgroundColor: "#F5F7FB" },
  activeDot: { position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand.navy },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,24,40,0.32)" },
  sheet: {
    paddingTop: 18,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  sheetTitle: { ...typography.sectionTitle, color: colors.text.primary, textTransform: "capitalize" },
  sectionLabel: { ...typography.caption, color: colors.text.secondary, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  option: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  optionSelected: { borderColor: colors.brand.navy, backgroundColor: "#F5F7FB" },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.text.muted, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.brand.navy },
  radioCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand.navy },
  optionLabel: { ...typography.caption, color: colors.text.secondary },
  optionLabelSelected: { color: colors.brand.navy, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 12 },
  resetButton: { minHeight: 42, paddingHorizontal: 12, justifyContent: "center" },
  resetLabel: { ...typography.bodyMedium, color: colors.text.secondary },
  applyButton: { minHeight: 42, minWidth: 112, borderRadius: 10, backgroundColor: colors.brand.navy, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  applyLabel: { ...typography.button, color: "#FFFFFF" },
});
