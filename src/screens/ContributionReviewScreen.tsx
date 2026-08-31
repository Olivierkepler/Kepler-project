import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import {
  getPendingRemoteMeasurements,
  type RemoteMeasurement,
} from "../services/api/measurements";
import { getRemotePlanItemsForProject } from "../services/api/planItems";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getProjectMembersForProject } from "../store/projectMembers";
import { getProjectById } from "../store/projects";
import { colors, typography } from "../theme/colors";
import {
  formatSubmissionReviewStatusLabel,
  measurementReviewStatusColor,
} from "../utils/domain/statusPresentation";
import { formatMemberDisplayLabel } from "../utils/domain/memberDisplay";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "ContributionReview"
>;

function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ContributionReviewScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const { projectId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"network" | "unavailable" | null>(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [items, setItems] = useState<RemoteMeasurement[]>([]);
  const [planLabels, setPlanLabels] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [workPackageNames, setWorkPackageNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [submitterLabels, setSubmitterLabels] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setLoading(false);
        setError("unavailable");
        setItems([]);
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
              setItems([]);
            }
            return;
          }

          const mappedRemoteId = await getRemoteProjectId(ownerUid, projectId);
          if (!mappedRemoteId) {
            if (active) {
              setError("unavailable");
              setItems([]);
            }
            return;
          }

          const [pending, planItems, workPackages, members] = await Promise.all([
            getPendingRemoteMeasurements(mappedRemoteId),
            getRemotePlanItemsForProject(mappedRemoteId),
            getRemoteWorkPackagesForProject(mappedRemoteId),
            getProjectMembersForProject(ownerUid, projectId),
          ]);

          if (!active) {
            return;
          }

          const labels = new Map(
            planItems.map((item) => [item.id, item.label] as const),
          );
          const wpNames = new Map(
            workPackages.map((item) => [item.id, item.name] as const),
          );
          const submitters = new Map<string, string>();
          for (const member of members) {
            submitters.set(
              member.id,
              formatMemberDisplayLabel({ role: member.role }),
            );
          }

          setRemoteProjectId(mappedRemoteId);
          setPlanLabels(labels);
          setWorkPackageNames(wpNames);
          setSubmitterLabels(submitters);
          setItems(pending);
        } catch {
          if (active) {
            setError("network");
            setItems([]);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.blue} />
          <Text style={styles.stateText}>Loading contributions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Needs Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error === "unavailable" ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            Cloud review is not available for this project.
          </Text>
        </View>
      ) : error === "network" ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>
            Unable to load pending contributions.
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => setRetryToken((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading pending contributions"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.stateText}>No contributions need review.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const planLabel =
              planLabels.get(item.planItemId) ?? "Plan item";
            const workPackageName = item.submittedWorkPackageId
              ? workPackageNames.get(item.submittedWorkPackageId)
              : undefined;
            const submitter =
              (item.capturedByProjectMemberId
                ? submitterLabels.get(item.capturedByProjectMemberId)
                : undefined) ?? "Project member";
            const statusColor = measurementReviewStatusColor(item.reviewStatus);

            return (
              <Pressable
                style={styles.card}
                onPress={() => {
                  if (!remoteProjectId) {
                    return;
                  }
                  navigation.navigate("ContributionReviewDetail", {
                    projectId,
                    remoteProjectId,
                    measurementId: item.id,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Review ${item.label}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={[styles.statusChip, { color: statusColor }]}>
                    {formatSubmissionReviewStatusLabel(item.reviewStatus)}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {item.value.toFixed(2)} {item.unit}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {planLabel}
                </Text>
                {workPackageName ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {workPackageName}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {submitter} · {formatSubmittedAt(item.createdAt)}
                </Text>
                <Text style={styles.cta}>Review →</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  title: {
    ...typography.sectionTitle,
    flex: 1,
    textAlign: "center",
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 40,
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
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  cardLabel: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.text.primary,
  },
  statusChip: {
    ...typography.caption,
  },
  meta: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  cta: {
    ...typography.button,
    marginTop: 8,
    color: colors.brand.blue,
  },
});
