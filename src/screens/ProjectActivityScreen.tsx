import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getRemoteProjectActivity } from "../services/api/activity";
import { getRemoteProjectMembers } from "../services/api/projects";
import { listTeams } from "../services/api/teams";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { getDeltasForProject } from "../store/deltas";
import { getEvidenceForProject } from "../store/evidence";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemsForProject } from "../store/planItems";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getProjectById } from "../store/projects";
import { getSavedFieldReportsForProject } from "../store/savedFieldReports";
import { colors, typography } from "../theme/colors";
import type { RemoteActivityEvent } from "../types/activityEvent";
import type { Project } from "../types/project";
import {
  formatActivityActorLabel,
  formatCloudActivitySubtitle,
  formatCloudActivityTitle,
  formatRelativeActivityTime,
} from "../utils/domain/activityPresentation";
import {
  buildProjectActivity,
  countProjectActivityByFilter,
  filterProjectActivity,
  type ActivityFilter,
  type ProjectActivityItem,
} from "../utils/domain/projectActivity";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectActivity">;

const FILTER_OPTIONS: readonly {
  value: ActivityFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "measurement", label: "Measurements" },
  { value: "delta", label: "Deltas" },
  { value: "evidence", label: "Evidence" },
  { value: "savedReport", label: "Reports" },
];

function emptyMessageForFilter(filter: ActivityFilter): string {
  switch (filter) {
    case "measurement":
      return "No measurement activity recorded.";
    case "delta":
      return "No field differences recorded.";
    case "evidence":
      return "No evidence activity recorded.";
    case "savedReport":
      return "No saved report activity recorded.";
    default:
      return "No project activity recorded yet.";
  }
}

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return "$0.00";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedHours(value: number): string {
  if (value === 0) {
    return "0.00 hr";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} hr`;
}

function formatSignedDays(value: number): string {
  const absolute = Math.abs(value).toFixed(2);
  const unitLabel = Math.abs(value) === 1 ? "day" : "days";

  if (value === 0) {
    return `0.00 ${unitLabel}`;
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${absolute} ${unitLabel}`;
}

