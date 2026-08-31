import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemsForProject } from "../store/planItems";
import { getProjectById } from "../store/projects";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";
import { typography } from "../theme/colors";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "ProjectMeasurements"
>;

export default function ProjectMeasurementsScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId } = route.params;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [planItemsById, setPlanItemsById] = useState<Map<string, PlanItem>>(
    () => new Map(),
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setMeasurements([]);
        setPlanItemsById(new Map());
        return;
      }

      const ownerUid = user.uid;

      let active = true;

      async function load() {
        const [found, planItems, items] = await Promise.all([
          getProjectById(ownerUid, projectId),
          getPlanItemsForProject(ownerUid, projectId),
          getMeasurementsForProject(ownerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        if (!found) {
          setProject(null);
          setMeasurements([]);
          setPlanItemsById(new Map());
          return;
        }

        const sorted = items.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );

        setProject(found);
        setMeasurements(sorted);
        setPlanItemsById(
          new Map(planItems.map((item) => [item.id, item])),
        );
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid]),
  );

  if (project === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project) {
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

          <Text style={styles.title}>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

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

        <Text style={styles.eyebrow}>MEASUREMENTS</Text>

        <Text style={styles.title}>Project Measurements</Text>

        <Text style={styles.projectContextName}>{project.name}</Text>

        <Text style={styles.subtitle}>
          Field measurements recorded for this project.
        </Text>

        {measurements.length === 0 ? (
          <Text style={styles.emptyState}>
            No field measurements recorded for this project yet.
          </Text>
        ) : (
          <FlatList
            data={measurements}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const planItem = planItemsById.get(item.planItemId);

              return (
                <Pressable
                  style={styles.card}
                  onPress={() =>
                    navigation.navigate("MeasurementDetail", {
                      measurementId: item.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Open measurement ${planItem?.label ?? item.label}`}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.planItemLabel}>
                      {planItem?.label ?? item.label}
                    </Text>
                    <Text style={styles.cardChevron}>›</Text>
                  </View>

                  <Text style={styles.measurementValue}>
                    {item.value.toFixed(2)} {item.unit}
                  </Text>

                  <Text style={styles.measurementMeta}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
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
    paddingTop: 8,
  },

  topBar: {
    marginBottom: 12,
  },

  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
  },

  backButtonText: {
    ...typography.title,
    color: "#9CA3AF",
  },

  eyebrow: {
    ...typography.caption,
    color: "#F4A623",
  },

  title: {
    marginTop: 8,
    ...typography.display,
    color: "#FFFFFF",
  },

  projectContextName: {
    marginTop: 6,
    ...typography.bodyLarge,
    color: "#D1D5DB",
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    ...typography.body,
    color: "#9CA3AF",
  },

  emptyState: {
    marginTop: 12,
    ...typography.body,
    color: "#9CA3AF",
  },

  list: {
    paddingBottom: 40,
  },

  card: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  planItemLabel: {
    flex: 1,
    ...typography.bodyLarge,
    fontFamily: "Poppins_500Medium",
    color: "#FFFFFF",
    paddingRight: 8,
  },

  cardChevron: {
    color: "#7C899A",
    ...typography.title,
  },

  measurementValue: {
    marginTop: 8,
    ...typography.bodyLarge,
    color: "#E5E7EB",
  },

  measurementMeta: {
    marginTop: 6,
    ...typography.caption,
    color: "#7C899A",
  },
});
