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
import { updateDeltaDispositionWithCloudSync } from "../services/sync/deltaReview";
import { getDeltaById } from "../store/deltas";
import { isDeltaReviewPending } from "../store/deltaReviewSyncState";
import { getEvidenceForDelta } from "../store/evidence";
import { getMeasurementById } from "../store/measurements";
import { getPlanItemById } from "../store/planItems";
import { getProjectById } from "../store/projects";
import type { Delta, DeltaStatus } from "../types/delta";
import type { Evidence } from "../types/evidence";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "DeltaDetail">;

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

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return "$0.00";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
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

function formatSignedHours(value: number): string {
  if (value === 0) {
    return "0.00 hr";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} hr`;
}

function MetricRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={highlight ? styles.metricHighlight : styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

export default function DeltaDetailScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { deltaId } = route.params;

  const [delta, setDelta] = useState<Delta | null | undefined>(undefined);
  const [measurement, setMeasurement] = useState<Measurement | undefined>(
    undefined,
  );
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [planItem, setPlanItem] = useState<PlanItem | undefined>(undefined);
  const [cloudSyncPending, setCloudSyncPending] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setDelta(null);
        setMeasurement(undefined);
        setProject(undefined);
        setPlanItem(undefined);
        setCloudSyncPending(false);
        setEvidenceItems([]);
        return;
      }

      const ownerUid = user.uid;

      let active = true;

      async function load() {
        const found = await getDeltaById(ownerUid, deltaId);

        if (!active) {
          return;
        }

        if (!found) {
          setDelta(null);
          setMeasurement(undefined);
          setProject(undefined);
          setPlanItem(undefined);
          setCloudSyncPending(false);
          setEvidenceItems([]);
          return;
        }

        setDelta(found);

        const [
          relatedMeasurement,
          relatedProject,
          relatedPlanItem,
          pending,
          linkedEvidence,
        ] = await Promise.all([
          getMeasurementById(ownerUid, found.measurementId),
          getProjectById(ownerUid, found.projectId),
          getPlanItemById(ownerUid, found.planItemId),
          found.status !== "open"
            ? isDeltaReviewPending(ownerUid, found.projectId, found.id)
            : Promise.resolve(false),
          getEvidenceForDelta(ownerUid, found.projectId, found.id),
        ]);

        if (active) {
          setMeasurement(relatedMeasurement);
          setProject(relatedProject);
          setPlanItem(relatedPlanItem);
          setCloudSyncPending(pending);
          const sorted = [...linkedEvidence].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
          setEvidenceItems(sorted);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [deltaId, user?.uid]),
  );

  const promptDisposition = (
    nextStatus: Exclude<DeltaStatus, "open">,
  ) => {
    if (!delta || !user?.uid) {
      return;
    }

    const title =
      nextStatus === "accepted"
        ? "Accept Delta"
        : nextStatus === "rejected"
          ? "Reject Delta"
          : "Resolve Delta";
    const message =
      nextStatus === "accepted"
        ? "Optional reason for accepting this field difference."
        : nextStatus === "rejected"
          ? "Optional reason for rejecting this discrepancy."
          : "Optional note describing how this was resolved.";
    const confirmLabel =
      nextStatus === "accepted"
        ? "Accept"
        : nextStatus === "rejected"
          ? "Reject"
          : "Resolve";

    Alert.prompt(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: confirmLabel,
          onPress: (reason?: string) => {
            void applyDisposition(nextStatus, reason ?? "");
          },
        },
      ],
      "plain-text",
      delta.dispositionReason,
    );
  };

  const applyDisposition = async (
    status: DeltaStatus,
    dispositionReason: string,
  ) => {
    if (!delta || !user?.uid) {
      return;
    }

    try {
      const result = await updateDeltaDispositionWithCloudSync(
        user.uid,
        delta.projectId,
        delta.id,
        status,
        dispositionReason,
      );
      const updated = await getDeltaById(user.uid, delta.id);

      if (updated) {
        setDelta(updated);
      }

      setCloudSyncPending(result.pending);

      if (
        result.localUpdated &&
        !result.cloudSynced &&
        (result.reason === "not-mapped" || result.reason === "not-signed-in")
      ) {
        Alert.alert(
          "Saved locally",
          "Disposition saved on this device. Connect it to cloud before syncing.",
        );
      } else if (
        result.localUpdated &&
        !result.cloudSynced &&
        result.reason === "remote-failed"
      ) {
        Alert.alert(
          "Saved locally",
          "Disposition saved on this device, but the cloud update could not be completed.",
        );
      }
    } catch {
      // Keep current detail if persistence fails.
    }
  };

  const handleReopen = () => {
    if (!delta || delta.status === "open") {
      return;
    }

    Alert.alert("Reopen this Delta?", "Existing reason remains.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reopen",
        onPress: () => {
          void applyDisposition("open", delta.dispositionReason);
        },
      },
    ]);
  };

  // Fallback when Alert.prompt is unavailable (Android).
  const promptDispositionSafe = (
    nextStatus: Exclude<DeltaStatus, "open">,
  ) => {
    if (typeof Alert.prompt === "function") {
      promptDisposition(nextStatus);
      return;
    }

    Alert.alert(
      nextStatus === "accepted"
        ? "Accept Delta"
        : nextStatus === "rejected"
          ? "Reject Delta"
          : "Resolve Delta",
      "Continue without a reason? You can reopen later if needed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text:
            nextStatus === "accepted"
              ? "Accept"
              : nextStatus === "rejected"
                ? "Reject"
                : "Resolve",
          onPress: () => {
            void applyDisposition(nextStatus, delta?.dispositionReason ?? "");
          },
        },
      ],
    );
  };

  if (delta === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <View style={styles.topBar}>
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (delta === null) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <View style={styles.topBar}>
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Delta not found.</Text>
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
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>DELTA</Text>

        <Text style={styles.projectName}>
          {project?.name ?? "Unknown project"}
        </Text>

        <Text style={styles.planItemLabel}>
          {planItem?.label ?? "Unknown plan item"}
        </Text>

        {measurement ? (
          <Text style={styles.recorded}>
            Recorded {new Date(measurement.createdAt).toLocaleString()}
          </Text>
        ) : (
          <Text style={styles.recorded}>
            Recorded {new Date(delta.createdAt).toLocaleString()}
          </Text>
        )}

        <Text style={styles.sectionTitle}>PLAN VS FIELD</Text>

        <View style={styles.card}>
          <MetricRow
            label="PLANNED"
            value={`${delta.plannedValue.toFixed(2)} ${delta.unit}`}
          />
          <MetricRow
            label="FIELD"
            value={`${delta.actualValue.toFixed(2)} ${delta.unit}`}
          />
          <MetricRow
            label="DIFFERENCE"
            value={formatSignedValue(delta.difference, delta.unit)}
            highlight
          />
          <MetricRow
            label="PERCENT"
            value={formatSignedPercent(delta.percentDifference)}
            highlight
          />
        </View>

        <Text style={styles.sectionTitle}>IMPACT</Text>

        <View style={styles.card}>
          <MetricRow
            label="UNIT COST"
            value={`$${delta.unitCost.toFixed(2)} / ${delta.unit}`}
          />
          <MetricRow
            label="COST IMPACT"
            value={formatSignedCurrency(delta.costImpact)}
            highlight
          />
          <MetricRow
            label="PRODUCTION RATE"
            value={`${delta.productionRatePerDay.toFixed(2)} ${delta.unit}/day`}
          />
          <MetricRow
            label="SCHEDULE IMPACT"
            value={formatSignedDays(delta.scheduleImpactDays)}
            highlight
          />
          <MetricRow
            label="LABOR RATE"
            value={`${delta.laborHoursPerUnit.toFixed(2)} hr / ${delta.unit}`}
          />
          <MetricRow
            label="LABOR IMPACT"
            value={formatSignedHours(delta.laborImpactHours)}
            highlight
          />
        </View>

        <Text style={styles.sectionTitle}>DISPOSITION</Text>

        <View style={styles.card}>
          <Text
            style={styles.statusValue}
            accessibilityRole="text"
            accessibilityLabel={`Disposition ${delta.status}`}
          >
            {delta.status.toUpperCase()}
          </Text>

          {delta.disposedAt ? (
            <Text style={styles.disposedAtText}>
              {delta.status === "accepted"
                ? "Accepted"
                : delta.status === "rejected"
                  ? "Rejected"
                  : "Resolved"}{" "}
              {new Date(delta.disposedAt).toLocaleDateString()}
            </Text>
          ) : null}

          {delta.dispositionReason.trim().length > 0 ? (
            <View style={styles.reasonBlock}>
              <Text style={styles.reasonLabel}>
                {delta.status === "resolved" ? "Resolution" : "Reason"}
              </Text>
              <Text style={styles.reasonText}>{delta.dispositionReason}</Text>
            </View>
          ) : null}

          {cloudSyncPending ? (
            <Text style={styles.pendingSyncText}>Cloud sync pending</Text>
          ) : null}

          <Text style={styles.recordedDifference}>
            Recorded difference:{" "}
            {formatSignedValue(delta.difference, delta.unit)}
          </Text>

          <View style={styles.dispositionActions}>
            <Pressable
              style={styles.dispositionButton}
              onPress={() => promptDispositionSafe("accepted")}
              accessibilityRole="button"
              accessibilityLabel="Accept Delta"
            >
              <Text style={styles.dispositionButtonText}>Accept</Text>
            </Pressable>
            <Pressable
              style={[styles.dispositionButton, styles.rejectButton]}
              onPress={() => promptDispositionSafe("rejected")}
              accessibilityRole="button"
              accessibilityLabel="Reject Delta"
            >
              <Text style={[styles.dispositionButtonText, styles.rejectText]}>
                Reject
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.dispositionButtonWide}
            onPress={() => promptDispositionSafe("resolved")}
            accessibilityRole="button"
            accessibilityLabel="Mark Delta Resolved"
          >
            <Text style={styles.dispositionButtonText}>Mark Resolved</Text>
          </Pressable>

          {delta.status !== "open" ? (
            <Pressable
              style={styles.reopenButton}
              onPress={handleReopen}
              accessibilityRole="button"
              accessibilityLabel="Reopen Delta"
            >
              <Text style={styles.reopenButtonText}>Reopen Delta</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>FIELD EVIDENCE</Text>
        <View style={styles.card}>
          <Text style={styles.evidenceCount}>
            {evidenceItems.length} attached
          </Text>

          <View style={styles.evidenceActions}>
            <Pressable
              style={styles.evidenceActionButton}
              onPress={() =>
                navigation.navigate("AddEvidence", {
                  projectId: delta.projectId,
                  mode: "note",
                  deltaId: delta.id,
                })
              }
            >
              <Text style={styles.evidenceActionText}>Add Note</Text>
            </Pressable>
            <Pressable
              style={styles.evidenceActionButton}
              onPress={() =>
                navigation.navigate("AddEvidence", {
                  projectId: delta.projectId,
                  mode: "photo",
                  deltaId: delta.id,
                })
              }
            >
              <Text style={styles.evidenceActionText}>Add Photo</Text>
            </Pressable>
          </View>

          {evidenceItems.length === 0 ? (
            <Text style={styles.emptyText}>No evidence attached.</Text>
          ) : (
            evidenceItems.map((item) => (
              <View key={item.id} style={styles.evidenceRow}>
                {item.type === "photo" && item.photoUri ? (
                  <Image
                    source={{ uri: item.photoUri }}
                    style={styles.evidenceThumb}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={styles.evidenceRowType}>
                  {item.type === "photo" ? "PHOTO" : "NOTE"}
                </Text>
                {item.note.trim().length > 0 ? (
                  <Text style={styles.evidenceRowNote} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0B0F14",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  content: {
    paddingTop: 20,
    paddingBottom: 40,
  },

  topBar: {
    marginBottom: 12,
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

  eyebrow: {
    ...typography.caption,
    color: "#748093",
  },

  title: {
    ...typography.display,
    marginTop: 12,
    color: "#FFFFFF",
  },

  projectName: {
    ...typography.bodyLarge,
    marginTop: 12,
    color: "#F4A623",
  },

  planItemLabel: {
    ...typography.bodyMedium,
    marginTop: 8,
    color: "#FFFFFF",
  },

  recorded: {
    ...typography.button,
    marginTop: 10,
    marginBottom: 8,
    color: "#8C98A8",
  },

  sectionTitle: {
    ...typography.caption,
    marginTop: 24,
    marginBottom: 12,
    color: "#8F9BA8",
  },

  card: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 14,
    padding: 16,
  },

  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  metricLabel: {
    ...typography.caption,
    color: "#748093",
  },

  metricValue: {
    ...typography.button,
    color: "#D0D7E0",
  },

  metricHighlight: {
    ...typography.button,
    color: "#F4A623",
  },

  statusValue: {
    ...typography.bodyMedium,
    color: "#70E1A1",
  },

  disposedAtText: {
    ...typography.caption,
    marginTop: 8,
    color: "#8C98A8",
  },

  reasonBlock: {
    marginTop: 12,
  },

  reasonLabel: {
    ...typography.caption,
    color: "#748093",
    marginBottom: 4,
  },

  reasonText: {
    ...typography.body,
    color: "#D0D7E0",
  },

  recordedDifference: {
    ...typography.button,
    marginTop: 12,
    marginBottom: 12,
    color: "#F4A623",
  },

  dispositionActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  dispositionButton: {
    width: "48%",
    backgroundColor: "#1B2633",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  rejectButton: {
    borderColor: "#5A3030",
    backgroundColor: "#1A1214",
  },

  dispositionButtonWide: {
    backgroundColor: "#1B2633",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  dispositionButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },

  rejectText: {
    color: "#F07167",
  },

  reopenButton: {
    marginTop: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  reopenButtonText: {
    ...typography.button,
    color: "#8F9BA8",
  },

  pendingSyncText: {
    ...typography.caption,
    marginTop: 8,
    color: "#748093",
  },

  reviewButton: {
    marginTop: 14,
    backgroundColor: "#1B2633",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  reviewButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },

  emptyText: {
    ...typography.caption,
    color: "#7F8A98",
  },

  evidenceCount: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 12,
  },

  evidenceActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  evidenceActionButton: {
    width: "48%",
    backgroundColor: "#1B2633",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  evidenceActionText: {
    ...typography.button,
    color: "#F4A623",
  },

  evidenceRow: {
    borderTopWidth: 1,
    borderTopColor: "#27313D",
    paddingTop: 12,
    marginTop: 12,
  },

  evidenceThumb: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#0B0F14",
  },

  evidenceRowType: {
    ...typography.metadata,
    color: "#748093",
    marginBottom: 4,
  },

  evidenceRowNote: {
    ...typography.caption,
    color: "#D0D7E0",
  },
});
