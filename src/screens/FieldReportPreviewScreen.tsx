import React, { useCallback, useState } from "react";
import {
  Alert,
  Image,
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
import { exportAndShareFieldReportPdf } from "../services/reports/fieldReportPdf";
import {
  addSavedFieldReport,
  deleteSavedFieldReport,
  getSavedFieldReportById,
} from "../store/savedFieldReports";
import {
  buildFieldReport,
  type FieldReport,
} from "../utils/domain/fieldReport";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<
  RootStackParamList,
  "FieldReportPreview"
>;

function isSavedPreviewRoute(
  params: RootStackParamList["FieldReportPreview"],
): params is { projectId: string; savedReportId: string } {
  return "savedReportId" in params;
}

function getLivePreviewParams(
  params: RootStackParamList["FieldReportPreview"],
):
  | { startAt: string; endAt: string; periodLabel: string }
  | null {
  if (isSavedPreviewRoute(params)) {
    return null;
  }

  return {
    startAt: params.startAt,
    endAt: params.endAt,
    periodLabel: params.periodLabel,
  };
}

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

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function evidenceContextLabel(
  context: "project" | "measurement" | "delta",
): string {
  switch (context) {
    case "measurement":
      return "Measurement evidence";
    case "delta":
      return "Delta evidence";
    default:
      return "Project evidence";
  }
}

export default function FieldReportPreviewScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId } = route.params;
  const isSavedMode = isSavedPreviewRoute(route.params);
  const savedReportId = isSavedMode ? route.params.savedReportId : null;
  const livePreview = getLivePreviewParams(route.params);
  const liveStartAt = livePreview?.startAt;
  const liveEndAt = livePreview?.endAt;
  const livePeriodLabel = livePreview?.periodLabel;

  const [report, setReport] = useState<FieldReport | null | undefined>(
    undefined,
  );
  const [exportingPdf, setExportingPdf] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savedInSession, setSavedInSession] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setReport(null);
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function loadSaved() {
        if (!savedReportId) {
          return;
        }

        const saved = await getSavedFieldReportById(
          ownerUid,
          projectId,
          savedReportId,
        );

        if (!active) {
          return;
        }

        setReport(saved?.snapshot ?? null);
      }

      async function loadLive() {
        if (!liveStartAt || !liveEndAt || !livePeriodLabel) {
          return;
        }

        const [project, planItems, measurements, deltas, evidence] =
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

        if (!project) {
          setReport(null);
          return;
        }

        setReport(
          buildFieldReport({
            project,
            planItems,
            measurements,
            deltas,
            evidence,
            startAt: liveStartAt,
            endAt: liveEndAt,
            periodLabel: livePeriodLabel,
            generatedAt: new Date().toISOString(),
          }),
        );
      }

      if (isSavedMode) {
        void loadSaved();
      } else {
        void loadLive();
      }

      return () => {
        active = false;
      };
    }, [
      isSavedMode,
      liveEndAt,
      livePeriodLabel,
      liveStartAt,
      projectId,
      savedReportId,
      user?.uid,
    ]),
  );

  const handleSaveReport = async () => {
    if (!report || savingReport || savedInSession || isSavedMode) {
      return;
    }

    setSavingReport(true);

    try {
      await addSavedFieldReport(user!.uid, report);
      setSavedInSession(true);
    } catch {
      Alert.alert("Unable to save report.");
    } finally {
      setSavingReport(false);
    }
  };

  const handleExportAndSharePdf = async () => {
    if (!report || exportingPdf) {
      return;
    }

    setExportingPdf(true);

    try {
      const result = await exportAndShareFieldReportPdf(report);

      if (!result.ok) {
        Alert.alert("Unable to generate PDF.");
        return;
      }

      if (!result.shared && result.reason === "sharing-unavailable") {
        Alert.alert("Sharing is not available on this device.");
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDeleteSavedReport = () => {
    if (!isSavedMode || !savedReportId || deletingReport || !user?.uid) {
      return;
    }

    Alert.alert(
      "Delete saved report?",
      "This removes the saved report history only. Project records are not changed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingReport(true);

              try {
                const deleted = await deleteSavedFieldReport(
                  user.uid,
                  projectId,
                  savedReportId,
                );

                if (!deleted) {
                  Alert.alert("Unable to delete saved report.");
                  return;
                }

                navigation.navigate("ProjectFieldReports", { projectId });
              } catch {
                Alert.alert("Unable to delete saved report.");
              } finally {
                setDeletingReport(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (report === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!report) {
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
          <Text style={styles.title}>
            {isSavedMode ? "Saved report not found." : "Project not found."}
          </Text>
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
          <Text style={styles.topBarTitle}>Field Report</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <Text style={styles.eyebrow}>FIELD REPORT</Text>
        {isSavedMode ? (
          <Text style={styles.savedBanner}>Saved snapshot</Text>
        ) : null}
        <Text style={styles.title}>{report.projectName}</Text>
        <Text style={styles.metaLine}>Reporting period: {report.periodLabel}</Text>
        <Text style={styles.metaLine}>
          Generated {formatDateTime(report.generatedAt)}
        </Text>

        {!report.hasPeriodActivity ? (
          <Text style={styles.emptyBanner}>
            No documented field activity for this reporting period.
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>PROJECT FIELD INTELLIGENCE</Text>
        <Text style={styles.sectionHint}>
          Read-only aggregation from authoritative Delta records. Quantities and
          impacts come from recorded Measurements and stored Delta calculations.
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total variances</Text>
            <Text style={styles.rowValue}>
              {report.projectIntelligence.totalVariances}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Open</Text>
            <Text style={styles.rowValue}>
              {report.projectIntelligence.disposition.open}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Accepted</Text>
            <Text style={styles.rowValue}>
              {report.projectIntelligence.disposition.accepted}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rejected</Text>
            <Text style={styles.rowValue}>
              {report.projectIntelligence.disposition.rejected}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Resolved</Text>
            <Text style={styles.rowValue}>
              {report.projectIntelligence.disposition.resolved}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Documented cost impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedCurrency(
                report.projectIntelligence.documentedImpact.costImpact,
              )}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Documented labor impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedHours(
                report.projectIntelligence.documentedImpact.laborImpactHours,
              )}
            </Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>
                Largest recorded schedule variance
              </Text>
              <Text style={styles.rowSecondary}>
                {report.projectIntelligence.documentedImpact.deltasWithScheduleImpact}{" "}
                delta
                {report.projectIntelligence.documentedImpact
                  .deltasWithScheduleImpact === 1
                  ? ""
                  : "s"}{" "}
                with schedule impact
              </Text>
            </View>
            <Text style={styles.rowValue}>
              {formatSignedDays(
                report.projectIntelligence.documentedImpact
                  .largestRecordedVarianceDays,
              )}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>RECENT VARIANCES</Text>
        <Text style={styles.sectionHint}>
          Newest field variances across every disposition.
        </Text>
        {report.projectIntelligence.recentVariances.length === 0 ? (
          <Text style={styles.emptyText}>No field variances recorded yet.</Text>
        ) : (
          report.projectIntelligence.recentVariances.map((item) => (
            <Pressable
              key={item.id}
              style={styles.itemCard}
              onPress={() =>
                navigation.navigate("DeltaDetail", { deltaId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={`Variance ${item.label}`}
            >
              <Text style={styles.itemTitle}>{item.label}</Text>
              <Text style={styles.itemLine}>
                Recorded field quantity {item.recordedFieldQuantity.toFixed(2)}{" "}
                {item.unit}
              </Text>
              <Text style={styles.itemLine}>
                Difference {formatSignedValue(item.difference, item.unit)}
              </Text>
              <Text style={styles.itemMeta}>
                Status: {item.status.toUpperCase()}
                {item.dispositionReason.trim().length > 0
                  ? ` · ${item.dispositionReason}`
                  : ""}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>ACTIVITY SUMMARY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Measurements recorded</Text>
            <Text style={styles.rowValue}>{report.activity.measurements}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Deltas documented</Text>
            <Text style={styles.rowValue}>{report.activity.deltas}</Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Evidence added</Text>
            <Text style={styles.rowValue}>{report.activity.evidence}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>MEASUREMENTS RECORDED</Text>
        {report.measurements.length === 0 ? (
          <Text style={styles.emptyText}>
            No measurements recorded during this period.
          </Text>
        ) : (
          report.measurements.map((item) => (
            <Pressable
              key={item.id}
              style={styles.itemCard}
              onPress={() =>
                navigation.navigate("MeasurementDetail", {
                  measurementId: item.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Measurement ${item.label}`}
            >
              <Text style={styles.itemTitle}>{item.label}</Text>
              <Text style={styles.itemLine}>
                {item.value.toFixed(2)} {item.unit}
              </Text>
              <Text style={styles.itemMeta}>{formatDateTime(item.createdAt)}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>DELTAS DOCUMENTED</Text>
        <Text style={styles.sectionHint}>
          Documented during this reporting period. Disposition shown is current.
        </Text>
        {report.deltasDocumented.length === 0 ? (
          <Text style={styles.emptyText}>
            No deltas documented during this period.
          </Text>
        ) : (
          report.deltasDocumented.map((item) => (
            <Pressable
              key={item.id}
              style={styles.itemCard}
              onPress={() =>
                navigation.navigate("DeltaDetail", { deltaId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={`Delta ${item.label}`}
            >
              <Text style={styles.itemTitle}>{item.label}</Text>
              <Text style={styles.itemLine}>
                Planned {item.plannedValue.toFixed(2)} {item.unit} · Field{" "}
                {item.actualValue.toFixed(2)} {item.unit}
              </Text>
              <Text style={styles.itemLine}>
                Difference {formatSignedValue(item.difference, item.unit)} (
                {formatSignedPercent(item.percentDifference)})
              </Text>
              <Text style={styles.itemLine}>
                Recorded cost impact {formatSignedCurrency(item.costImpact)}
              </Text>
              <Text style={styles.itemLine}>
                Recorded labor impact{" "}
                {formatSignedHours(item.laborImpactHours)}
              </Text>
              <Text style={styles.itemLine}>
                Recorded schedule variance{" "}
                {formatSignedDays(item.scheduleImpactDays)}
              </Text>
              <Text style={styles.itemMeta}>
                Current disposition: {item.status.toUpperCase()}
                {item.dispositionOccurredInPeriod
                  ? " · updated in this period"
                  : ""}
              </Text>
              <Text style={styles.itemMeta}>
                Documented {formatDateTime(item.createdAt)}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>OPEN FIELD DIFFERENCES</Text>
        <Text style={styles.sectionHint}>
          Deltas documented in this period that are currently open.
        </Text>
        {report.openFieldDifferences.length === 0 ? (
          <Text style={styles.emptyText}>
            No open field differences from this period.
          </Text>
        ) : (
          report.openFieldDifferences.map((item) => (
            <Pressable
              key={item.id}
              style={styles.itemCard}
              onPress={() =>
                navigation.navigate("DeltaDetail", { deltaId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open delta ${item.label}`}
            >
              <Text style={styles.itemTitle}>{item.label}</Text>
              <Text style={styles.itemLine}>
                {formatSignedValue(item.difference, item.unit)}
              </Text>
              <Text style={styles.itemLine}>
                Recorded cost impact {formatSignedCurrency(item.costImpact)}
              </Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>DOCUMENTED IMPACT</Text>
        <Text style={styles.sectionHint}>
          Recorded snapshot impacts for deltas documented in this period.
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Recorded cost impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedCurrency(report.documentedImpact.costImpact)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Recorded labor impact</Text>
            <Text style={styles.rowValue}>
              {formatSignedHours(report.documentedImpact.laborImpactHours)}
            </Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>
                Largest recorded schedule variance
              </Text>
              <Text style={styles.rowSecondary}>
                {report.documentedImpact.deltasWithScheduleImpact} delta
                {report.documentedImpact.deltasWithScheduleImpact === 1
                  ? ""
                  : "s"}{" "}
                with schedule impact
              </Text>
            </View>
            <Text style={styles.rowValue}>
              {formatSignedDays(
                report.documentedImpact.largestRecordedVarianceDays,
              )}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>FIELD EVIDENCE</Text>
        {report.evidence.length === 0 ? (
          <Text style={styles.emptyText}>
            No evidence added during this period.
          </Text>
        ) : (
          report.evidence.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <Text style={styles.itemEyebrow}>
                {item.type === "photo" ? "PHOTO" : "NOTE"} ·{" "}
                {evidenceContextLabel(item.context)}
              </Text>
              <Text style={styles.itemTitle}>{item.relatedLabel}</Text>
              {item.note.trim().length > 0 ? (
                <Text style={styles.itemLine}>{item.note}</Text>
              ) : null}
              {item.type === "photo" && item.photoUri ? (
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.itemMeta}>
                {formatDateTime(item.createdAt)}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>CURRENT DELTA STATUS</Text>
        <Text style={styles.sectionHint}>
          Current project disposition counts (not limited to this period).
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Open</Text>
            <Text style={styles.rowValue}>
              {report.currentDisposition.open}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Accepted</Text>
            <Text style={styles.rowValue}>
              {report.currentDisposition.accepted}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rejected</Text>
            <Text style={styles.rowValue}>
              {report.currentDisposition.rejected}
            </Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Resolved</Text>
            <Text style={styles.rowValue}>
              {report.currentDisposition.resolved}
            </Text>
          </View>
        </View>

        {!isSavedMode ? (
          <Pressable
            style={[
              styles.saveButton,
              (savingReport || savedInSession) && styles.saveButtonDisabled,
            ]}
            onPress={() => {
              void handleSaveReport();
            }}
            disabled={savingReport || savedInSession}
            accessibilityRole="button"
            accessibilityLabel={
              savedInSession ? "Report saved" : "Save field report"
            }
            accessibilityState={{
              disabled: savingReport || savedInSession,
              busy: savingReport,
            }}
          >
            <Text style={styles.saveButtonText}>
              {savingReport
                ? "Saving..."
                : savedInSession
                  ? "Saved"
                  : "Save Report"}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.exportButton,
            exportingPdf && styles.exportButtonDisabled,
            !isSavedMode && styles.exportButtonWithSave,
          ]}
          onPress={() => {
            void handleExportAndSharePdf();
          }}
          disabled={exportingPdf}
          accessibilityRole="button"
          accessibilityLabel="Export and share field report PDF"
          accessibilityState={{ disabled: exportingPdf, busy: exportingPdf }}
        >
          <Text style={styles.exportButtonText}>
            {exportingPdf ? "Generating PDF..." : "Export & Share PDF"}
          </Text>
        </Pressable>

        {isSavedMode ? (
          <Pressable
            style={[
              styles.deleteButton,
              deletingReport && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteSavedReport}
            disabled={deletingReport}
            accessibilityRole="button"
            accessibilityLabel="Delete saved report"
            accessibilityState={{ disabled: deletingReport, busy: deletingReport }}
          >
            <Text style={styles.deleteButtonText}>
              {deletingReport ? "Deleting..." : "Delete Saved Report"}
            </Text>
          </Pressable>
        ) : null}
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
  metaLine: {
    ...typography.button,
    color: "#8F9BA8",
    marginTop: 6,
  },
  emptyBanner: {
    ...typography.body,
    marginTop: 16,
    color: "#8F9BA8",
  },
  sectionTitle: {
    ...typography.caption,
    color: "#FFFFFF",
    marginTop: 24,
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
    paddingVertical: 4,
  },
  row: {
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
  itemCard: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 10,
  },
  itemEyebrow: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 6,
  },
  itemTitle: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
  },
  itemLine: {
    ...typography.button,
    color: "#D0D7E0",
    marginTop: 6,
  },
  itemMeta: {
    ...typography.caption,
    color: "#748093",
    marginTop: 6,
  },
  emptyText: {
    ...typography.caption,
    color: "#7F8A98",
    marginBottom: 8,
  },
  photo: {
    marginTop: 10,
    width: "100%",
    height: 160,
    borderRadius: 12,
    backgroundColor: "#0B1017",
  },
  savedBanner: {
    ...typography.button,
    marginTop: 10,
    color: "#8F9BA8",
  },
  saveButton: {
    marginTop: 28,
    backgroundColor: "#151C25",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F4A623",
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    ...typography.bodyMedium,
    color: "#F4A623",
  },
  exportButton: {
    marginTop: 28,
    backgroundColor: "#F4A623",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  exportButtonWithSave: {
    marginTop: 12,
  },
  exportButtonDisabled: {
    opacity: 0.65,
  },
  exportButtonText: {
    ...typography.bodyMedium,
    color: "#111111",
  },
  deleteButton: {
    marginTop: 12,
    backgroundColor: "#151C25",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#5C3A3A",
    paddingVertical: 16,
    alignItems: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.65,
  },
  deleteButtonText: {
    ...typography.bodyMedium,
    color: "#F07167",
  },
});