function formatSignedValue(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function formatActivityTime(value: string): string {
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

function evidenceContextLabel(
  context: "project" | "measurement" | "delta",
): string {
  switch (context) {
    case "measurement":
      return "Measurement evidence";
    case "delta":
      return "Delta evidence";
    default:
      return "Project evidence";
  }
}

function formatMeasurementRelationships(
  item: Extract<ProjectActivityItem, { kind: "measurement" }>,
): string | null {
  const parts: string[] = [];

  if (item.relatedDeltaCount > 0) {
    parts.push(
      `${item.relatedDeltaCount} field difference${item.relatedDeltaCount === 1 ? "" : "s"}`,
    );
  }

  if (item.relatedEvidenceCount > 0) {
    parts.push(`${item.relatedEvidenceCount} direct evidence`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatDeltaSourceMeasurement(
  item: Extract<ProjectActivityItem, { kind: "delta" }>,
): string | null {
  if (
    item.sourceMeasurementValue === null ||
    !item.sourceMeasurementUnit
  ) {
    return null;
  }

  return `From measurement: ${item.sourceMeasurementValue.toFixed(2)} ${item.sourceMeasurementUnit}`;
}

function formatDeltaEvidenceRelationship(
  item: Extract<ProjectActivityItem, { kind: "delta" }>,
): string | null {
  if (item.relatedEvidenceCount <= 0) {
    return null;
  }

  return `${item.relatedEvidenceCount} evidence attached`;
}

function LocalActivityCard({
  item,
  onPress,
}: {
  item: ProjectActivityItem;
  onPress?: () => void;
}) {
  const measurementRelationships =
    item.kind === "measurement"
      ? formatMeasurementRelationships(item)
      : null;
  const deltaSourceMeasurement =
    item.kind === "delta" ? formatDeltaSourceMeasurement(item) : null;
  const deltaEvidenceRelationship =
    item.kind === "delta" ? formatDeltaEvidenceRelationship(item) : null;

  const content = (
    <>
      {item.kind === "measurement" ? (
        <>
          <Text style={styles.cardEyebrow}>MEASUREMENT</Text>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardLine}>
            {item.value.toFixed(2)} {item.unit}
          </Text>
          {measurementRelationships ? (
            <Text style={styles.cardRelationship}>
              {measurementRelationships}
            </Text>
          ) : null}
        </>
      ) : null}

      {item.kind === "delta" ? (
        <>
          <Text style={styles.cardEyebrow}>FIELD DIFFERENCE</Text>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardLine}>
            Difference {formatSignedValue(item.difference, item.unit)}
          </Text>
          {deltaSourceMeasurement ? (
            <Text style={styles.cardRelationship}>{deltaSourceMeasurement}</Text>
          ) : null}
          {deltaEvidenceRelationship ? (
            <Text style={styles.cardRelationship}>
              {deltaEvidenceRelationship}
            </Text>
          ) : null}
          <Text style={styles.cardLine}>
            Cost impact {formatSignedCurrency(item.costImpact)}
          </Text>
          <Text style={styles.cardLine}>
            Labor impact {formatSignedHours(item.laborImpactHours)}
          </Text>
          <Text style={styles.cardLine}>
            Schedule impact {formatSignedDays(item.scheduleImpactDays)}
          </Text>
          <Text style={styles.cardMeta}>
            Status: {item.status.toUpperCase()}
          </Text>
        </>
      ) : null}

      {item.kind === "evidence" ? (
        <>
          <Text style={styles.cardEyebrow}>
            {item.evidenceType === "photo" ? "PHOTO EVIDENCE" : "NOTE EVIDENCE"}
          </Text>
          <Text style={styles.cardLine}>
            {evidenceContextLabel(item.context)} · {item.relatedLabel}
          </Text>
          {item.evidenceType === "note" && item.note.trim().length > 0 ? (
            <Text style={styles.cardTitle}>{item.note}</Text>
          ) : null}
          {item.evidenceType === "photo" && item.photoUri ? (
            <Image
              source={{ uri: item.photoUri }}
              style={styles.photo}
              resizeMode="cover"
            />
          ) : null}
        </>
      ) : null}

      {item.kind === "savedReport" ? (
        <>
          <Text style={styles.cardEyebrow}>SAVED REPORT</Text>
          <Text style={styles.cardTitle}>{item.periodLabel}</Text>
          <Text style={styles.cardLine}>
            {item.measurements} measurement
            {item.measurements === 1 ? "" : "s"} · {item.deltas} delta
            {item.deltas === 1 ? "" : "s"} · {item.evidence} evidence
          </Text>
          <Text style={styles.cardCta}>Open report</Text>
        </>
      ) : null}

      <Text style={styles.cardMeta}>{formatActivityTime(item.occurredAt)}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.kind} activity`}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.card}>{content}</View>;
}

function CloudActivityCard({
  event,
  workPackageName,
  assignmentTargetName,
}: {
  event: RemoteActivityEvent;
  workPackageName?: string;
  assignmentTargetName?: string;
}) {
  const title = formatCloudActivityTitle(event.type);
  const subtitle = formatCloudActivitySubtitle(event, { workPackageName, assignmentTargetName });
  const actor = formatActivityActorLabel(event.actorType);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${title}. ${subtitle ?? ""}. ${actor}`}
    >
      <Text style={styles.cardEyebrow}>ACTIVITY</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardLine}>{subtitle}</Text> : null}
      <Text style={styles.cardRelationship}>{actor}</Text>
      <Text style={styles.cardMeta}>
        {formatRelativeActivityTime(event.createdAt)}
      </Text>
    </View>
  );
}

