import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../../theme/colors";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

export type PlanReviewSummaryMetrics = {
  total: number;
  selected: number;
  reviewed: number;
  needsAttention: number;
};

type Props = {
  metrics: PlanReviewSummaryMetrics;
};

export default function PlanReviewSummary({ metrics }: Props) {
  const progress =
    metrics.total > 0 ? Math.min(1, metrics.reviewed / metrics.total) : 0;

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`Review progress: ${metrics.reviewed} of ${metrics.total} reviewed. ${metrics.selected} selected. ${metrics.needsAttention} need attention.`}
    >
      <View pointerEvents="none" style={styles.sectionTopAccent}>
        <View style={styles.sectionTopAccentBlue} />
        <View style={styles.sectionTopAccentRed} />
      </View>

      <View style={styles.metricsRow}>
        <MetricCell label="Total" value={String(metrics.total)} />
        <MetricCell label="Selected" value={String(metrics.selected)} />
        <MetricCell label="Reviewed" value={String(metrics.reviewed)} />
        <MetricCell
          label="Attention"
          value={String(metrics.needsAttention)}
          emphasize={metrics.needsAttention > 0}
        />
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Review progress</Text>
          <Text style={styles.progressCount}>
            {metrics.reviewed}/{metrics.total}
          </Text>
        </View>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: metrics.total,
            now: metrics.reviewed,
          }}
        >
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

function MetricCell({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.metricCell}>
      <Text
        style={[styles.metricValue, emphasize ? styles.metricValueEmphasize : null]}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    position: "relative",
    overflow: "hidden",
  },
  sectionTopAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    flexDirection: "row",
    zIndex: 2,
  },
  sectionTopAccentBlue: {
    flex: 1,
    backgroundColor: KEPLER_NAVY,
  },
  sectionTopAccentRed: {
    width: 34,
    backgroundColor: KEPLER_RED,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  metricValueEmphasize: {
    color: colors.danger,
  },
  metricLabel: {
    ...typography.metadata,
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  progressBlock: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  progressCount: {
    ...typography.caption,
    color: colors.text.primary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.shadow.medium,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.brand.navy,
  },
});
