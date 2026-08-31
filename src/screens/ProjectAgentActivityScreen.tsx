import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import {
  getAgentRunsForProject,
} from "../services/api/agentRuns";
import { getDeltasForProject } from "../store/deltas";
import { getPlanItemsForProject } from "../store/planItems";
import { getProjectById } from "../store/projects";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import type { AgentRunSummary } from "../types/agentRun";
import type { Delta } from "../types/delta";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";
import {
  buildAgentRunPresentation,
  workflowTypeLabel,
} from "../utils/domain/agentRunPresentation";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<
  RootStackParamList,
  "ProjectAgentActivity"
>;

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function badgeStyle(badge: string) {
  switch (badge) {
    case "NEEDS EVIDENCE":
      return styles.badgeNeedsEvidence;
    case "SUMMARY READY":
      return styles.badgeSummaryReady;
    case "NEEDS ATTENTION":
      return styles.badgeFailed;
    case "ESCALATED":
      return styles.badgeEscalated;
    default:
      return styles.badgeWorking;
  }
}

function deltaContextLabel(
  run: AgentRunSummary,
  deltasById: Map<string, Delta>,
  planItemsById: Map<string, PlanItem>,
): string {
  const delta = deltasById.get(run.deltaContext.localDeltaId);

  if (!delta) {
    return "Field difference";
  }

  const planItem = planItemsById.get(delta.planItemId);
  return planItem?.label ?? "Field difference";
}

export default function ProjectAgentActivityScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const projectId = route.params.projectId;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [deltasById, setDeltasById] = useState<Map<string, Delta>>(
    new Map(),
  );
  const [planItemsById, setPlanItemsById] = useState<Map<string, PlanItem>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const loadRuns = useCallback(
    async (isRefresh = false) => {
      if (!user?.uid) {
        setProject(null);
        setRuns([]);
        setError(null);
        setLoading(false);
        return;
      }

      const net = await NetInfo.fetch();
      const online =
        net.isConnected === true && net.isInternetReachable !== false;

      if (!online) {
        setOffline(true);
        if (runs.length === 0) {
          setError("Agent activity requires a connection.");
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setOffline(false);

      if (!isRefresh) {
        setLoading(true);
      }

      setError(null);

      try {
        const ownerUid = user.uid;
        const found = await getProjectById(ownerUid, projectId);

        if (!found) {
          setProject(null);
          setRuns([]);
          return;
        }

        const [planItems, deltas] = await Promise.all([
          getPlanItemsForProject(ownerUid, projectId),
          getDeltasForProject(ownerUid, projectId),
        ]);

        setPlanItemsById(new Map(planItems.map((item) => [item.id, item])));
        setDeltasById(new Map(deltas.map((item) => [item.id, item])));

        setProject(found);

        const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);

        if (!remoteProjectId) {
          setRuns([]);
          return;
        }

        const items = await getAgentRunsForProject(remoteProjectId);
        setRuns(items);
      } catch {
        setError("Agent activity could not be loaded.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, runs.length, user?.uid],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRuns(false);
    }, [loadRuns]),
  );

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => {
      const diff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (diff !== 0) {
        return diff;
      }
      return b.id.localeCompare(a.id);
    });
  }, [runs]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadRuns(true);
  };

  if (project === undefined && loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#F4A623" />
        </View>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#F4A623"
          />
        }
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>

        <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
        <Text style={styles.title}>Agent Activity</Text>
        <Text style={styles.subtitle}>
          Autonomous field variance workflows and summaries.
        </Text>

        {offline && runs.length > 0 ? (
          <Text style={styles.offlineBanner}>
            Offline — showing last loaded agent activity.
          </Text>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadRuns(false)}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && runs.length === 0 && !error ? (
          <ActivityIndicator color="#F4A623" style={styles.loader} />
        ) : null}

        {!loading && !error && sortedRuns.length === 0 ? (
          <Text style={styles.emptyText}>
            No agent workflows have been started for this project yet.
          </Text>
        ) : null}

        {sortedRuns.map((run) => {
          const presentation = buildAgentRunPresentation(run);

          return (
            <View key={run.id} style={styles.card}>
              <Text style={styles.cardEyebrow}>
                {workflowTypeLabel(run.workflowType)}
              </Text>
              <Text style={styles.cardMeta}>
                {deltaContextLabel(run, deltasById, planItemsById)}
              </Text>

              <View style={[styles.badge, badgeStyle(presentation.badge)]}>
                <Text style={styles.badgeText}>{presentation.badge}</Text>
              </View>

              <Text style={styles.cardDescription}>
                {presentation.description}
              </Text>
              <Text style={styles.cardTime}>
                Updated {formatUpdatedAt(run.updatedAt)}
              </Text>

              {presentation.ctaType === "add_evidence" ? (
                <Pressable
                  style={styles.cardCta}
                  onPress={() =>
                    navigation.navigate("AgentRunDetail", {
                      projectId,
                      agentRunId: run.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Add evidence for agent run"
                >
                  <Text style={styles.cardCtaText}>Add Evidence</Text>
                </Pressable>
              ) : null}

              {presentation.ctaType === "review_summary" &&
              presentation.summaryId ? (
                <Pressable
                  style={styles.cardCta}
                  onPress={() =>
                    navigation.navigate("AgentSummary", {
                      projectId,
                      summaryId: presentation.summaryId as string,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Review agent summary"
                >
                  <Text style={styles.cardCtaText}>Review Summary</Text>
                </Pressable>
              ) : null}

              {presentation.ctaType === "view_run" ? (
                <Pressable
                  style={styles.cardCtaSecondary}
                  onPress={() =>
                    navigation.navigate("AgentRunDetail", {
                      projectId,
                      agentRunId: run.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="View agent run"
                >
                  <Text style={styles.cardCtaSecondaryText}>View Run</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
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
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  backButtonText: {
    ...typography.bodyMedium,
    color: "#F4A623",
  },
  eyebrow: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 8,
  },
  title: {
    ...typography.display,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: "#8F9BA8",
    marginBottom: 20,
  },
  offlineBanner: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 12,
  },
  errorCard: {
    backgroundColor: "#151C25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#F4A623",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    ...typography.button,
    color: "#111111",
  },
  loader: {
    marginTop: 24,
  },
  emptyText: {
    ...typography.bodyLarge,
    color: "#8F9BA8",
  },
  card: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
    marginBottom: 14,
  },
  cardEyebrow: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 6,
  },
  cardMeta: {
    ...typography.button,
    color: "#8F9BA8",
    marginBottom: 10,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  badgeWorking: {
    backgroundColor: "#1E2A38",
  },
  badgeNeedsEvidence: {
    backgroundColor: "#3A2A12",
  },
  badgeSummaryReady: {
    backgroundColor: "#12301F",
  },
  badgeFailed: {
    backgroundColor: "#3A1515",
  },
  badgeEscalated: {
    backgroundColor: "#2A2438",
  },
  badgeText: {
    ...typography.caption,
    color: "#FFFFFF",
  },
  cardDescription: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  cardTime: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 12,
  },
  cardCta: {
    backgroundColor: "#F4A623",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cardCtaSecondary: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F4A623",
  },
  cardCtaText: {
    ...typography.button,
    color: "#111111",
  },
  cardCtaSecondaryText: {
    ...typography.button,
    color: "#F4A623",
  },
});
