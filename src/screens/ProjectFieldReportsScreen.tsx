import React, { useCallback, useState } from "react";
import {
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
import { getProjectById } from "../store/projects";
import { getSavedFieldReportsForProject } from "../store/savedFieldReports";
import type { Project } from "../types/project";
import type { SavedFieldReport } from "../types/savedFieldReport";
import {
  formatLocalDateInput,
  resolveCustomFieldReportRange,
  resolveFieldReportRange,
  type FieldReportPeriodPreset,
} from "../utils/domain/fieldReport";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<
  RootStackParamList,
  "ProjectFieldReports"
>;

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

export default function ProjectFieldReportsScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const projectId = route.params.projectId;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [preset, setPreset] = useState<FieldReportPeriodPreset>("today");
  const [customStart, setCustomStart] = useState(() =>
    formatLocalDateInput(new Date()),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    formatLocalDateInput(new Date()),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<SavedFieldReport[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setSavedReports([]);
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        const [found, saved] = await Promise.all([
          getProjectById(ownerUid, projectId),
          getSavedFieldReportsForProject(ownerUid, projectId),
        ]);

        if (active) {
          setProject(found ?? null);
          setSavedReports(saved);
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid]),
  );

  const selectPreset = (next: FieldReportPeriodPreset) => {
    setPreset(next);
    setValidationError(null);
  };

  const handleGenerate = () => {
    setValidationError(null);

    if (preset === "custom") {
      const resolved = resolveCustomFieldReportRange(customStart, customEnd);

      if (!resolved.ok) {
        setValidationError(resolved.error);
        return;
      }

      navigation.navigate("FieldReportPreview", {
        projectId,
        startAt: resolved.startAt,
        endAt: resolved.endAt,
        periodLabel: resolved.label,
      });
      return;
    }

    const resolved = resolveFieldReportRange(preset);

    navigation.navigate("FieldReportPreview", {
      projectId,
      startAt: resolved.startAt,
      endAt: resolved.endAt,
      periodLabel: resolved.label,
    });
  };

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
        keyboardShouldPersistTaps="handled"
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
          <Text style={styles.topBarTitle}>Field Reports</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <Text style={styles.eyebrow}>FIELD REPORTS</Text>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.subtitle}>
          Create a field report from documented project activity.
        </Text>

        <Text style={styles.sectionTitle}>REPORTING PERIOD</Text>

        <View style={styles.presetRow}>
          {(
            [
              ["today", "Today"],
              ["last7", "Last 7 Days"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => {
            const selected = preset === value;

            return (
              <Pressable
                key={value}
                style={[styles.presetChip, selected && styles.presetChipActive]}
                onPress={() => selectPreset(value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    selected && styles.presetChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {preset === "custom" ? (
          <View style={styles.customBlock}>
            <Text style={styles.inputLabel}>Start date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={customStart}
              onChangeText={(text) => {
                setCustomStart(text.trim());
                setValidationError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="2026-08-21"
              placeholderTextColor="#5C6673"
              accessibilityLabel="Start date"
            />

            <Text style={styles.inputLabel}>End date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={customEnd}
              onChangeText={(text) => {
                setCustomEnd(text.trim());
                setValidationError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="2026-08-21"
              placeholderTextColor="#5C6673"
              accessibilityLabel="End date"
            />
          </View>
        ) : null}

        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        <Pressable
          style={styles.generateButton}
          onPress={handleGenerate}
          accessibilityRole="button"
          accessibilityLabel="Generate report"
        >
          <Text style={styles.generateButtonText}>Generate Report</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>SAVED REPORTS</Text>

        {savedReports.length === 0 ? (
          <Text style={styles.emptySavedText}>No saved reports yet.</Text>
        ) : (
          savedReports.map((item) => (
            <Pressable
              key={item.id}
              style={styles.savedCard}
              onPress={() =>
                navigation.navigate("FieldReportPreview", {
                  projectId,
                  savedReportId: item.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open saved report ${item.snapshot.periodLabel}`}
            >
              <Text style={styles.savedTitle}>{item.snapshot.periodLabel}</Text>
              <Text style={styles.savedMeta}>
                Generated {formatDateTime(item.snapshot.generatedAt)}
              </Text>
              <Text style={styles.savedMeta}>
                Saved {formatDateTime(item.savedAt)}
              </Text>
              <Text style={styles.savedCounts}>
                {item.snapshot.activity.measurements} measurement
                {item.snapshot.activity.measurements === 1 ? "" : "s"} ·{" "}
                {item.snapshot.activity.deltas} delta
                {item.snapshot.activity.deltas === 1 ? "" : "s"} ·{" "}
                {item.snapshot.activity.evidence} evidence
              </Text>
              <Text style={styles.savedCta}>Open</Text>
            </Pressable>
          ))
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
    paddingBottom: 40,
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
    marginBottom: 12,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetChipActive: {
    borderColor: "#F4A623",
    backgroundColor: "#1A1510",
  },
  presetChipText: {
    ...typography.caption,
    color: "#8F9BA8",
  },
  presetChipTextActive: {
    color: "#F4A623",
  },
  customBlock: {
    marginTop: 16,
  },
  inputLabel: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    ...typography.bodyLarge,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    ...typography.caption,
    color: "#F07167",
    marginTop: 14,
  },
  generateButton: {
    marginTop: 24,
    backgroundColor: "#F4A623",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  generateButtonText: {
    ...typography.bodyMedium,
    color: "#111111",
  },
  emptySavedText: {
    ...typography.button,
    color: "#7F8A98",
  },
  savedCard: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 10,
  },
  savedTitle: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },
  savedMeta: {
    ...typography.button,
    color: "#8F9BA8",
    marginTop: 6,
  },
  savedCounts: {
    ...typography.button,
    color: "#748093",
    marginTop: 6,
  },
  savedCta: {
    ...typography.button,
    color: "#F4A623",
    marginTop: 10,
  },
});
