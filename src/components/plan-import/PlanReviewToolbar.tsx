import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../../theme/colors";
import type { PlanImportReviewFilter } from "../../utils/planImportReview";

const FILTERS: readonly {
  id: PlanImportReviewFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "selected", label: "Selected" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "reviewed", label: "Reviewed" },
];

type Props = {
  filter: PlanImportReviewFilter;
  onFilterChange: (filter: PlanImportReviewFilter) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  bulkBusy?: boolean;
  disableBulk?: boolean;
};

export default function PlanReviewToolbar({
  filter,
  onFilterChange,
  onSelectAll,
  onDeselectAll,
  bulkBusy = false,
  disableBulk = false,
}: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityRole="tablist"
      >
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => onFilterChange(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filter ${item.label}`}
            >
              <Text
                style={[styles.chipText, active ? styles.chipTextActive : null]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.bulkRow}>
        <Pressable
          onPress={onSelectAll}
          disabled={disableBulk || bulkBusy}
          accessibilityRole="button"
          accessibilityLabel="Select all suggestions"
          hitSlop={8}
        >
          <Text
            style={[
              styles.bulkAction,
              disableBulk || bulkBusy ? styles.bulkActionDisabled : null,
            ]}
          >
            Select all
          </Text>
        </Pressable>
        <Text style={styles.bulkDivider}>·</Text>
        <Pressable
          onPress={onDeselectAll}
          disabled={disableBulk || bulkBusy}
          accessibilityRole="button"
          accessibilityLabel="Deselect all suggestions"
          hitSlop={8}
        >
          <Text
            style={[
              styles.bulkAction,
              disableBulk || bulkBusy ? styles.bulkActionDisabled : null,
            ]}
          >
            Deselect all
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.12)",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  chipActive: {
    backgroundColor: "#012169",
    borderColor: "#012169",
  },
  chipText: {
    ...typography.button,
    color: colors.text.secondary,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkAction: {
    ...typography.button,
    color: "#012169",
  },
  bulkActionDisabled: {
    color: colors.text.muted,
  },
  bulkDivider: {
    ...typography.caption,
    color: colors.text.muted,
  },
});
