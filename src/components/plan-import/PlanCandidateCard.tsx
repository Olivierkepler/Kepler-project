import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors, typography } from "../../theme/colors";
import type { RemotePlanImportCandidate } from "../../services/api/planImports";
import {
  candidateHasHumanEdits,
  candidateNeedsAttention,
  confidenceBand,
  formatCandidateType,
  formatPlannedValue,
} from "../../utils/planImportReview";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";
const TEXT_PRIMARY = "#101828";
const TEXT_SECONDARY = "#667085";
const TEXT_MUTED = "#98A2B3";

/** Width of selection control + gap before text column. */
export const CANDIDATE_TEXT_INDENT = 32;

type Props = {
  candidate: RemotePlanImportCandidate;
  sourceFileName?: string;
  selectBusy?: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onViewSource: () => void;
  onLooksGood: () => void;
  looksGoodBusy?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

export default function PlanCandidateCard({
  candidate,
  sourceFileName,
  selectBusy = false,
  onToggleSelected,
  onEdit,
  onViewSource,
  onLooksGood,
  looksGoodBusy = false,
  expanded = false,
  onToggleExpanded,
}: Props) {
  const valueText = formatPlannedValue(candidate.plannedValue, candidate.unit);
  const band = confidenceBand(candidate.confidence);
  const needsAttention = candidateNeedsAttention(candidate);
  const isReviewed = candidate.reviewStatus === "reviewed";
  const edited = candidateHasHumanEdits({
    label: candidate.label,
    type: candidate.type,
    plannedValue: candidate.plannedValue,
    unit: candidate.unit,
    originalLabel: candidate.originalLabel,
    originalType: candidate.originalType,
    originalPlannedValue: candidate.originalPlannedValue,
    originalUnit: candidate.originalUnit,
  });

  const sourceParts: string[] = [];
  if (sourceFileName?.trim()) {
    sourceParts.push(sourceFileName.trim());
  }
  if (candidate.sourceReference?.trim()) {
    sourceParts.push(candidate.sourceReference.trim());
  }
  if (
    candidate.sourcePage != null &&
    Number.isFinite(candidate.sourcePage)
  ) {
    sourceParts.push(`p. ${candidate.sourcePage}`);
  }
  const sourceSummary =
    sourceParts.length > 0 ? sourceParts.join(" · ") : "View source";

  const metaLine = [
    valueText ?? "No quantity",
    formatCandidateType(candidate.type),
  ].join(" · ");

  const selectionScale = useRef(
    new Animated.Value(candidate.selected ? 1.05 : 1),
  ).current;

  useEffect(() => {
    if (candidate.selected) {
      Animated.sequence([
        Animated.timing(selectionScale, {
          toValue: 1.1,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(selectionScale, {
          toValue: 1.05,
          duration: 110,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.timing(selectionScale, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [candidate.selected, selectionScale]);

  return (
    <View
      style={[styles.row, expanded ? styles.rowExpanded : null]}
      accessibilityLabel={`Suggestion ${candidate.label}`}
    >
      <View style={styles.collapsedRow}>
        <Pressable
          style={styles.checkboxHit}
          onPress={onToggleSelected}
          disabled={selectBusy}
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: candidate.selected,
            disabled: selectBusy,
          }}
          accessibilityLabel={
            candidate.selected
              ? `Deselect ${candidate.label}`
              : `Select ${candidate.label}`
          }
          hitSlop={10}
        >
          <Animated.View
            style={[
              styles.checkbox,
              { transform: [{ scale: selectionScale }] },
            ]}
          >
            {candidate.selected ? (
              <Ionicons
                name="checkmark"
                size={18}
                color={KEPLER_NAVY}
              />
            ) : (
              <Ionicons
                name="ellipse-outline"
                size={20}
                color={KEPLER_NAVY}
              />
            )}
          </Animated.View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.candidateMain,
            pressed ? styles.candidateMainPressed : null,
          ]}
          onPress={onToggleExpanded}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? `Collapse ${candidate.label}`
              : `Expand ${candidate.label}`
          }
        >
          <View style={styles.titleRow}>
            <Text style={styles.label} numberOfLines={2}>
              {candidate.label}
            </Text>

            {isReviewed ? (
              <Ionicons
                name="checkmark"
                size={14}
                color={TEXT_MUTED}
                accessibilityLabel="Reviewed"
              />
            ) : needsAttention ? (
              <Ionicons
                name="alert-circle-outline"
                size={15}
                color={KEPLER_RED}
                accessibilityLabel="Needs attention"
              />
            ) : null}
          </View>

          <Text style={styles.metaLine} numberOfLines={1}>
            {metaLine}
          </Text>

          <Text
            style={[
              styles.stateLine,
              needsAttention ? styles.stateLineAttention : null,
            ]}
            numberOfLines={1}
          >
            {needsAttention ? "Needs attention" : `${band} confidence`}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.sourceRow,
          pressed ? styles.sourceRowPressed : null,
        ]}
        onPress={onViewSource}
        accessibilityRole="button"
        accessibilityLabel={`View source for ${candidate.label}`}
        hitSlop={4}
      >
        <Text
          style={styles.sourceText}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {sourceSummary}
        </Text>
        <Ionicons name="open-outline" size={15} color={KEPLER_NAVY} />
      </Pressable>

      {expanded ? (
        <View style={styles.expandedBlock}>
          {edited ? (
            <Text style={styles.editedHint}>Edited</Text>
          ) : null}

          <View style={styles.expandedActions}>
            <Pressable
              style={({ pressed }) => [
                styles.looksGoodButton,
                (looksGoodBusy || isReviewed) &&
                  styles.looksGoodButtonDisabled,
                pressed &&
                  !(looksGoodBusy || isReviewed) &&
                  styles.looksGoodButtonPressed,
              ]}
              onPress={onLooksGood}
              disabled={looksGoodBusy || isReviewed}
              accessibilityRole="button"
              accessibilityLabel="Looks good"
              accessibilityState={{
                disabled: looksGoodBusy || isReviewed,
              }}
            >
              <Ionicons
                name="checkmark"
                size={14}
                color={
                  looksGoodBusy || isReviewed ? TEXT_MUTED : KEPLER_NAVY
                }
              />
              <Text
                style={[
                  styles.looksGoodText,
                  (looksGoodBusy || isReviewed) &&
                    styles.looksGoodTextDisabled,
                ]}
              >
                {looksGoodBusy ? "…" : "Looks good"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.secondaryActionPressed,
              ]}
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit"
            >
              <Text style={styles.secondaryActionText}>Edit</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  rowExpanded: {
    backgroundColor: "rgba(255,255,255,0.38)",
    borderRadius: 10,
    marginHorizontal: -2,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkboxHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
    marginTop: -6,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  candidateMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: 0,
  },
  candidateMainPressed: {
    backgroundColor: "rgba(15,23,42,0.04)",
    borderRadius: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  label: {
    ...typography.bodyMedium,
    color: TEXT_PRIMARY,
    flex: 1,
    minWidth: 0,
    fontWeight: "600",
  },
  metaLine: {
    ...typography.caption,
    color: TEXT_SECONDARY,
  },
  stateLine: {
    ...typography.caption,
    color: TEXT_MUTED,
  },
  stateLineAttention: {
    color: KEPLER_RED,
    fontWeight: "600",
  },
  sourceRow: {
    marginTop: 5,
    marginLeft: CANDIDATE_TEXT_INDENT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  sourceRowPressed: {
    opacity: 0.72,
  },
  sourceText: {
    ...typography.caption,
    color: TEXT_MUTED,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  expandedBlock: {
    marginTop: 8,
    marginLeft: CANDIDATE_TEXT_INDENT,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(1,33,105,0.10)",
    paddingTop: 8,
  },
  editedHint: {
    ...typography.metadata,
    color: colors.brand.blue,
    fontWeight: "700",
  },
  expandedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  looksGoodButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "rgba(1,33,105,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.12)",
  },
  looksGoodButtonPressed: {
    opacity: 0.85,
  },
  looksGoodButtonDisabled: {
    opacity: 0.45,
  },
  looksGoodText: {
    ...typography.button,
    color: KEPLER_NAVY,
    fontWeight: "700",
  },
  looksGoodTextDisabled: {
    color: TEXT_MUTED,
  },
  secondaryAction: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  secondaryActionPressed: {
    opacity: 0.7,
  },
  secondaryActionText: {
    ...typography.button,
    color: KEPLER_NAVY,
    fontWeight: "700",
  },
});