export default function ProjectActivityScreen({
  route,
  navigation,
}: Props) {
  const { user } = useAuth();
  const projectId = route.params.projectId;
  const isSharedRoute = route.params.source === "shared";

  const [mode, setMode] = useState<"loading" | "local" | "cloud">("loading");
  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [projectTitle, setProjectTitle] = useState<string>("Project");
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const [cloudItems, setCloudItems] = useState<RemoteActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudLoadingMore, setCloudLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workPackageNames, setWorkPackageNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [teamNames, setTeamNames] = useState<Map<string, string>>(() => new Map());
  const [memberNames, setMemberNames] = useState<Map<string, string>>(() => new Map());
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const loadingMoreRef = useRef(false);

  const loadCloudPresentation = useCallback(async (remoteId: string) => {
    const [packagesResult, teamsResult, membersResult] = await Promise.allSettled([
      getRemoteWorkPackagesForProject(remoteId),
      listTeams(remoteId),
      getRemoteProjectMembers(remoteId),
    ]);
    setWorkPackageNames(packagesResult.status === "fulfilled"
      ? new Map(packagesResult.value.map((item) => [item.id, item.name] as const))
      : new Map());
    setTeamNames(teamsResult.status === "fulfilled"
      ? new Map(teamsResult.value.map((team) => [team.id, team.name] as const))
      : new Map());
    setMemberNames(membersResult.status === "fulfilled"
      ? new Map(membersResult.value.map((member) => [member.id, member.displayName?.trim() || member.email?.trim() || "Project member"] as const))
      : new Map());
  }, []);

  const loadCloudPage = useCallback(
    async (
      remoteId: string,
      cursor: string | null,
      append: boolean,
      isRefresh: boolean,
    ) => {
      if (append) {
        if (loadingMoreRef.current || !cursor) {
          return;
        }
        loadingMoreRef.current = true;
        setCloudLoadingMore(true);
      } else if (!isRefresh) {
        setCloudLoading(true);
      }
      setCloudError(null);

      try {
        const page = await getRemoteProjectActivity(remoteId, {
          limit: 30,
          cursor: cursor ?? undefined,
        });

        if (append) {
          const fresh = page.items.filter(
            (item) => !knownIdsRef.current.has(item.id),
          );
          for (const item of fresh) {
            knownIdsRef.current.add(item.id);
          }
          setCloudItems((prev) => [...prev, ...fresh]);
        } else {
          knownIdsRef.current = new Set(page.items.map((item) => item.id));
          setCloudItems(page.items);
        }
        setNextCursor(page.nextCursor);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Project activity could not be loaded.";
        if (!append) {
          setCloudError(message);
          if (!isRefresh) {
            setCloudItems([]);
            setNextCursor(null);
          }
        }
      } finally {
        setCloudLoading(false);
        setCloudLoadingMore(false);
        setRefreshing(false);
        loadingMoreRef.current = false;
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setActivity([]);
        setMode("local");
        setFilter("all");
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        setFilter("all");
        setCloudError(null);

        if (isSharedRoute) {
          if (!active) {
            return;
          }
          setMode("cloud");
          setRemoteProjectId(projectId);
          setProject(null);
          setProjectTitle("Shared project");
          setActivity([]);

          if (active) await loadCloudPresentation(projectId);

          if (active) {
            await loadCloudPage(projectId, null, false, false);
          }
          return;
        }

        const [
          foundProject,
          measurements,
          deltas,
          evidence,
          planItems,
          savedReports,
          mappedRemoteId,
        ] = await Promise.all([
          getProjectById(ownerUid, projectId),
          getMeasurementsForProject(ownerUid, projectId),
          getDeltasForProject(ownerUid, projectId),
          getEvidenceForProject(ownerUid, projectId),
          getPlanItemsForProject(ownerUid, projectId),
          getSavedFieldReportsForProject(ownerUid, projectId),
          getRemoteProjectId(ownerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        setProject(foundProject ?? null);
        setProjectTitle(foundProject?.name ?? "Project");

        if (mappedRemoteId) {
          setMode("cloud");
          setRemoteProjectId(mappedRemoteId);
          setActivity([]);

          try {
            if (active) await loadCloudPresentation(mappedRemoteId);
          } catch {
            if (active) {
              setWorkPackageNames(new Map());
              setTeamNames(new Map());
              setMemberNames(new Map());
            }
          }

          if (active) {
            await loadCloudPage(mappedRemoteId, null, false, false);
          }
          return;
        }

        setMode("local");
        setRemoteProjectId(null);
        setCloudItems([]);
        setNextCursor(null);
        setActivity(
          buildProjectActivity({
            projectId,
            measurements,
            deltas,
            evidence,
            planItems,
            savedReports,
          }),
        );
      }

      void load();

      return () => {
        active = false;
      };
    }, [projectId, user?.uid, isSharedRoute, loadCloudPage, loadCloudPresentation, retryToken]),
  );

  const activityCounts = useMemo(
    () => countProjectActivityByFilter(activity),
    [activity],
  );

  const filteredActivity = useMemo(
    () => filterProjectActivity(activity, filter),
    [activity, filter],
  );

  const handleActivityPress = (item: ProjectActivityItem) => {
    if (item.kind === "measurement") {
      navigation.navigate("MeasurementDetail", {
        measurementId: item.measurementId,
      });
      return;
    }

    if (item.kind === "delta") {
      navigation.navigate("DeltaDetail", { deltaId: item.deltaId });
      return;
    }

    if (item.kind === "savedReport") {
      navigation.navigate("FieldReportPreview", {
        projectId,
        savedReportId: item.savedReportId,
      });
    }
  };

  const header = (
    <>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Project Activity</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <Text style={styles.eyebrow}>PROJECT ACTIVITY</Text>
      <Text style={styles.title}>{projectTitle}</Text>
      <Text style={styles.subtitle}>
        {mode === "cloud"
          ? "Collaboration events for this project."
          : "Everything documented on this project."}
      </Text>
    </>
  );

  if (mode === "loading" || (mode === "local" && project === undefined)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (mode === "local" && !project) {
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

  if (mode === "cloud") {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <FlatList
          data={cloudItems}
          keyExtractor={(item) => item.id}
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#FFFFFF"
              onRefresh={() => {
                if (!remoteProjectId) {
                  return;
                }
                setRefreshing(true);
                void loadCloudPage(remoteProjectId, null, false, true);
              }}
            />
          }
          ListHeaderComponent={
            <View>
              {header}
              {cloudLoading && cloudItems.length === 0 ? (
                <View style={styles.centeredInline}>
                  <ActivityIndicator color={colors.brand.blue} />
                  <Text style={styles.emptyText}>Loading activity…</Text>
                </View>
              ) : null}
              {cloudError && cloudItems.length === 0 ? (
                <View style={styles.centeredInline}>
                  <Text style={styles.emptyText}>{cloudError}</Text>
                  <Pressable
                    style={styles.retryButton}
                    onPress={() => setRetryToken((value) => value + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Retry"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              {!cloudLoading && !cloudError && cloudItems.length === 0 ? (
                <Text style={styles.emptyText}>
                  No project activity recorded yet.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <CloudActivityCard
              event={item}
              workPackageName={
                item.related.workPackageId
                  ? workPackageNames.get(item.related.workPackageId)
                  : undefined
              }
              assignmentTargetName={
                item.related.teamId
                  ? teamNames.get(item.related.teamId)
                  : item.related.projectMemberId
                    ? memberNames.get(item.related.projectMemberId)
                    : undefined
              }
            />
          )}
          onEndReached={() => {
            if (remoteProjectId && nextCursor) {
              void loadCloudPage(remoteProjectId, nextCursor, true, false);
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            cloudLoadingMore ? (
              <ActivityIndicator
                style={styles.footerLoader}
                color={colors.brand.blue}
              />
            ) : null
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTER_OPTIONS.map(({ value, label }) => {
            const selected = filter === value;
            const count = activityCounts[value];

            return (
              <Pressable
                key={value}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setFilter(value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${label} ${count}`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selected && styles.filterChipTextActive,
                  ]}
                >
                  {label} {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activity.length === 0 ? (
          <Text style={styles.emptyText}>
            No project activity recorded yet.
          </Text>
        ) : filteredActivity.length === 0 ? (
          <Text style={styles.emptyText}>{emptyMessageForFilter(filter)}</Text>
        ) : (
          filteredActivity.map((item) => (
            <LocalActivityCard
              key={item.id}
              item={item}
              onPress={
                item.kind === "evidence"
                  ? undefined
                  : () => handleActivityPress(item)
              }
            />
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
    paddingBottom: 48,
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
    ...typography.title,
    color: "#FFFFFF",
  },
  topBarTitle: {
    ...typography.bodyMedium,
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
    marginBottom: 14,
  },
  filterScroll: {
    marginHorizontal: -20,
    marginBottom: 18,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChipActive: {
    borderColor: "#F4A623",
    backgroundColor: "#1A1510",
  },
  filterChipText: {
    ...typography.caption,
    color: "#8F9BA8",
  },
  filterChipTextActive: {
    color: "#F4A623",
  },
  emptyText: {
    ...typography.caption,
    color: "#7F8A98",
  },
  centeredInline: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
  },
  retryText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  footerLoader: {
    marginVertical: 16,
  },
  card: {
    backgroundColor: "#151C25",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27313D",
    padding: 14,
    marginBottom: 10,
  },
  cardEyebrow: {
    ...typography.caption,
    color: "#F4A623",
    marginBottom: 6,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    marginTop: 4,
    flexShrink: 1,
  },
  cardLine: {
    ...typography.caption,
    color: "#D0D7E0",
    marginTop: 6,
    flexShrink: 1,
  },
  cardRelationship: {
    ...typography.caption,
    color: "#8F9BA8",
    marginTop: 6,
  },
  cardMeta: {
    ...typography.caption,
    color: "#748093",
    marginTop: 10,
  },
  cardCta: {
    ...typography.button,
    color: "#F4A623",
    marginTop: 8,
  },
  photo: {
    marginTop: 10,
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: "#0B1017",
  },
});
