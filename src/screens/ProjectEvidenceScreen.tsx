import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { importCloudEvidenceForProject } from "../services/sync/importCloudEvidence";
import {
  deleteEvidenceLocalFirst,
  syncEvidenceDeleteToCloud,
} from "../services/sync/evidenceDelete";
import { runCloudSyncCycle } from "../services/sync/cloudSyncCycle";
import { getDeltasForProject } from "../store/deltas";
import { getEvidenceForProject } from "../store/evidence";
import { getPendingEvidenceUploadsForProject } from "../store/evidenceUploadSyncState";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemsForProject } from "../store/planItems";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getProjectById } from "../store/projects";
import type { Delta } from "../types/delta";
import type { Evidence } from "../types/evidence";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "ProjectEvidence">;

type ContextFilter = "all" | "project" | "measurements" | "deltas";
type TypeFilter = "all" | "photos" | "notes";
type SortOrder = "newest" | "oldest";
type EvidenceContextKind = "project" | "measurement" | "delta";

type ContextMaps = {
  measurementsById: Map<string, Measurement>;
  deltasById: Map<string, Delta>;
  planItemsById: Map<string, PlanItem>;
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatSignedValue(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function getEvidenceContextKind(item: Evidence): EvidenceContextKind {
  if (item.measurementId) {
    return "measurement";
  }

  if (item.deltaId) {
    return "delta";
  }

  return "project";
}

function getEvidenceContextTitle(kind: EvidenceContextKind): string {
  switch (kind) {
    case "measurement":
      return "Measurement evidence";
    case "delta":
      return "Delta evidence";
    default:
      return "Project evidence";
  }
}

function getEvidenceContextDetail(
  item: Evidence,
  maps: ContextMaps,
): string | null {
  const kind = getEvidenceContextKind(item);

  if (kind === "measurement" && item.measurementId) {
    const measurement = maps.measurementsById.get(item.measurementId);

    if (!measurement) {
      return null;
    }

    const planItem = maps.planItemsById.get(measurement.planItemId);
    const label = planItem?.label ?? measurement.label;
    return `${label} · ${measurement.value.toFixed(2)} ${measurement.unit}`;
  }

  if (kind === "delta" && item.deltaId) {
    const delta = maps.deltasById.get(item.deltaId);

    if (!delta) {
      return null;
    }

    const planItem = maps.planItemsById.get(delta.planItemId);
    const label = planItem?.label ?? "Plan item";
    return `${label} · ${formatSignedValue(delta.difference, delta.unit)}`;
  }

  return null;
}

function getSearchHaystack(item: Evidence, maps: ContextMaps): string {
  const kind = getEvidenceContextKind(item);
  const title = getEvidenceContextTitle(kind);
  const detail = getEvidenceContextDetail(item, maps) ?? "";
  const typeWord = item.type === "photo" ? "photo" : "note";

  return `${item.note} ${title} ${detail} ${typeWord} ${kind}`.toLowerCase();
}

function matchesEvidenceSearch(
  item: Evidence,
  query: string,
  maps: ContextMaps,
): boolean {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return true;
  }

  return getSearchHaystack(item, maps).includes(trimmed);
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ProjectEvidenceScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId } = route.params;

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [items, setItems] = useState<Evidence[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMaps, setContextMaps] = useState<ContextMaps>({
    measurementsById: new Map(),
    deltasById: new Map(),
    planItemsById: new Map(),
  });

  const [contextFilter, setContextFilter] = useState<ContextFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const loadArchive = useCallback(async (ownerUid: string) => {
    const [
      found,
      evidence,
      pending,
      mappedRemoteId,
      measurements,
      deltas,
      planItems,
    ] = await Promise.all([
      getProjectById(ownerUid, projectId),
      getEvidenceForProject(ownerUid, projectId),
      getPendingEvidenceUploadsForProject(ownerUid, projectId),
      getRemoteProjectId(ownerUid, projectId),
      getMeasurementsForProject(ownerUid, projectId),
      getDeltasForProject(ownerUid, projectId),
      getPlanItemsForProject(ownerUid, projectId),
    ]);

    if (!found) {
      setProject(null);
      setItems([]);
      setPendingIds(new Set());
      setRemoteProjectId(null);
      setContextMaps({
        measurementsById: new Map(),
        deltasById: new Map(),
        planItemsById: new Map(),
      });
      return;
    }

    const sorted = [...evidence].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );

    setProject(found);
    setItems(sorted);
    setPendingIds(new Set(pending.map((item) => item.localEvidenceId)));
    setRemoteProjectId(mappedRemoteId ?? null);
    setContextMaps({
      measurementsById: new Map(
        measurements.map((item) => [item.id, item]),
      ),
      deltasById: new Map(deltas.map((item) => [item.id, item])),
      planItemsById: new Map(planItems.map((item) => [item.id, item])),
    });
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setItems([]);
        setPendingIds(new Set());
        setRemoteProjectId(null);
        setContextMaps({
          measurementsById: new Map(),
          deltasById: new Map(),
          planItemsById: new Map(),
        });
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        await loadArchive(ownerUid);

        if (!active) {
          return;
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [loadArchive, user?.uid]),
  );

  const counts = useMemo(() => {
    let projectCount = 0;
    let measurementCount = 0;
    let deltaCount = 0;
    let photoCount = 0;
    let noteCount = 0;

    for (const item of items) {
      const kind = getEvidenceContextKind(item);

      if (kind === "project") {
        projectCount += 1;
      } else if (kind === "measurement") {
        measurementCount += 1;
      } else {
        deltaCount += 1;
      }

      if (item.type === "photo") {
        photoCount += 1;
      } else {
        noteCount += 1;
      }
    }

    return {
      all: items.length,
      project: projectCount,
      measurements: measurementCount,
      deltas: deltaCount,
      photos: photoCount,
      notes: noteCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const kind = getEvidenceContextKind(item);

      if (contextFilter === "project" && kind !== "project") {
        return false;
      }

      if (contextFilter === "measurements" && kind !== "measurement") {
        return false;
      }

      if (contextFilter === "deltas" && kind !== "delta") {
        return false;
      }

      if (typeFilter === "photos" && item.type !== "photo") {
        return false;
      }

      if (typeFilter === "notes" && item.type !== "note") {
        return false;
      }

      return matchesEvidenceSearch(item, searchQuery, contextMaps);
    });

    const sorted = [...filtered].sort((a, b) =>
      sortOrder === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );

    return sorted;
  }, [items, contextFilter, typeFilter, searchQuery, sortOrder, contextMaps]);

  const handleRestore = async () => {
    if (!user?.uid || !remoteProjectId || restoring) {
      return;
    }

    setRestoring(true);

    try {
      const result = await importCloudEvidenceForProject(
        user.uid,
        projectId,
        remoteProjectId,
      );

      await loadArchive(user.uid);

      if (result.failed > 0) {
        Alert.alert(
          "Evidence restored",
          `${result.added} restored, ${result.failed} could not be restored.`,
        );
      } else {
        Alert.alert(
          "Evidence restored",
          `${result.added} added, ${result.existing} already on this device.`,
        );
      }
    } catch {
      Alert.alert(
        "Unable to restore cloud evidence.",
        "Check your connection and try again.",
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = (item: Evidence) => {
    if (!user?.uid || deletingId) {
      return;
    }

    const message =
      item.type === "photo"
        ? "This will remove the photo from this device and from cloud storage when connected."
        : "This will remove the note from this device and the cloud.";

    Alert.alert("Delete this evidence?", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (!user?.uid) {
              return;
            }

            setDeletingId(item.id);

            try {
              const result = await deleteEvidenceLocalFirst(
                user.uid,
                projectId,
                item.id,
              );

              if (!result.deleted) {
                Alert.alert(
                  "Unable to delete evidence.",
                  "Please try again.",
                );
                return;
              }

              await loadArchive(user.uid);

              if (result.cloudPending) {
                void syncEvidenceDeleteToCloud(
                  user.uid,
                  projectId,
                  item.id,
                ).then((syncResult) => {
                  if (
                    !syncResult.synced &&
                    syncResult.reason === "remote-failed"
                  ) {
                    void runCloudSyncCycle(user.uid);
                    Alert.alert(
                      "Removed from this device",
                      "Cloud deletion will retry when connected.",
                    );
                  }
                });
              }
            } catch {
              Alert.alert(
                "Unable to delete evidence.",
                "Please try again.",
              );
            } finally {
              setDeletingId(null);
            }
          })();
        },
      },
    ]);
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

  const listHeader = (
    <View>
      <Text style={styles.eyebrow}>FIELD EVIDENCE</Text>
      <Text style={styles.title}>{project.name}</Text>
      <Text style={styles.subtitle}>Photos and notes for this project.</Text>

      <View style={styles.actions}>
        <Pressable
          style={styles.actionButton}
          onPress={() =>
            navigation.navigate("AddEvidence", {
              projectId: project.id,
              mode: "note",
            })
          }
        >
          <Text style={styles.actionButtonText}>+ Add Note</Text>
        </Pressable>

        <Pressable
          style={styles.actionButton}
          onPress={() =>
            navigation.navigate("AddEvidence", {
              projectId: project.id,
              mode: "photo",
            })
          }
        >
          <Text style={styles.actionButtonText}>+ Add Photo</Text>
        </Pressable>
      </View>

      {remoteProjectId ? (
        <Pressable
          style={[
            styles.restoreButton,
            restoring && styles.restoreButtonDisabled,
          ]}
          onPress={() => {
            void handleRestore();
          }}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator color="#F4A623" />
          ) : (
            <Text style={styles.restoreButtonText}>
              Restore Cloud Evidence
            </Text>
          )}
        </Pressable>
      ) : null}

      {items.length > 0 ? (
        <>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search evidence"
            placeholderTextColor="#667384"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          <Text style={styles.filterSectionLabel}>CONTEXT</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <FilterPill
              label={`All ${counts.all}`}
              active={contextFilter === "all"}
              onPress={() => setContextFilter("all")}
            />
            <FilterPill
              label={`Project ${counts.project}`}
              active={contextFilter === "project"}
              onPress={() => setContextFilter("project")}
            />
            <FilterPill
              label={`Measurements ${counts.measurements}`}
              active={contextFilter === "measurements"}
              onPress={() => setContextFilter("measurements")}
            />
            <FilterPill
              label={`Deltas ${counts.deltas}`}
              active={contextFilter === "deltas"}
              onPress={() => setContextFilter("deltas")}
            />
          </ScrollView>

          <Text style={styles.filterSectionLabel}>TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <FilterPill
              label="All"
              active={typeFilter === "all"}
              onPress={() => setTypeFilter("all")}
            />
            <FilterPill
              label={`Photos ${counts.photos}`}
              active={typeFilter === "photos"}
              onPress={() => setTypeFilter("photos")}
            />
            <FilterPill
              label={`Notes ${counts.notes}`}
              active={typeFilter === "notes"}
              onPress={() => setTypeFilter("notes")}
            />
          </ScrollView>

          <Text style={styles.filterSectionLabel}>SORT</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            <FilterPill
              label="Newest"
              active={sortOrder === "newest"}
              onPress={() => setSortOrder("newest")}
            />
            <FilterPill
              label="Oldest"
              active={sortOrder === "oldest"}
              onPress={() => setSortOrder("oldest")}
            />
          </ScrollView>

          <Text style={styles.resultSummary}>
            {filteredItems.length === counts.all
              ? `${counts.all} evidence records`
              : `Showing ${filteredItems.length} of ${counts.all}`}
          </Text>
        </>
      ) : null}
    </View>
  );

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
          <View style={styles.topBarPlaceholder} />
        </View>

        {items.length === 0 ? (
          <View>
            {listHeader}
            <Text style={styles.emptyState}>
              No field evidence recorded yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyState}>
                No evidence matches these filters.
              </Text>
            }
            renderItem={({ item }) => {
              const kind = getEvidenceContextKind(item);
              const detail = getEvidenceContextDetail(item, contextMaps);

              return (
                <View style={styles.card}>
                  {item.type === "photo" && item.photoUri ? (
                    <Image
                      source={{ uri: item.photoUri }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                  ) : null}

                  <Text style={styles.cardType}>
                    {item.type === "photo" ? "PHOTO" : "NOTE"}
                  </Text>

                  <Text style={styles.contextLabel}>
                    {getEvidenceContextTitle(kind)}
                  </Text>

                  {detail ? (
                    <Text style={styles.contextDetail}>{detail}</Text>
                  ) : null}

                  {item.note.trim().length > 0 ? (
                    <Text style={styles.cardNote}>{item.note}</Text>
                  ) : null}

                  <Text style={styles.cardMeta}>
                    {formatCreatedAt(item.createdAt)}
                  </Text>

                  {pendingIds.has(item.id) ? (
                    <Text style={styles.pendingText}>
                      Cloud upload pending
                    </Text>
                  ) : null}

                  <Pressable
                    style={[
                      styles.deleteButton,
                      deletingId === item.id && styles.deleteButtonDisabled,
                    ]}
                    onPress={() => handleDelete(item)}
                    disabled={deletingId === item.id || restoring}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator color="#F07167" />
                    ) : (
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    )}
                  </Pressable>
                </View>
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

  topBarPlaceholder: {
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
    marginTop: 6,
    marginBottom: 18,
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  actionButton: {
    width: "48%",
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  actionButtonText: {
    ...typography.button,
    color: "#F4A623",
  },

  restoreButton: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 18,
  },

  restoreButtonDisabled: {
    opacity: 0.7,
  },

  restoreButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },

  searchInput: {
    ...typography.body,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 12,
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },

  filterSectionLabel: {
    ...typography.caption,
    color: "#748093",
    marginBottom: 8,
  },

  pillRow: {
    flexDirection: "row",
    paddingBottom: 14,
    gap: 8,
  },

  pill: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  pillActive: {
    borderColor: "#F4A623",
    backgroundColor: "#1A1510",
  },

  pillText: {
    ...typography.caption,
    color: "#8F9BA8",
  },

  pillTextActive: {
    color: "#F4A623",
  },

  resultSummary: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 14,
  },

  emptyState: {
    ...typography.caption,
    color: "#7F8A98",
    marginTop: 4,
  },

  listContent: {
    paddingBottom: 40,
  },

  card: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },

  thumbnail: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#0B0F14",
  },

  cardType: {
    ...typography.caption,
    color: "#748093",
    marginBottom: 4,
  },

  contextLabel: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 2,
  },

  contextDetail: {
    ...typography.button,
    color: "#D0D7E0",
    marginBottom: 8,
  },

  cardNote: {
    ...typography.body,
    color: "#FFFFFF",
    marginBottom: 8,
  },

  cardMeta: {
    ...typography.caption,
    color: "#7F8A98",
  },

  pendingText: {
    ...typography.caption,
    color: "#F4A623",
    marginTop: 8,
  },

  deleteButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#5A3030",
    backgroundColor: "#1A1214",
  },

  deleteButtonDisabled: {
    opacity: 0.7,
  },

  deleteButtonText: {
    ...typography.button,
    color: "#F07167",
  },
});
