import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, typography } from "../../theme/colors";
import type { RemotePlanImportCandidate } from "../../services/api/planImports";
import {
  confidenceBand,
  formatCandidateType,
  formatPlannedValue,
} from "../../utils/planImportReview";

type Props = {
  visible: boolean;
  candidate: RemotePlanImportCandidate | null;
  sourceFileName?: string;
  onClose: () => void;
};

export default function PlanCandidateSource({
  visible,
  candidate,
  sourceFileName,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

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
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.topSpacer} />
          <Text style={styles.topTitle}>Source details</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close source details"
            hitSlop={8}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {!candidate ? (
            <Text style={styles.body}>No suggestion selected.</Text>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{candidate.label}</Text>
              <DetailRow
                label="Quantity"
                value={
                  formatPlannedValue(candidate.plannedValue, candidate.unit) ??
                  "—"
                }
              />
              <DetailRow
                label="Type"
                value={formatCandidateType(candidate.type)}
              />
              <DetailRow
                label="Confidence"
                value={`${confidenceBand(candidate.confidence)} (${Math.round(candidate.confidence * 100)}%)`}
              />
              <DetailRow
                label="Review status"
                value={formatReviewStatus(candidate.reviewStatus)}
              />

              <Text style={styles.sectionHeading}>Provenance</Text>
              <DetailRow
                label="Source file"
                value={sourceFileName?.trim() || "Unknown file"}
              />
              <DetailRow
                label="Page"
                value={
                  candidate.sourcePage != null
                    ? String(candidate.sourcePage)
                    : "—"
                }
              />
              <DetailRow
                label="Reference"
                value={candidate.sourceReference?.trim() || "—"}
              />
              <DetailRow
                label="Excerpt"
                value={candidate.sourceExcerpt?.trim() || "—"}
                multiline
              />

              <Text style={styles.sectionHeading}>Original extraction</Text>
              <DetailRow label="Original label" value={candidate.originalLabel} />
              <DetailRow
                label="Original type"
                value={formatCandidateType(candidate.originalType)}
              />
              <DetailRow
                label="Original quantity"
                value={
                  formatPlannedValue(
                    candidate.originalPlannedValue,
                    candidate.originalUnit,
                  ) ?? "—"
                }
              />

              {candidate.description?.trim() ? (
                <>
                  <Text style={styles.sectionHeading}>Description</Text>
                  <Text style={styles.body}>{candidate.description.trim()}</Text>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function formatReviewStatus(
  status: RemotePlanImportCandidate["reviewStatus"],
): string {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "needs_attention":
      return "Needs attention";
    case "unreviewed":
    default:
      return "Unreviewed";
  }
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, multiline ? styles.detailValueMulti : null]}
      >
        {value}
      </Text>
    </View>
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
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topSpacer: {
    minWidth: 56,
  },
  topTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  doneText: {
    ...typography.button,
    color: colors.brand.navy,
    minWidth: 56,
    textAlign: "right",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 10,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    marginBottom: 4,
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.text.muted,
  },
  detailValue: {
    ...typography.body,
    color: colors.text.primary,
  },
  detailValueMulti: {
    lineHeight: 22,
  },
  body: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
