import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlanItemProvenance } from "../../services/api/planItems";
import { colors, typography } from "../../theme/colors";
import { formatPlannedValue } from "../../utils/planImportReview";
import {
  formatProvenanceConfidence,
  formatProvenanceDate,
  formatProvenanceQuantity,
  formatProvenanceSourceLine,
  formatReviewAdjustment,
  formatReviewerLabel,
  provenanceValuesDiffer,
} from "../../utils/planItemProvenance";

type Props = {
  visible: boolean;
  loading: boolean;
  errorMessage: string | null;
  provenance: PlanItemProvenance | null;
  planItemLabel: string;
  onClose: () => void;
  onRetry?: () => void;
  onViewReviewedImport?: () => void;
};

export default function PlanItemProvenanceSheet({
  visible,
  loading,
  errorMessage,
  provenance,
  planItemLabel,
  onClose,
  onRetry,
  onViewReviewedImport,
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
          <Text style={styles.topTitle}>Plan source</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={`Close provenance for ${planItemLabel}`}
            hitSlop={8}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.darkSurface} />
              <Text style={styles.muted}>Loading source details…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centered}>
              <Text style={styles.body}>Source details unavailable</Text>
              <Text style={styles.muted}>{errorMessage}</Text>
              {onRetry ? (
                <Pressable
                  style={styles.retryButton}
                  onPress={onRetry}
                  accessibilityRole="button"
                  accessibilityLabel={`Retry loading provenance for ${planItemLabel}`}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : provenance?.origin === "manual" ? (
            <>
              <Text style={styles.hero}>Created manually</Text>
              <Text style={styles.body}>
                This plan item was entered directly and is not linked to an
                imported document.
              </Text>
            </>
          ) : provenance?.candidate && provenance.import ? (
            <ImportedProvenanceBody
              provenance={provenance}
              onViewReviewedImport={onViewReviewedImport}
            />
          ) : (
            <Text style={styles.body}>Source details unavailable</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ImportedProvenanceBody({
  provenance,
  onViewReviewedImport,
}: {
  provenance: PlanItemProvenance;
  onViewReviewedImport?: () => void;
}) {
  const candidate = provenance.candidate!;
  const planImport = provenance.import!;
  const changed = provenanceValuesDiffer(
    candidate.original,
    candidate.reviewed,
  );
  const adjustment = formatReviewAdjustment(
    candidate.original,
    candidate.reviewed,
  );
  const reviewedDate = formatProvenanceDate(candidate.reviewedAt);
  const approvedDate = formatProvenanceDate(planImport.approvedAt);
  const originalValue = formatPlannedValue(
    candidate.original.plannedValue,
    candidate.original.unit,
  );
  const reviewedValue = formatPlannedValue(
    candidate.reviewed.plannedValue,
    candidate.reviewed.unit,
  );

  return (
    <>
      <Text style={styles.hero}>Imported from documents</Text>
      <Text style={styles.body}>
        This plan item was created from a reviewed document suggestion.
      </Text>

      <Text style={styles.sectionHeading}>Source document</Text>
      <DetailRow
        label="File"
        value={formatProvenanceSourceLine({
          fileName: candidate.source.fileName,
          page: candidate.source.page,
          reference: candidate.source.reference,
        })}
      />
      {candidate.source.excerpt ? (
        <DetailRow
          label="Extracted source"
          value={`“${candidate.source.excerpt}”`}
          multiline
        />
      ) : null}

      <Text style={styles.sectionHeading}>Original extraction</Text>
      <DetailRow
        label="AI extracted"
        value={
          originalValue
            ? `${candidate.original.label} · ${originalValue}`
            : formatProvenanceQuantity(candidate.original)
        }
      />
      <DetailRow
        label="Confidence"
        value={formatProvenanceConfidence(candidate.confidence)}
      />

      <Text style={styles.sectionHeading}>Human review</Text>
      {changed ? (
        <>
          <DetailRow
            label="Reviewed value"
            value={
              reviewedValue
                ? `${candidate.reviewed.label} · ${reviewedValue}`
                : formatProvenanceQuantity(candidate.reviewed)
            }
          />
          {adjustment ? (
            <DetailRow label="Review adjustment" value={adjustment} />
          ) : null}
        </>
      ) : (
        <DetailRow label="Reviewed" value="Reviewed as extracted" />
      )}
      <DetailRow
        label="Reviewed by"
        value={formatReviewerLabel(candidate.reviewedByUid)}
      />
      {reviewedDate ? (
        <DetailRow label="Reviewed on" value={reviewedDate} />
      ) : null}

      <Text style={styles.sectionHeading}>Plan approval</Text>
      <DetailRow label="Added to Plan" value={approvedDate ?? "Approved"} />

      {onViewReviewedImport ? (
        <Pressable
          style={styles.linkButton}
          onPress={onViewReviewedImport}
          accessibilityRole="button"
          accessibilityLabel="View reviewed import suggestions"
        >
          <Text style={styles.linkText}>View reviewed import</Text>
        </Pressable>
      ) : null}
    </>
  );
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
    color: colors.text.secondary,
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
  centered: {
    paddingTop: 40,
    alignItems: "center",
    gap: 10,
  },
  hero: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  body: {
    ...typography.body,
    color: colors.text.secondary,
  },
  muted: {
    ...typography.caption,
    color: colors.text.muted,
    textAlign: "center",
  },
  sectionHeading: {
    ...typography.caption,
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
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
  retryButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.darkSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  linkButton: {
    marginTop: 16,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    ...typography.button,
    color: colors.text.secondary,
  },
});
