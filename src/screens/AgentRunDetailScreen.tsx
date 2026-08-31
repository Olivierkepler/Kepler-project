import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { getAgentRun } from "../services/api/agentRuns";
import { getDeltaById } from "../store/deltas";
import { getProjectById } from "../store/projects";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import type { AgentRunSummary } from "../types/agentRun";
import type { Delta } from "../types/delta";
import type { Project } from "../types/project";
import {
  buildAgentRunPresentation,
  shouldPollAgentRun,
  workflowTypeLabel,
} from "../utils/domain/agentRunPresentation";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "AgentRunDetail">;

const POLL_INTERVAL_MS = 4000;
const RESUME_POLL_DURATION_MS = 30000;

function formatTimestamp(value: string): string {
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

function stepIndicator(state: "complete" | "active" | "pending"): string {
  switch (state) {
    case "complete":
      return "●";
    case "active":
      return "◉";
    default:
      return "○";
  }
}

export default function AgentRunDetailScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, agentRunId, awaitingResume } = route.params;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [run, setRun] = useState<AgentRunSummary | null>(null);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [focused, setFocused] = useState(false);

  const resumePollUntilRef = useRef<number>(
    awaitingResume ? Date.now() + RESUME_POLL_DURATION_MS : 0,
  );

  useEffect(() => {
    if (awaitingResume) {
      resumePollUntilRef.current = Date.now() + RESUME_POLL_DURATION_MS;
    }
  }, [awaitingResume]);

  const loadRun = useCallback(
    async (isRefresh = false) => {
      if (!user?.uid) {
        setProject(null);
        setRun(null);
        setLoading(false);
        return;
      }

      const net = await NetInfo.fetch();
      const online =
        net.isConnected === true && net.isInternetReachable !== false;

      if (!online) {
        setOffline(true);
        if (!run) {
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
          setRun(null);
          return;
        }

        setProject(found);

        const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);

        if (!remoteProjectId) {
          setError("Agent activity could not be loaded.");
          return;
        }

        const loaded = await getAgentRun(remoteProjectId, agentRunId);
        setRun(loaded);

        const localDeltaId = loaded.deltaContext.localDeltaId;
        const linkedDelta = await getDeltaById(ownerUid, localDeltaId);
        setDelta(linkedDelta ?? null);
      } catch {
        setError("Agent activity could not be loaded.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [agentRunId, projectId, run, user?.uid],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void loadRun(false);

      return () => {
        setFocused(false);
      };
    }, [loadRun]),
  );

  useEffect(() => {
    if (!focused || !run) {
      return;
    }

    if (
      !shouldPollAgentRun(run) &&
      Date.now() >= resumePollUntilRef.current
    ) {
      return;
    }

    const interval = setInterval(() => {
      void loadRun(true);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [focused, loadRun, run]);

  const presentation = run ? buildAgentRunPresentation(run) : null;

  const openAddEvidence = () => {
    if (!run) {
      return;
    }

    navigation.navigate("AddEvidence", {
      projectId,
      mode: "photo",
      deltaId: run.deltaContext.localDeltaId,
      returnToAgentRunId: agentRunId,
    });
  };

  const openSummary = () => {
    if (!presentation?.summaryId) {
      return;
    }

    navigation.navigate("AgentSummary", {
      projectId,
      summaryId: presentation.summaryId,
    });
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

  if (!project || !run || !presentation) {
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
          <Text style={styles.title}>
            {error ?? "Agent run not found."}
          </Text>
          {error ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadRun(false)}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          ) : null}
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
            onRefresh={() => {
              setRefreshing(true);
              void loadRun(true);
            }}
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

        <Text style={styles.eyebrow}>{workflowTypeLabel(run.workflowType)}</Text>
        <Text style={styles.title}>Field Variance Agent Run</Text>

        {offline ? (
          <Text style={styles.offlineBanner}>
            Offline — showing last loaded run state.
          </Text>
        ) : null}

        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Project</Text>
          <Text style={styles.metaValue}>{project.name}</Text>

          <Text style={styles.metaLabel}>Delta context</Text>
          <Text style={styles.metaValue}>
            {delta
              ? `${delta.difference > 0 ? "+" : ""}${delta.difference.toFixed(2)} ${delta.unit}`
              : run.deltaContext.localDeltaId}
          </Text>

          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>{formatTimestamp(run.createdAt)}</Text>

          <Text style={styles.metaLabel}>Last updated</Text>
          <Text style={styles.metaValue}>{formatTimestamp(run.updatedAt)}</Text>
        </View>

        <View style={[styles.badge, badgeStyle(presentation.badge)]}>
          <Text style={styles.badgeText}>{presentation.badge}</Text>
        </View>
        <Text style={styles.statusDescription}>{presentation.description}</Text>

        {run.status === "waiting_for_evidence" && run.pendingRequest ? (
          <View style={styles.requestCard}>
            <Text style={styles.requestEyebrow}>EVIDENCE NEEDED</Text>
            <Text style={styles.requestMessage}>
              {run.pendingRequest.message}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={openAddEvidence}
              accessibilityRole="button"
              accessibilityLabel="Add evidence"
            >
              <Text style={styles.primaryButtonText}>Add Evidence</Text>
            </Pressable>
          </View>
        ) : null}

        {run.status === "failed" ? (
          <View style={styles.alertCard}>
            <Text style={styles.alertEyebrow}>AGENT NEEDS ATTENTION</Text>
            <Text style={styles.alertMessage}>
              The automated review could not be completed.
            </Text>
            <Text style={styles.alertHint}>
              Retry support is not available in this build.
            </Text>
          </View>
        ) : null}

        {run.status === "escalated" ? (
          <View style={styles.alertCard}>
            <Text style={styles.alertEyebrow}>ESCALATED FOR HUMAN REVIEW</Text>
            <Text style={styles.alertMessage}>
              {run.outcome?.userVisibleRationale ??
                "This workflow requires human review."}
            </Text>
          </View>
        ) : null}

        {presentation.ctaType === "review_summary" && presentation.summaryId ? (
          <Pressable
            style={styles.primaryButton}
            onPress={openSummary}
            accessibilityRole="button"
            accessibilityLabel="Review summary"
          >
            <Text style={styles.primaryButtonText}>Review Summary</Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Current workflow progress</Text>
        <Text style={styles.sectionHint}>
          Derived from the current agent run state.
        </Text>

        <View style={styles.timelineCard}>
          {presentation.progressSteps.map((step) => (
            <View key={step.label} style={styles.timelineRow}>
              <Text
                style={[
                  styles.timelineMarker,
                  step.state === "active"
                    ? styles.timelineMarkerActive
                    : step.state === "complete"
                      ? styles.timelineMarkerComplete
                      : styles.timelineMarkerPending,
                ]}
              >
                {stepIndicator(step.state)}
              </Text>
              <Text
                style={[
                  styles.timelineLabel,
                  step.state === "pending" ? styles.timelineLabelPending : null,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
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
    color: "#F4A623",
    marginBottom: 8,
  },
  title: {
    ...typography.title,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  offlineBanner: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 12,
  },
  metaCard: {
    backgroundColor: "#151C25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
    marginBottom: 16,
  },
  metaLabel: {
    ...typography.caption,
    color: "#8F9BA8",
    marginTop: 8,
  },
  metaValue: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    marginTop: 4,
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
  statusDescription: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  requestCard: {
    backgroundColor: "#3A2A12",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F4A623",
    padding: 16,
    marginBottom: 16,
  },
  requestEyebrow: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 8,
  },
  requestMessage: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginBottom: 14,
  },
  alertCard: {
    backgroundColor: "#151C25",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
    marginBottom: 16,
  },
  alertEyebrow: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 8,
  },
  alertMessage: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
  },
  alertHint: {
    ...typography.button,
    color: "#8F9BA8",
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: "#F4A623",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: "#111111",
  },
  sectionTitle: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHint: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 12,
  },
  timelineCard: {
    backgroundColor: "#151C25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 16,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  timelineMarker: {
    ...typography.bodyMedium,
    width: 24,
  },
  timelineMarkerComplete: {
    color: "#70E1A1",
  },
  timelineMarkerActive: {
    color: "#F4A623",
  },
  timelineMarkerPending: {
    color: "#4A5562",
  },
  timelineLabel: {
    ...typography.body,
    color: "#FFFFFF",
    flex: 1,
  },
  timelineLabelPending: {
    color: "#8F9BA8",
  },
  retryButton: {
    marginTop: 16,
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
});
