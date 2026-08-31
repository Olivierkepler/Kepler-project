import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type { ChatPlanItemReferencePresentation } from "../../types/chat";
import { colors, typography } from "../../theme/colors";

type Props = {
  presentation: ChatPlanItemReferencePresentation | undefined;
  onViewPlanItem?: () => void;
  isMine?: boolean;
};

function formatQuantity(value: number, unit: string): string {
  if (unit === "ea") {
    return `${value} ${unit.toUpperCase()}`;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit.toUpperCase()}`;
}

function formatSigned(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit.toUpperCase()}`;
}

export default function ChatPlanItemReferenceCard({
  presentation,
  onViewPlanItem,
  isMine = false,
}: Props) {
  if (!presentation || !presentation.available) {
    return (
      <View
        style={[styles.card, isMine && styles.cardMine]}
        accessibilityRole="text"
        accessibilityLabel="Plan Item. This item is not available to your current project access."
      >
        <Text style={styles.eyebrow}>PLAN ITEM</Text>
        <Text style={styles.unavailable}>
          This item is not available to your current project access.
        </Text>
      </View>
    );
  }

  const label = presentation.label ?? "Plan Item";
  const unit = presentation.unit ?? "";
  const planned =
    presentation.plannedValue !== null && unit
      ? formatQuantity(presentation.plannedValue, unit)
      : null;
  const measured =
    presentation.latestFieldValue !== null && unit
      ? formatQuantity(presentation.latestFieldValue, unit)
      : null;
  const variance =
    presentation.variance !== null && unit
      ? formatSigned(presentation.variance, unit)
      : null;

  return (
    <View
      style={[styles.card, isMine && styles.cardMine]}
      accessibilityRole="summary"
      accessibilityLabel={`Plan Item. ${label}. ${planned ? `Planned ${planned}.` : ""} ${presentation.statusLabel ?? ""}`}
    >
      <Text style={styles.eyebrow}>PLAN ITEM</Text>
      <Text style={styles.title} numberOfLines={2}>
        {label}
        {presentation.typeLabel ? ` (${presentation.typeLabel})` : ""}
      </Text>
      {presentation.workPackageName ? (
        <Text style={styles.workPackage} numberOfLines={1}>
          {presentation.workPackageName}
        </Text>
      ) : null}

      <View style={styles.metaBlock}>
        {planned ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Planned</Text>
            <Text style={styles.metaValue}>{planned}</Text>
          </View>
        ) : null}
        {measured ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Latest field</Text>
            <Text style={styles.metaValue}>{measured}</Text>
          </View>
        ) : null}
        {variance && measured ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Variance</Text>
            <Text style={styles.metaValue}>{variance}</Text>
          </View>
        ) : null}
        {presentation.statusLabel ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{presentation.statusLabel}</Text>
          </View>
        ) : null}
      </View>

      {onViewPlanItem ? (
        <Pressable
          onPress={onViewPlanItem}
          style={styles.viewRow}
          accessibilityRole="button"
          accessibilityLabel="View Plan Item"
        >
          <Text style={styles.viewText}>View Plan Item</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.brand.navy} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 12,
    minWidth: 220,
    maxWidth: 280,
  },
  cardMine: {
    borderColor: "#D6EAF9",
    backgroundColor: "#F8FBFE",
  },
  eyebrow: {
    ...typography.caption,
    color: colors.brand.navy,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    marginTop: 6,
  },
  workPackage: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
  },
  metaBlock: {
    marginTop: 10,
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.text.muted,
  },
  metaValue: {
    ...typography.caption,
    color: colors.text.primary,
    textAlign: "right",
    flexShrink: 1,
  },
  unavailable: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
  },
  viewRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  viewText: {
    ...typography.bodyMedium,
    color: colors.brand.navy,
  },
});
