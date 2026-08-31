import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  getRemotePlanItemsForProject,
  type RemotePlanItem,
} from "../services/api/planItems";
import {
  getRemoteProjects,
  type RemoteProject,
} from "../services/api/projects";
import { importCloudProjectToDevice } from "../services/sync/importCloudProject";
import { importCloudProjectHistory } from "../services/sync/importCloudHistory";
import { getProjectById } from "../store/projects";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "CloudProjects">;

export default function CloudProjectsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<RemoteProject | null>(
    null,
  );
  const [planItems, setPlanItems] = useState<RemotePlanItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingPlanItems, setLoadingPlanItems] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoringHistory, setRestoringHistory] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [planItemsError, setPlanItemsError] = useState<string | null>(null);
  const [localProjectAvailable, setLocalProjectAvailable] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setProjectsError(null);

    try {
      const remoteProjects = await getRemoteProjects();
      setProjects(remoteProjects);
    } catch {
      setProjects([]);
      setProjectsError("Unable to load cloud projects.");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSelectedProject(null);
      setPlanItems([]);
      setPlanItemsError(null);
      setLocalProjectAvailable(false);
      void loadProjects();
    }, [loadProjects]),
  );

  const refreshLocalAvailability = async (localProjectId: string) => {
    if (!user?.uid) {
      setLocalProjectAvailable(false);
      return;
    }

    const local = await getProjectById(user.uid, localProjectId);
    setLocalProjectAvailable(local != null);
  };

  const selectProject = async (project: RemoteProject) => {
    setSelectedProject(project);
    setPlanItems([]);
    setPlanItemsError(null);
    setLoadingPlanItems(true);
    setLocalProjectAvailable(false);

    try {
      const [items] = await Promise.all([
        getRemotePlanItemsForProject(project.id),
        refreshLocalAvailability(project.localProjectId),
      ]);
      setPlanItems(items);
    } catch {
      setPlanItems([]);
      setPlanItemsError("Unable to load planned quantities.");
      await refreshLocalAvailability(project.localProjectId);
    } finally {
      setLoadingPlanItems(false);
    }
  };

  const handleUseOnThisDevice = async () => {
    if (!user?.uid || !selectedProject) {
      Alert.alert(
        "Not signed in",
        "Your session could not be authenticated.",
      );
      return;
    }

    if (planItemsError) {
      Alert.alert(
        "Unable to import",
        "Load planned quantities before using this project.",
      );
      return;
    }

    setImporting(true);

    try {
      const result = await importCloudProjectToDevice(
        user.uid,
        selectedProject,
        planItems,
      );

      await refreshLocalAvailability(selectedProject.localProjectId);

      if (result.alreadyAvailable) {
        Alert.alert(
          "Already available",
          "This project is already ready on this device.",
        );
        return;
      }

      Alert.alert(
        "Project is ready on this device.",
        "You can restore existing field history when needed.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare this project on this device.";
      Alert.alert("Import failed", message);
    } finally {
      setImporting(false);
    }
  };

  const handleRestoreProjectHistory = async () => {
    if (!user?.uid || !selectedProject) {
      Alert.alert(
        "Not signed in",
        "Your session could not be authenticated.",
      );
      return;
    }

    if (!localProjectAvailable) {
      Alert.alert(
        "Project not on this device",
        "Use this project on the device before restoring history.",
      );
      return;
    }

    setRestoringHistory(true);

    try {
      const result = await importCloudProjectHistory(
        user.uid,
        selectedProject,
      );

      Alert.alert(
        "History restored",
        `${result.measurementsAdded} measurements added, ${result.deltasAdded} deltas added.` +
          (result.measurementsFailed + result.deltasFailed > 0
            ? ` ${result.measurementsFailed + result.deltasFailed} could not be restored.`
            : ""),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to restore project history.";
      Alert.alert("Restore failed", message);
    } finally {
      setRestoringHistory(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => {
            if (selectedProject) {
              setSelectedProject(null);
              setPlanItems([]);
              setPlanItemsError(null);
              setLocalProjectAvailable(false);
              return;
            }

            navigation.goBack();
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>CLOUD PROJECTS</Text>
        <Text style={styles.subtitle}>Read-only cloud data</Text>

        {selectedProject ? (
          <View style={styles.detailSection}>
            <Text style={styles.projectName}>{selectedProject.name}</Text>
            <Text style={styles.projectLocation}>
              {selectedProject.location}
            </Text>
            <Text style={styles.statusText}>
              Status: {selectedProject.status}
            </Text>

            {localProjectAvailable ? (
              <Text style={styles.localNote}>
                Available on this device
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.importButton,
                (importing || loadingPlanItems || restoringHistory) &&
                  styles.buttonDisabled,
              ]}
              onPress={() => {
                void handleUseOnThisDevice();
              }}
              disabled={importing || loadingPlanItems || restoringHistory}
            >
              {importing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.importButtonText}>
                  Use on this device
                </Text>
              )}
            </Pressable>

            {localProjectAvailable ? (
              <Pressable
                style={[
                  styles.historyButton,
                  (importing || loadingPlanItems || restoringHistory) &&
                    styles.buttonDisabled,
                ]}
                onPress={() => {
                  void handleRestoreProjectHistory();
                }}
                disabled={importing || loadingPlanItems || restoringHistory}
              >
                {restoringHistory ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.importButtonText}>
                    Restore project history
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Text style={styles.sectionLabel}>PLANNED QUANTITIES</Text>

            {loadingPlanItems ? (
              <ActivityIndicator color="#FFFFFF" style={styles.loader} />
            ) : planItemsError ? (
              <View>
                <Text style={styles.errorText}>{planItemsError}</Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={() => {
                    void selectProject(selectedProject);
                  }}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : planItems.length === 0 ? (
              <Text style={styles.emptyText}>No planned quantities found.</Text>
            ) : (
              planItems.map((item) => (
                <View key={item.id} style={styles.planItemRow}>
                  <Text style={styles.planItemLabel}>{item.label}</Text>
                  <Text style={styles.planItemValue}>
                    {item.plannedValue} {item.unit}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : loadingProjects ? (
          <ActivityIndicator color="#FFFFFF" style={styles.loader} />
        ) : projectsError ? (
          <View>
            <Text style={styles.errorText}>{projectsError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                void loadProjects();
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : projects.length === 0 ? (
          <Text style={styles.emptyText}>No cloud projects found.</Text>
        ) : (
          projects.map((project) => (
            <Pressable
              key={project.id}
              style={styles.projectCard}
              onPress={() => {
                void selectProject(project);
              }}
            >
              <Text style={styles.projectName}>{project.name}</Text>
              <Text style={styles.projectLocation}>{project.location}</Text>
              <Text style={styles.statusText}>Status: {project.status}</Text>
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
    backgroundColor: "#0B0F14",
  },

  container: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  backButton: {
    alignSelf: "flex-start",
    marginBottom: 18,
  },

  backText: {
    ...typography.bodyLarge,
    color: "#9CA3AF",
  },

  eyebrow: {
    ...typography.caption,
    color: "#F4A623",
  },

  subtitle: {
    ...typography.body,
    marginTop: 8,
    color: "#9CA3AF",
    marginBottom: 24,
  },

  loader: {
    marginTop: 24,
  },

  errorText: {
    ...typography.body,
    marginTop: 12,
    color: "#F87171",
  },

  emptyText: {
    ...typography.body,
    marginTop: 12,
    color: "#9CA3AF",
  },

  retryButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  retryButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },

  importButton: {
    marginTop: 18,
    backgroundColor: "#1D4ED8",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  historyButton: {
    marginTop: 10,
    backgroundColor: "#334155",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  importButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  projectCard: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },

  detailSection: {
    marginTop: 4,
  },

  projectName: {
    ...typography.sectionTitle,
    color: "#FFFFFF",
  },

  projectLocation: {
    ...typography.button,
    marginTop: 5,
    color: "#8B9BB0",
  },

  statusText: {
    ...typography.caption,
    marginTop: 8,
    color: "#6EE7A8",
  },

  localNote: {
    ...typography.caption,
    marginTop: 12,
    color: "#9CA3AF",
  },

  sectionLabel: {
    ...typography.caption,
    marginTop: 28,
    marginBottom: 12,
    color: "#7C899A",
  },

  planItemRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27313D",
  },

  planItemLabel: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },

  planItemValue: {
    ...typography.button,
    marginTop: 4,
    color: "#8B9BB0",
  },
});
