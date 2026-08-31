import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { getAgentRun, getAgentSummary } from "../services/api/agentRuns";
import { getDeltaById } from "../store/deltas";
import { getProjectById } from "../store/projects";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import type { AgentSummary } from "../types/agentSummary";
import type { Delta } from "../types/delta";
import type { Project } from "../types/project";
import { formatSummaryEvidenceRelevance } from "../utils/domain/agentRunPresentation";

import { typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "AgentSummary">;

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

function formatSignedCurrency(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (value === 0) {
    return "$0.00";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedHours(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (value === 0) {
    return "0.00 hr";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} hr`;
}

function formatSignedDays(value: number | null): string {
  if (value === null) {
    return "—";
  }

  const absolute = Math.abs(value).toFixed(2);
  const unitLabel = Math.abs(value) === 1 ? "day" : "days";

  if (value === 0) {
    return `0.00 ${unitLabel}`;
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${absolute} ${unitLabel}`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return value.toFixed(2);
}

export default function AgentSummaryScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, summaryId } = route.params;

  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!user?.uid) {
      setProject(null);
      setSummary(null);
      setLoading(false);
      return;
    }

    const net = await NetInfo.fetch();
    const online =
      net.isConnected === true && net.isInternetReachable !== false;

    if (!online) {
      setError("Agent activity requires a connection.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const ownerUid = user.uid;
      const found = await getProjectById(ownerUid, projectId);

      if (!found) {
        setProject(null);
        setSummary(null);
        return;
      }

      setProject(found);

      const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);

      if (!remoteProjectId) {
        setError("Agent summary could not be loaded.");
        return;
      }

      const loaded = await getAgentSummary(remoteProjectId, summaryId);
      setSummary(loaded);

      const agentRun = await getAgentRun(remoteProjectId, loaded.agentRunId);
      const linkedDelta = await getDeltaById(
        ownerUid,
        agentRun.deltaContext.localDeltaId,
      );
      setDelta(linkedDelta ?? null);
    } catch {
      setError("Agent summary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId, summaryId, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
    }, [loadSummary]),
  );

  if (loading && !summary) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#F4A623" />
        </View>
      </SafeAreaView>
    );
  }

  if (!project || !summary || error) {
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
            {error ?? "Agent summary not found."}
          </Text>
          {error ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadSummary()}
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

  const impact = summary.documentedImpact;
  const evidenceCount = summary.sourceRefs.evidenceIds.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>

        <Text style={styles.eyebrow}>AGENT SUMMARY</Text>
        <Text style={styles.title}>Field Variance Documentation</Text>

        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerText}>
            Agent-generated documentation. Human review required.
          </Text>
          <Text style={styles.disclaimerSubtext}>
            Review before making project, contractual, or safety decisions.
          </Text>
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Project</Text>
          <Text style={styles.metaValue}>{project.name}</Text>

          <Text style={styles.metaLabel}>Delta context</Text>
          <Text style={styles.metaValue}>
            {delta
              ? `${delta.difference > 0 ? "+" : ""}${delta.difference.toFixed(2)} ${delta.unit}`
              : "Linked delta"}
          </Text>

          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>
            {formatTimestamp(summary.createdAt)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Variance Summary</Text>
        <Text style={styles.bodyText}>{summary.varianceSummary}</Text>

        <Text style={styles.sectionTitle}>Documentation Summary</Text>
        <Text style={styles.bodyText}>{summary.documentationSummary}</Text>

        <Text style={styles.sectionTitle}>Evidence Review</Text>
        <View style={styles.detailCard}>
          <Text style={styles.detailLine}>
            Relevance:{" "}
            {formatSummaryEvidenceRelevance(
              summary.evidenceAssessment.relevance,
            )}
          </Text>
          {summary.evidenceAssessment.userVisibleRationale ? (
            <Text style={styles.detailBody}>
              {summary.evidenceAssessment.userVisibleRationale}
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Documented Impact</Text>
        <View style={styles.detailCard}>
          <Text style={styles.detailLine}>
            Planned: {formatNumber(impact.plannedValue)}
          </Text>
          <Text style={styles.detailLine}>
            Actual: {formatNumber(impact.actualValue)}
          </Text>
          <Text style={styles.detailLine}>
            Difference: {formatNumber(impact.difference)}
          </Text>
          <Text style={styles.detailLine}>
            Cost: {formatSignedCurrency(impact.costImpact)}
          </Text>
          <Text style={styles.detailLine}>
            Labor: {formatSignedHours(impact.laborImpactHours)}
          </Text>
          <Text style={styles.detailLine}>
            Schedule: {formatSignedDays(impact.scheduleImpactDays)}
          </Text>
        </View>

        {summary.recommendedHumanNextStep ? (
          <>
            <Text style={styles.sectionTitle}>Recommended Human Next Step</Text>
            <Text style={styles.bodyText}>
              {summary.recommendedHumanNextStep}
            </Text>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Evidence used</Text>
        <Text style={styles.bodyText}>
          {evidenceCount} evidence record{evidenceCount === 1 ? "" : "s"}
        </Text>

        {evidenceCount > 0 ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              navigation.navigate("ProjectEvidence", { projectId })
            }
            accessibilityRole="button"
            accessibilityLabel="View project evidence"
          >
            <Text style={styles.secondaryButtonText}>View Project Evidence</Text>
          </Pressable>
        ) : null}
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
  disclaimerCard: {
    backgroundColor: "#151C25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 16,
  },
  disclaimerText: {
    ...typography.button,
    color: "#F4A623",
    marginBottom: 4,
  },
  disclaimerSubtext: {
    ...typography.caption,
    color: "#8F9BA8",
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
  sectionTitle: {
    ...typography.bodyLarge,
    color: "#FFFFFF",
    marginTop: 8,
    marginBottom: 8,
  },
  bodyText: {
    ...typography.bodyLarge,
    color: "#D8DEE6",
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: "#151C25",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 12,
  },
  detailLine: {
    ...typography.body,
    color: "#FFFFFF",
    marginBottom: 6,
  },
  detailBody: {
    ...typography.body,
    color: "#8F9BA8",
    marginTop: 4,
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F4A623",
    marginTop: 4,
  },
  secondaryButtonText: {
    ...typography.button,
    color: "#F4A623",
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
