import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { runCloudSyncCycle } from "../services/sync/cloudSyncCycle";
import { addDelta, getDeltaByMeasurementId } from "../store/deltas";
import { addMeasurement } from "../store/measurements";
import { markMeasurementUploadPending } from "../store/measurementUploadSyncState";
import { markDeltaUploadPending } from "../store/deltaUploadSyncState";
import {
  getLengthPlanItemsForProject,
  getPlanItemById,
} from "../store/planItems";
import { getProjectById } from "../store/projects";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";
import { createDeltaFromMeasurement } from "../utils/domain/createDeltaFromMeasurement";
import { feetAndInchesToFeet } from "../utils/calculations/units";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "Measurement">;

function createMeasurementId(): string {
  return `measurement-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export default function MeasurementScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId, planItemId: initialPlanItemId } = route.params;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [lengthPlanItems, setLengthPlanItems] = useState<PlanItem[]>([]);
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<string | null>(
    initialPlanItemId ?? null,
  );
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setLengthPlanItems([]);
        return;
      }

      const ownerUid = user.uid;

      let active = true;

      async function load() {
        const [found, items] = await Promise.all([
          getProjectById(ownerUid, projectId),
          getLengthPlanItemsForProject(ownerUid, projectId),
        ]);

        if (active) {
          setProject(found ?? null);
          setLengthPlanItems(items);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid]),
  );

  useEffect(() => {
    if (
      initialPlanItemId &&
      lengthPlanItems.some((item) => item.id === initialPlanItemId)
    ) {
      setSelectedPlanItemId(initialPlanItemId);
      return;
    }

    if (lengthPlanItems.length === 1) {
      setSelectedPlanItemId(lengthPlanItems[0].id);
      return;
    }

    setSelectedPlanItemId((current) => {
      if (
        current &&
        lengthPlanItems.some((item) => item.id === current)
      ) {
        return current;
      }

      return null;
    });
  }, [initialPlanItemId, lengthPlanItems]);

  const selectedPlanItem = selectedPlanItemId
    ? lengthPlanItems.find((item) => item.id === selectedPlanItemId)
    : undefined;

  const totalFeet = useMemo(() => {
    const ft = Number(feet || 0);
    const inch = Number(inches || 0);

    return feetAndInchesToFeet(ft, inch);
  }, [feet, inches]);

  const saveMeasurement = async () => {
    const ft = Number(feet || 0);
    const inch = Number(inches || 0);

    if (
      !Number.isFinite(ft) ||
      !Number.isFinite(inch) ||
      ft < 0 ||
      inch < 0 ||
      inch >= 12 ||
      feetAndInchesToFeet(ft, inch) <= 0
    ) {
      Alert.alert(
        "Invalid measurement",
        "Enter a valid length before saving.",
      );
      return;
    }

    if (!selectedPlanItemId) {
      Alert.alert(
        "Select a plan item",
        "Choose which planned quantity this field measurement is against.",
      );
      return;
    }

    const ownerUid = user?.uid;

    if (!ownerUid) {
      Alert.alert(
        "Not signed in",
        "Your session could not be authenticated.",
      );
      return;
    }

    const planItem = await getPlanItemById(ownerUid, selectedPlanItemId);

    if (
      !planItem ||
      planItem.projectId !== projectId ||
      planItem.type !== "length" ||
      planItem.unit !== "ft"
    ) {
      Alert.alert(
        "Invalid plan item",
        "The selected planned quantity is not valid for this project.",
      );
      return;
    }

    const value = feetAndInchesToFeet(ft, inch);

    const measurement: Measurement = {
      id: createMeasurementId(),
      projectId,
      planItemId: planItem.id,
      type: "length",
      label: planItem.label,
      value,
      unit: "ft",
      createdAt: new Date().toISOString(),
    };

    try {
      await addMeasurement(ownerUid, measurement);
    } catch {
      Alert.alert(
        "Unable to save measurement",
        "The field measurement could not be saved. Please try again.",
      );
      return;
    }

    try {
      await markMeasurementUploadPending(
        ownerUid,
        projectId,
        measurement.id,
      );
    } catch {
      // Local save already succeeded; lifecycle retry can still pick this up later
      // only if pending was marked — ignore mark failures here.
    }

    try {
      const existingDelta = await getDeltaByMeasurementId(
        ownerUid,
        measurement.id,
      );

      if (!existingDelta) {
        const delta = createDeltaFromMeasurement(measurement, planItem);

        if (delta) {
          await addDelta(ownerUid, delta);

          try {
            await markDeltaUploadPending(ownerUid, projectId, delta.id);
          } catch {
            // Local Delta already saved; lifecycle can retry later if pending was marked.
          }
        }
      }
    } catch {
      void runCloudSyncCycle(ownerUid);

      Alert.alert(
        "Measurement saved",
        "The measurement was saved, but the comparison record could not be saved.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      );
      return;
    }

    void runCloudSyncCycle(ownerUid);

    Alert.alert(
      "Measurement saved",
      "The field measurement was added to this project.",
      [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  if (project === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Text style={styles.title}>Project not found.</Text>

          <Text style={styles.subtitle}>
            This measurement is not associated with a known project.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>
          FIELD MEASUREMENT
        </Text>

        <Text style={styles.projectName}>
          {project.name}
        </Text>

        <Text style={styles.title}>
          Record field dimensions
        </Text>

        <Text style={styles.subtitle}>
          Measurements will later be compared against the project plan.
        </Text>

        <Text style={styles.sectionLabel}>
          MEASURE AGAINST
        </Text>

        {lengthPlanItems.length === 0 ? (
          <Text style={styles.emptyPlanItems}>
            No length plan items are available for this project.
          </Text>
        ) : (
          lengthPlanItems.map((item) => {
            const isSelected = item.id === selectedPlanItemId;

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.planItemOption,
                  isSelected && styles.planItemOptionSelected,
                ]}
                onPress={() => setSelectedPlanItemId(item.id)}
              >
                <View style={styles.planItemContent}>
                  <Text style={styles.planItemLabel}>
                    {item.label}
                  </Text>

                  <Text style={styles.planItemValue}>
                    Planned {item.plannedValue.toFixed(2)} {item.unit}
                  </Text>
                </View>

                <Text style={styles.planItemCheck}>
                  {isSelected ? "✓" : ""}
                </Text>
              </Pressable>
            );
          })
        )}

        {selectedPlanItem ? (
          <Text style={styles.selectedHint}>
            Selected: {selectedPlanItem.label}
          </Text>
        ) : null}

        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Feet</Text>

            <TextInput
              value={feet}
              onChangeText={setFeet}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#677386"
              style={styles.input}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Inches</Text>

            <TextInput
              value={inches}
              onChangeText={setInches}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#677386"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>
            NORMALIZED LENGTH
          </Text>

          <Text style={styles.resultValue}>
            {totalFeet.toFixed(2)} ft
          </Text>
        </View>

        <Pressable style={styles.saveButton} onPress={saveMeasurement}>
          <Text style={styles.saveButtonText}>
            Save Measurement
          </Text>
        </Pressable>
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
    backgroundColor: "#0B0F14",
  },

  content: {
    padding: 20,
    paddingBottom: 50,
  },

  backButton: {
    marginBottom: 28,
  },

  backText: {
    ...typography.body,
    color: "#9AA6B5",
  },

  eyebrow: {
    ...typography.caption,
    color: "#7B8797",
  },

  projectName: {
    ...typography.bodyLarge,
    marginTop: 8,
    color: "#F4A623",
  },

  title: {
    ...typography.display,
    marginTop: 8,
    color: "#FFFFFF",
  },

  subtitle: {
    ...typography.body,
    marginTop: 10,
    color: "#929EAE",
  },

  sectionLabel: {
    ...typography.caption,
    marginTop: 28,
    marginBottom: 12,
    color: "#7B8797",
  },

  emptyPlanItems: {
    ...typography.caption,
    color: "#7F8A98",
    marginBottom: 8,
  },

  planItemOption: {
    backgroundColor: "#131A23",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  planItemOptionSelected: {
    borderColor: "#F4A623",
  },

  planItemContent: {
    flex: 1,
  },

  planItemLabel: {
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
    color: "#FFFFFF",
  },

  planItemValue: {
    ...typography.button,
    marginTop: 4,
    color: "#8995A5",
  },

  planItemCheck: {
    ...typography.sectionTitle,
    color: "#F4A623",
    width: 24,
    textAlign: "center",
  },

  selectedHint: {
    ...typography.button,
    marginTop: 4,
    marginBottom: 8,
    color: "#F4A623",
  },

  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },

  inputGroup: {
    flex: 1,
  },

  label: {
    ...typography.caption,
    color: "#8995A5",
    marginBottom: 8,
  },

  input: {
    fontFamily: "Poppins_500Medium",
    fontSize: 20,
    backgroundColor: "#131A23",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 58,
    color: "#FFFFFF",
  },

  resultCard: {
    backgroundColor: "#131A23",
    borderRadius: 18,
    padding: 20,
    marginTop: 22,
  },

  resultLabel: {
    ...typography.caption,
    color: "#748093",
  },

  resultValue: {
    fontFamily: "Poppins_500Medium",
    fontSize: 30,
    marginTop: 8,
    color: "#FFFFFF",
  },

  saveButton: {
    marginTop: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },

  saveButtonText: {
    ...typography.bodyMedium,
    color: "#0B0F14",
  },
});
