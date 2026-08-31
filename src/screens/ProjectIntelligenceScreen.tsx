import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getDeltasForProject } from "../store/deltas";
import { getEvidenceForProject } from "../store/evidence";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemsForProject } from "../store/planItems";
import { getProjectById } from "../store/projects";
import type { DeltaStatus } from "../types/delta";
import type { Project } from "../types/project";
import {
  buildProjectIntelligence,
  type ProjectIntelligenceSummary,
} from "../utils/domain/projectIntelligence";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<
  RootStackParamList,
  "ProjectIntelligence"
>;

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return "$0.00";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedHours(value: number): string {
  if (value === 0) {
    return "0.00 hr";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} hr`;
}

function formatSignedDays(value: number): string {
  const absolute = Math.abs(value).toFixed(2);
  const unitLabel = Math.abs(value) === 1 ? "day" : "days";

  if (value === 0) {
    return `0.00 ${unitLabel}`;
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${absolute} ${unitLabel}`;
}

function formatSignedValue(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function formatActivityTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MetricCell({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function ProjectIntelligenceScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const projectId = route.params.projectId;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [summary, setSummary] = useState<ProjectIntelligenceSummary | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setSummary(null);
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        const [found, planItems, measurements, deltas, evidence] =
          await Promise.all([
            getProjectById(ownerUid, projectId),
            getPlanItemsForProject(ownerUid, projectId),
            getMeasurementsForProject(ownerUid, projectId),
            getDeltasForProject(ownerUid, projectId),
            getEvidenceForProject(ownerUid, projectId),
          ]);

        if (!active) {
          return;
        }

        if (!found) {
          setProject(null);
          setSummary(null);
          return;
        }

        setProject(found);
        setSummary(
          buildProjectIntelligence({
            measurements,
            deltas,
            evidence,
            planItems,
          }),
        );
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid]),
  );

  const emptyProject = useMemo(
    () =>
      !!summary &&
      summary.measurements === 0 &&
      summary.deltas === 0 &&
      summary.evidence === 0,
    [summary],
  );

  const openProjectDeltas = (initialStatus?: DeltaStatus) => {
    navigation.navigate("ProjectDeltas", {
      projectId,
      initialStatus,
    });
  };

  if (project === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project || !summary) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.title}>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>Field Intelligence</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <Text style={styles.eyebrow}>FIELD INTELLIGENCE</Text>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.subtitle}>
          Current field activity, documented differences, and evidence.
        </Text>

        {emptyProject ? (
          <Text style={styles.emptyText}>
            No field activity recorded yet.
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>PROJECT PULSE</Text>
        <View style={styles.card}>
          <View style={styles.metricRow}>
            <MetricCell label="MEASUREMENTS" value={summary.measurements} />
            <MetricCell label="DELTAS" value={summary.deltas} />
          </View>
          <View style={styles.metricRow}>
            <MetricCell label="EVIDENCE" value={summary.evidence} />
            <MetricCell label="OPEN" value={summary.disposition.open} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>DELTA DISPOSITION</Text>
        <View style={styles.card}>
          {(
            [
              ["open", "OPEN", summary.disposition.open],
              ["accepted", "ACCEPTED", summary.disposition.accepted],
              ["rejected", "REJECTED", summary.disposition.rejected],
              ["resolved", "RESOLVED", summary.disposition.resolved],
            ] as const
          ).map(([status, label, count], index, rows) => (
            <Pressable
              key={status}
              style={[
                styles.dispositionRow,
                index === rows.length - 1 && styles.rowLast,
              ]}
              onPress={() => openProjectDeltas(status)}
              accessibilityRole="button"
              accessibilityLabel={`${label} deltas, ${count}`}
            >
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{count}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>OPEN DELTA IMPACT</Text>
        <Text style={styles.sectionHint}>
          Documented snapshot impacts for open discrepancies only.
        </Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Recorded cost impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedCurrency(summary.openImpact.costImpact)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Recorded labor impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedHours(summary.openImpact.laborImpactHours)}
            </Text>
          </View>
          <View style={[styles.detailRow, styles.rowLast]}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>
                Largest recorded schedule variance
              </Text>
              <Text style={styles.rowSecondary}>
                {summary.openSchedule.deltasWithScheduleImpact} open delta
                {summary.openSchedule.deltasWithScheduleImpact === 1
                  ? ""
                  : "s"}{" "}
                with schedule impact
              </Text>
            </View>
            <Text style={styles.rowValue}>
              {formatSignedDays(
                summary.openSchedule.largestRecordedVarianceDays,
              )}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ALL DOCUMENTED DELTAS</Text>
        <Text style={styles.sectionHint}>
          Historical recorded impacts across every disposition. Not contractual
          exposure.
        </Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Recorded cost impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedCurrency(summary.documentedImpact.costImpact)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Recorded labor impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedHours(summary.documentedImpact.laborImpactHours)}
            </Text>
          </View>
          <View style={[styles.detailRow, styles.rowLast]}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>
                Largest recorded schedule variance
              </Text>
              <Text style={styles.rowSecondary}>
                {summary.documentedSchedule.deltasWithScheduleImpact} delta
                {summary.documentedSchedule.deltasWithScheduleImpact === 1
                  ? ""
                  : "s"}{" "}
                with schedule impact
              </Text>
            </View>
            <Text style={styles.rowValue}>
              {formatSignedDays(
                summary.documentedSchedule.largestRecordedVarianceDays,
              )}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>EVIDENCE COVERAGE</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Total evidence</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.total}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Project</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.project}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Measurement</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.measurement}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Delta</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.delta}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.rowLabel}>Deltas with evidence</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.deltasWithEvidence}/
              {summary.evidenceCoverage.totalDeltas}
            </Text>
          </View>
          <View style={[styles.detailRow, styles.rowLast]}>
            <Text style={styles.rowLabel}>Open deltas with evidence</Text>
            <Text style={styles.rowValue}>
              {summary.evidenceCoverage.openDeltasWithEvidence}/
              {summary.evidenceCoverage.openDeltas}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>NEEDS ATTENTION</Text>
        <Text style={styles.sectionHint}>Open deltas, newest first.</Text>
        {summary.needsAttention.length === 0 ? (
          <Text style={styles.emptyText}>No open field discrepancies.</Text>
        ) : (
          summary.needsAttention.map((item) => (
            <Pressable
              key={item.id}
              style={styles.attentionCard}
              onPress={() =>
                navigation.navigate("DeltaDetail", { deltaId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open delta ${item.label}`}
            >
              <Text style={styles.attentionTitle}>{item.label}</Text>
              <Text style={styles.attentionLine}>
                {formatSignedValue(item.difference, item.unit)}
              </Text>
              <Text style={styles.attentionLine}>
                {formatSignedCurrency(item.costImpact)} recorded cost impact
              </Text>
              <Text style={styles.attentionMeta}>
                Evidence: {item.evidenceCount}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>RECENT VARIANCES</Text>
        <Text style={styles.sectionHint}>
          Newest field variances across every disposition. Recorded quantities
          and impacts come from stored Measurement and Delta records.
        </Text>
        {summary.recentVariances.length === 0 ? (
          <Text style={styles.emptyText}>No field variances recorded yet.</Text>
        ) : (
          summary.recentVariances.map((item) => (
            <Pressable
              key={item.id}
              style={styles.attentionCard}
              onPress={() =>
                navigation.navigate("DeltaDetail", { deltaId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={`Variance ${item.label}`}
            >
              <Text style={styles.attentionTitle}>{item.label}</Text>
              <Text style={styles.attentionLine}>
                Recorded field quantity{" "}
                {item.recordedFieldQuantity.toFixed(2)} {item.unit}
              </Text>
              <Text style={styles.attentionLine}>
                {formatSignedValue(item.difference, item.unit)}
              </Text>
              <Text style={styles.attentionMeta}>
                {item.status.toUpperCase()}
                {item.dispositionReason.trim().length > 0
                  ? ` · ${item.dispositionReason}`
                  : ""}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>RECENT FIELD ACTIVITY</Text>
        {summary.recentActivity.length === 0 ? (
          <Text style={styles.emptyText}>No recent field activity.</Text>
        ) : (
          <View style={styles.card}>
            {summary.recentActivity.map((item, index) => {
              const isLast = index === summary.recentActivity.length - 1;
              const onPress = () => {
                if (item.deltaId) {
                  navigation.navigate("DeltaDetail", {
                    deltaId: item.deltaId,
                  });
                  return;
                }

                if (item.measurementId) {
                  navigation.navigate("MeasurementDetail", {
                    measurementId: item.measurementId,
                  });
                  return;
                }

                navigation.navigate("ProjectEvidence", { projectId });
              };

              return (
                <Pressable
                  key={item.id}
                  style={[styles.activityRow, isLast && styles.rowLast]}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}: ${item.subtitle}`}
                >
                  <View style={styles.rowTextBlock}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {formatActivityTime(item.at)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B1017",
  },
  container: {
    flex: 1,
    backgroundColor: "#0B1017",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },
  topBarTitle: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
  },
  topBarSpacer: {
    width: 42,
  },
  eyebrow: {
    ...typography.caption,
    color: "#F4A623",
  },
  title: {
    ...typography.display,
    color: "#FFFFFF",
    marginTop: 8,
  },
  subtitle: {
    ...typography.body,
    color: "#8F9BA8",
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    ...typography.caption,
    color: "#FFFFFF",
    marginTop: 22,
    marginBottom: 10,
  },
  sectionHint: {
    ...typography.caption,
    color: "#748093",
    marginTop: -4,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricCell: {
    width: "48%",
    paddingVertical: 12,
  },
  metricLabel: {
    ...typography.caption,
    color: "#748093",
  },
  metricValue: {
    ...typography.title,
    color: "#FFFFFF",
    marginTop: 6,
  },
  dispositionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#27313D",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#27313D",
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    ...typography.button,
    color: "#8F9BA8",
    flexShrink: 1,
  },
  rowValue: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },
  rowTextBlock: {
    flex: 1,
    paddingRight: 8,
  },
  rowSecondary: {
    ...typography.button,
    color: "#748093",
    marginTop: 4,
  },
  attentionCard: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 10,
  },
  attentionTitle: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
  },
  attentionLine: {
    ...typography.button,
    color: "#F4A623",
    marginTop: 6,
  },
  attentionMeta: {
    ...typography.caption,
    color: "#8F9BA8",
    marginTop: 6,
  },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#27313D",
    gap: 10,
  },
  activityTitle: {
    ...typography.bodyMedium,
    color: "#F4A623",
  },
  activitySubtitle: {
    ...typography.caption,
    color: "#FFFFFF",
    marginTop: 4,
  },
  activityTime: {
    ...typography.caption,
    color: "#748093",
  },
  emptyText: {
    ...typography.caption,
    color: "#7F8A98",
    marginBottom: 8,
  },
});
