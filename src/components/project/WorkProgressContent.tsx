import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../../auth/AuthProvider";
import { getRemoteWorkPackageAssignmentsForProject } from "../../services/api/workPackageAssignments";
import { getRemoteWorkPackagesForProject } from "../../services/api/workPackages";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getProjectById } from "../../store/projects";
import { colors, typography } from "../../theme/colors";
import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import type { WorkPackageStatus } from "../../types/workPackage";
import {
  assignmentProgressStatusColor,
  formatAssignmentStatusPresentation,
  formatWorkPackageStatusPresentation,
} from "../../utils/domain/statusPresentation";

export type WorkProgressContentProps = {
  projectId: string;
  onOpenWorkPackage?: (args: {
    remoteProjectId: string;
    workPackageId: string;
  }) => void;
};

type WorkPackageProgressRow = {
  id: string;
  name: string;
  workPackageStatus: WorkPackageStatus;
  assignmentCount: number;
  statusCounts: Partial<Record<WorkPackageAssignmentStatus, number>>;
};

function summarizeStatuses(
  counts: Partial<Record<WorkPackageAssignmentStatus, number>>,
): string {
  const parts: string[] = [];
  const order: WorkPackageAssignmentStatus[] = [
    "ready_for_review",
    "in_progress",
    "accepted",
    "assigned",
    "completed",
  ];
  for (const status of order) {
    const count = counts[status] ?? 0;
    if (count > 0) {
      parts.push(
        `${count} ${formatAssignmentStatusPresentation(status, {
          prefixed: false,
        })}`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "No active assignments";
}

/**
 * Reusable Work Progress body (Phase UI extraction).
 * Standalone chrome (SafeArea / back / screen title) stays in WorkProgressScreen.
 */
export default function WorkProgressContent({
  projectId,
  onOpenWorkPackage,
}: WorkProgressContentProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [rows, setRows] = useState<WorkPackageProgressRow[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setError("unavailable");
        setRows([]);
        return;
      }

      let active = true;

      async function load() {
        setLoading(true);
        setError(null);

        try {
          const ownerUid = user!.uid;
          const project = await getProjectById(ownerUid, projectId);
          if (!project) {
            if (active) {
              setError("unavailable");
              setRows([]);
            }
            return;
          }

          const mapped = await getRemoteProjectId(ownerUid, projectId);
          if (!mapped) {
            if (active) {
              setError("unavailable");
              setRows([]);
            }
            return;
          }

          const [workPackages, assignments] = await Promise.all([
            getRemoteWorkPackagesForProject(mapped),
            getRemoteWorkPackageAssignmentsForProject(mapped),
          ]);

          if (!active) {
            return;
          }

          const nextRows: WorkPackageProgressRow[] = workPackages.map((wp) => {
            const packageAssignments = assignments.filter(
              (assignment) =>
                assignment.workPackageId === wp.id &&
                assignment.status !== "cancelled",
            );
            const statusCounts: Partial<
              Record<WorkPackageAssignmentStatus, number>
            > = {};
            for (const assignment of packageAssignments) {
              statusCounts[assignment.status] =
                (statusCounts[assignment.status] ?? 0) + 1;
            }
            return {
              id: wp.id,
              name: wp.name,
              workPackageStatus: wp.status,
              assignmentCount: packageAssignments.length,
              statusCounts,
            };
          });

          setRemoteProjectId(mapped);
          setRows(nextRows);
        } catch {
          if (active) {
            setError("network");
            setRows([]);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();
      return () => {
        active = false;
      };
    }, [user?.uid, projectId, retryToken]),
  );

  const readyCount = useMemo(
    () =>
      rows.reduce(
        (sum, row) => sum + (row.statusCounts.ready_for_review ?? 0),
        0,
      ),
    [rows],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand.blue} />
        <Text style={styles.stateText}>Loading work progress…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {readyCount > 0 ? (
        <Text style={styles.banner}>
          {readyCount} assignment{readyCount === 1 ? "" : "s"} ready for review
        </Text>
      ) : null}

      {error === "unavailable" ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            Cloud work progress is not available for this project yet.
          </Text>
        </View>
      ) : error === "network" ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>Unable to load work progress.</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => setRetryToken((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading work progress"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>No work packages yet.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => {
                if (!remoteProjectId) {
                  return;
                }
                onOpenWorkPackage?.({
                  remoteProjectId,
                  workPackageId: item.id,
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open progress for ${item.name}`}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.wpStatus}>
                  {formatWorkPackageStatusPresentation(item.workPackageStatus)}
                </Text>
              </View>
              <Text style={styles.meta}>
                {item.assignmentCount} assignment
                {item.assignmentCount === 1 ? "" : "s"}
              </Text>
              <Text style={styles.summary} numberOfLines={2}>
                {summarizeStatuses(item.statusCounts)}
              </Text>
              {(item.statusCounts.ready_for_review ?? 0) > 0 ? (
                <Text
                  style={[
                    styles.readyChip,
                    {
                      color: assignmentProgressStatusColor("ready_for_review"),
                    },
                  ]}
                >
                  Assignment · Ready for review
                </Text>
              ) : null}
              <Text style={styles.cta}>Open →</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    ...typography.caption,
    marginHorizontal: 16,
    marginBottom: 8,
    color: colors.delta,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    ...typography.bodyLarge,
    color: colors.text.secondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.brand.blue,
  },
  retryButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.surface,
    gap: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  cardName: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.text.primary,
  },
  wpStatus: {
    ...typography.caption,
    color: colors.text.muted,
  },
  meta: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  summary: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  readyChip: {
    ...typography.caption,
    marginTop: 4,
  },
  cta: {
    ...typography.button,
    marginTop: 8,
    color: colors.brand.blue,
  },
});
