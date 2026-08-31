import React, { useCallback, useState } from "react";
import {
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
import { getDeltaByMeasurementId } from "../store/deltas";
import { getEvidenceForMeasurement } from "../store/evidence";
import { getMeasurementById } from "../store/measurements";
import { getPlanItemById } from "../store/planItems";
import { getProjectById } from "../store/projects";
import type { Delta } from "../types/delta";
import type { Evidence } from "../types/evidence";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<
  RootStackParamList,
  "MeasurementDetail"
>;

function formatSignedValue(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function formatTypeLabel(type: Measurement["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function MeasurementDetailScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { measurementId } = route.params;

  const [measurement, setMeasurement] = useState<
    Measurement | null | undefined
  >(undefined);
  const [linkedDelta, setLinkedDelta] = useState<Delta | undefined>(
    undefined,
  );
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [planItem, setPlanItem] = useState<PlanItem | undefined>(undefined);
  const [evidenceItems, setEvidenceItems] = useState<Evidence[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setMeasurement(null);
        setLinkedDelta(undefined);
        setProject(undefined);
        setPlanItem(undefined);
        setEvidenceItems([]);
        return;
      }

      const ownerUid = user.uid;

      let active = true;

      async function load() {
        const found = await getMeasurementById(ownerUid, measurementId);

        if (!active) {
          return;
        }

        if (!found) {
          setMeasurement(null);
          setLinkedDelta(undefined);
          setProject(undefined);
          setPlanItem(undefined);
          setEvidenceItems([]);
          return;
        }

        setMeasurement(found);

        const [delta, relatedProject, relatedPlanItem, linkedEvidence] =
          await Promise.all([
            getDeltaByMeasurementId(ownerUid, found.id),
            getProjectById(ownerUid, found.projectId),
            getPlanItemById(ownerUid, found.planItemId),
            getEvidenceForMeasurement(ownerUid, found.projectId, found.id),
          ]);

        if (active) {
          setLinkedDelta(delta);
          setProject(relatedProject);
          setPlanItem(relatedPlanItem);
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
    }, [measurementId, user?.uid]),
  );

  if (measurement === undefined) {
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

  if (measurement === null) {
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

          <Text style={styles.title}>Measurement not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const label = planItem?.label ?? measurement.label;

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

        <Text style={styles.eyebrow}>MEASUREMENT</Text>

        <Text style={styles.projectName}>
          {project?.name ?? "Unknown project"}
        </Text>

        <Text style={styles.planItemLabel}>{label}</Text>

        <Text style={styles.sectionTitle}>FIELD VALUE</Text>
        <View style={styles.card}>
          <Text style={styles.fieldValue}>
            {measurement.value.toFixed(2)} {measurement.unit}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>TYPE</Text>
        <View style={styles.card}>
          <Text style={styles.metricValue}>
            {formatTypeLabel(measurement.type)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>RECORDED</Text>
        <View style={styles.card}>
          <Text style={styles.metricValue}>
            {new Date(measurement.createdAt).toLocaleString()}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>PLAN REFERENCE</Text>
        <View style={styles.card}>
          {planItem ? (
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>PLANNED</Text>
              <Text style={styles.metricValue}>
                {planItem.plannedValue.toFixed(2)} {planItem.unit}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Planned quantity unavailable.
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>LINKED DELTA</Text>
        <View style={styles.card}>
          {linkedDelta ? (
            <>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>DIFFERENCE</Text>
                <Text style={styles.metricHighlight}>
                  {formatSignedValue(
                    linkedDelta.difference,
                    linkedDelta.unit,
                  )}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>STATUS</Text>
                <Text style={styles.statusValue}>
                  {linkedDelta.status.toUpperCase()}
                </Text>
              </View>

              <Pressable
                style={styles.viewDeltaButton}
                onPress={() =>
                  navigation.navigate("DeltaDetail", {
                    deltaId: linkedDelta.id,
                  })
                }
              >
                <Text style={styles.viewDeltaButtonText}>View Delta</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.emptyText}>
              No plan-vs-reality difference was created.
            </Text>
          )}
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
                  projectId: measurement.projectId,
                  mode: "note",
                  measurementId: measurement.id,
                })
              }
            >
              <Text style={styles.evidenceActionText}>Add Note</Text>
            </Pressable>
            <Pressable
              style={styles.evidenceActionButton}
              onPress={() =>
                navigation.navigate("AddEvidence", {
                  projectId: measurement.projectId,
                  mode: "photo",
                  measurementId: measurement.id,
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
    marginBottom: 8,
    color: "#FFFFFF",
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

  fieldValue: {
    fontFamily: "Poppins_500Medium",
    fontSize: 22,
    color: "#F4A623",
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
    ...typography.caption,
    color: "#70E1A1",
  },

  emptyText: {
    ...typography.caption,
    color: "#7F8A98",
  },

  viewDeltaButton: {
    marginTop: 6,
    backgroundColor: "#1B2633",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  viewDeltaButtonText: {
    ...typography.button,
    color: "#FFFFFF",
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
