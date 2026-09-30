import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps, NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";
import type { RootStackParamList } from "../navigation/types";
import { getRemoteProjectActivity } from "../services/api/activity";
import { getRemoteProjectMembers } from "../services/api/projects";
import { listTeams } from "../services/api/teams";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { getRemotePlanItemsForProject } from "../services/api/planItems";
import { getRemoteMeasurementsForProject } from "../services/api/measurements";
import { getRemoteDeltasForProject } from "../services/api/deltas";
import { getRemoteEvidenceForProject, getRemoteEvidenceReadUrl, type RemoteEvidence } from "../services/api/evidence";
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
  activityCategoryForEventType,
  filterActivityTimeline,
  groupActivityTimeline,
  type ActivityTimelineCategory,
  type ActivityTimelineRecord,
} from "../utils/domain/activityTimeline";
import {
  formatActivityActorLabel,
  formatCloudActivitySubtitle,
  formatCloudActivityTitle,
} from "../utils/domain/activityPresentation";
import {
  buildProjectActivity,
  type ProjectActivityItem,
} from "../utils/domain/projectActivity";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectActivity">;
type CloudTimelineItem = RemoteActivityEvent & ActivityTimelineRecord;
type CloudTimelineRow =
  | { rowType: "group"; key: string; title: string }
  | { rowType: "event"; key: string; item: CloudTimelineItem; last: boolean };

const FILTER_OPTIONS: readonly { value: ActivityTimelineCategory; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "assignments", label: "Assignments" },
  { value: "measurements", label: "Measurements" },
  { value: "evidence", label: "Evidence" },
  { value: "variances", label: "Variances" },
  { value: "agent", label: "Agent" },
  { value: "project", label: "Project" },
];

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
  actorLabel,
  planItemLabel,
  measurement,
  delta,
  evidence,
  remoteProjectId,
  evidencePhotoRefreshToken,
  onPress,
}: {
  event: RemoteActivityEvent;
  workPackageName?: string;
  assignmentTargetName?: string;
  actorLabel?: string;
  planItemLabel?: string;
  measurement?: { value: number; unit: string };
  delta?: { plannedValue: number; actualValue: number; difference: number; percentDifference: number | null; unit: string };
  evidence?: RemoteEvidence;
  remoteProjectId?: string | null;
  evidencePhotoRefreshToken: number;
  onPress?: () => void;
}) {
  const title = formatCloudActivityTitle(event.type);
  const subtitle = formatCloudActivitySubtitle(event, {
    workPackageName,
    planItemLabel,
    assignmentTargetName,
  });
  const actor = event.actorType === "human"
    ? (event.type === "evidence_created" && actorLabel?.includes("@")
        ? "Project member"
        : actorLabel?.trim() || "Project member")
    : formatActivityActorLabel(event.actorType);
  const presentation = cloudEventPresentation(event, title, actor, subtitle);
  const date = new Date(event.createdAt);
  const time = Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const content = (
    <View style={styles.timelineEvent}>
      <View style={[styles.eventIcon, { backgroundColor: presentation.tint }]}>
        <Ionicons name={presentation.icon} size={16} color={presentation.color} />
      </View>
      <View style={styles.eventCopy}>
        <Text style={styles.cardTitle}>{presentation.title}</Text>
        {presentation.description ? <Text style={styles.cardLine}>{presentation.description}</Text> : null}
        {subtitle && event.type !== "evidence_created" ? <Text style={styles.cardRelationship}>{subtitle}</Text> : null}
        {event.type === "evidence_created" ? (
          <>
            <Text style={styles.cardRelationship}>
              {[
                event.related.workPackageId ? workPackageName?.trim() || "Work package" : null,
                event.related.planItemId ? planItemLabel?.trim() || "Plan item" : null,
              ].filter(Boolean).join(" · ") || "Project evidence"}
            </Text>
            {evidence?.note.trim() ? (
              <Text style={styles.evidenceNotePreview} numberOfLines={2}>
                {evidence.note.trim()}
              </Text>
            ) : null}
            {evidence?.type === "photo" && event.related.evidenceId && remoteProjectId ? (
              <EvidencePhotoThumbnail
                projectId={remoteProjectId}
                evidenceId={event.related.evidenceId}
                refreshToken={evidencePhotoRefreshToken}
              />
            ) : null}
          </>
        ) : null}
        {event.type === "measurement_submitted" && measurement ? (
          <Text style={styles.cardLine}>{measurement.value.toFixed(2)} {measurement.unit} actual</Text>
        ) : null}
        {event.type === "delta_created" && delta ? (
          <>
            <Text style={styles.cardLine}>Planned: {delta.plannedValue.toFixed(2)} {delta.unit} · Actual: {delta.actualValue.toFixed(2)} {delta.unit}</Text>
            {delta.percentDifference !== null ? <Text style={styles.varianceText}>{delta.percentDifference.toFixed(1)}%</Text> : null}
            <Text style={styles.cardLine}>{Math.abs(delta.difference).toFixed(2)} {delta.unit} {delta.difference < 0 ? "below" : "above"} plan</Text>
          </>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.text.muted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`${presentation.title}. ${subtitle ?? ""}`}>
      {content}
    </Pressable>
  ) : <View accessible accessibilityLabel={`${presentation.title}. ${subtitle ?? ""}`}>{content}</View>;
}

function cloudEventPresentation(
  event: RemoteActivityEvent,
  fallbackTitle: string,
  actor: string,
  subtitle: string | null,
): { title: string; description: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; tint: string } {
  const humanActor = event.actorType === "human" && actor === "Project member" ? "" : actor;
  const actorPrefix = event.actorType === "human" ? `${humanActor || "A project member"} ` : "";
  const titleByType: Record<string, string> = {
    assignment_created: `${actorPrefix}assigned a work package`.trim(),
    assignment_accepted: `${actorPrefix}accepted an assignment`.trim(),
    assignment_started: `${actorPrefix}started work`.trim(),
    assignment_ready_for_review: `${actorPrefix}marked work ready for review`.trim(),
    assignment_sent_back: `${actorPrefix}sent work back for changes`.trim(),
    assignment_continued: `${actorPrefix}continued work`.trim(),
    assignment_completed: `${actorPrefix}completed an assignment`.trim(),
    assignment_reopened: `${actorPrefix}reopened an assignment`.trim(),
    assignment_cancelled: `${actorPrefix}cancelled an assignment`.trim(),
    team_assignment_created: `${actorPrefix}assigned a work package to a team`.trim(),
    team_assignment_removed: `${actorPrefix}removed a team assignment`.trim(),
    measurement_submitted: `${actorPrefix}submitted a measurement`.trim(),
    measurement_accepted: `${actorPrefix}accepted a measurement`.trim(),
    measurement_rejected: `${actorPrefix}rejected a measurement`.trim(),
    delta_created: fallbackTitle,
    agent_evidence_requested: "BuildSigma requested more evidence",
    agent_completed: "BuildSigma analysis completed",
    agent_escalated: "BuildSigma needs attention",
    invitation_created: "Project invitation sent",
    invitation_accepted: "Project invitation accepted",
    member_removed: "Project member removed",
    feed_post_edited: "Project update edited",
    feed_post_deleted: "Project update removed",
    evidence_created: `${actor} added field evidence`.trim(),
  };
  const category = activityCategoryForEventType(event.type);
  const icon: React.ComponentProps<typeof Ionicons>["name"] = category === "assignments"
    ? "people-outline"
    : category === "measurements"
      ? "resize-outline"
      : category === "variances"
        ? "trending-down-outline"
        : category === "agent"
          ? "sparkles-outline"
          : category === "project"
            ? "person-outline"
            : "pulse-outline";
  const color = category === "variances" ? colors.delta : category === "agent" ? colors.brand.blue : colors.brand.navy;
  return {
    title: titleByType[event.type] ?? fallbackTitle,
    description: event.type.startsWith("feed_post_") ? "A project feed update changed." : "",
    icon,
    color,
    tint: category === "variances" ? "#FFF6E5" : category === "agent" ? "#EAF5FC" : "#EEF2F7",
  };
}

function TimelineGroupHeader({ title }: { title: string }) {
  return <Text style={styles.timelineGroupTitle}>{title}</Text>;
}

function TimelineRailRow({ time, children, last }: { time: string; children: React.ReactNode; last: boolean }) {
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineTime}>{time}</Text>
      <View style={styles.timelineRailColumn}>
        <View style={styles.timelineMarker} />
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineBody}>{children}</View>
    </View>
  );
}

function formatTimelineTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function LocalTimelineContent({ item, onPress }: { item: ProjectActivityItem; onPress?: () => void }) {
  return <LocalActivityCard item={item} onPress={onPress} />;
}

function EvidencePhotoThumbnail({
  projectId,
  evidenceId,
  refreshToken,
}: {
  projectId: string;
  evidenceId: string;
  refreshToken: number;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    void getRemoteEvidenceReadUrl(projectId, evidenceId)
      .then((result) => {
        if (active) setUri(result.readUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [evidenceId, projectId, refreshToken]);

  return (
    <View style={styles.evidencePhotoFrame}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.evidencePhoto}
          resizeMode="cover"
          onError={() => {
            setUri(null);
            setFailed(true);
          }}
          accessibilityLabel="Evidence photo"
        />
      ) : (
        <Ionicons name="camera-outline" size={20} color={colors.text.muted} />
      )}
    </View>
  );
}

type ActivityContentProps = {
  projectId: string;
  source?: "local" | "shared";
  embedded?: boolean;
};

export function ProjectActivityContent({
  projectId,
  source,
  embedded = false,
}: ActivityContentProps) {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isSharedRoute = source === "shared";

  const [mode, setMode] = useState<"loading" | "local" | "cloud">("loading");
  const [project, setProject] = useState<Project | null | undefined>(
    undefined,
  );
  const [projectTitle, setProjectTitle] = useState<string>("Project");
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);
  const [filter, setFilter] = useState<ActivityTimelineCategory>("all");
  const [query, setQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);

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
  const [actorNames, setActorNames] = useState<Map<string, string>>(() => new Map());
  const [planItemNames, setPlanItemNames] = useState<Map<string, string>>(() => new Map());
  const [measurementsById, setMeasurementsById] = useState<Map<string, { value: number; unit: string }>>(() => new Map());
  const [deltasById, setDeltasById] = useState<Map<string, { plannedValue: number; actualValue: number; difference: number; percentDifference: number | null; unit: string }>>(() => new Map());
  const [evidenceById, setEvidenceById] = useState<Map<string, RemoteEvidence>>(() => new Map());
  const [evidencePhotoRefreshToken, setEvidencePhotoRefreshToken] = useState(0);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const loadingMoreRef = useRef(false);

  const loadCloudPresentation = useCallback(async (remoteId: string) => {
    setEvidenceById(new Map());
    setEvidencePhotoRefreshToken((value) => value + 1);
    const [packagesResult, teamsResult, membersResult, planItemsResult, measurementsResult, deltasResult, evidenceResult] = await Promise.allSettled([
      getRemoteWorkPackagesForProject(remoteId),
      listTeams(remoteId),
      getRemoteProjectMembers(remoteId),
      getRemotePlanItemsForProject(remoteId),
      getRemoteMeasurementsForProject(remoteId),
      getRemoteDeltasForProject(remoteId),
      getRemoteEvidenceForProject(remoteId),
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
    setActorNames(membersResult.status === "fulfilled"
      ? new Map(membersResult.value.map((member) => [member.userId, member.displayName?.trim() || member.email?.trim() || "Project member"] as const))
      : new Map());
    setPlanItemNames(planItemsResult.status === "fulfilled"
      ? new Map(planItemsResult.value.map((item) => [item.id, item.label] as const))
      : new Map());
    setMeasurementsById(measurementsResult.status === "fulfilled"
      ? new Map(measurementsResult.value.map((item) => [item.id, { value: item.value, unit: item.unit }] as const))
      : new Map());
    setDeltasById(deltasResult.status === "fulfilled"
      ? new Map(deltasResult.value.map((item) => [item.id, {
          plannedValue: item.plannedValue,
          actualValue: item.actualValue,
          difference: item.difference,
          percentDifference: item.percentDifference,
          unit: item.unit,
      }] as const))
      : new Map());
    setEvidenceById(evidenceResult.status === "fulfilled"
      ? new Map(evidenceResult.value.map((item) => [item.id, item] as const))
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

  const cloudTimelineItems = useMemo(() => cloudItems.map((event) => {
    const workPackageName = event.related.workPackageId ? workPackageNames.get(event.related.workPackageId) : undefined;
    const teamName = event.related.teamId ? teamNames.get(event.related.teamId) : undefined;
    const memberName = event.related.projectMemberId ? memberNames.get(event.related.projectMemberId) : undefined;
    const planItemLabel = event.related.planItemId ? planItemNames.get(event.related.planItemId) : undefined;
    const measurementValue = event.related.measurementId ? measurementsById.get(event.related.measurementId) : undefined;
    const deltaValue = event.related.deltaId ? deltasById.get(event.related.deltaId) : undefined;
    const evidenceValue = event.related.evidenceId ? evidenceById.get(event.related.evidenceId) : undefined;
    const title = formatCloudActivityTitle(event.type);
    const subtitle = formatCloudActivitySubtitle(event, {
      workPackageName,
      planItemLabel,
      assignmentTargetName: teamName ?? memberName,
    });
    const actorSearchLabel = event.actorType === "human"
      ? actorNames.get(event.actorUid ?? "") ?? "Project member"
      : formatActivityActorLabel(event.actorType);
    const safeActorSearchLabel = event.type === "evidence_created" && actorSearchLabel.includes("@")
      ? "Project member"
      : actorSearchLabel;
    return {
      ...event,
      occurredAt: event.createdAt,
      category: activityCategoryForEventType(event.type),
      searchableText: [title, safeActorSearchLabel, workPackageName, teamName, memberName, planItemLabel, subtitle, evidenceValue?.note, measurementValue ? `${measurementValue.value} ${measurementValue.unit}` : "", deltaValue ? `${deltaValue.plannedValue} ${deltaValue.actualValue} ${deltaValue.difference} ${deltaValue.percentDifference ?? ""} ${deltaValue.unit}` : ""].filter(Boolean).join(" "),
    };
  }), [actorNames, cloudItems, deltasById, evidenceById, measurementsById, memberNames, planItemNames, teamNames, workPackageNames]);

  const filteredCloudItems = useMemo(() => filterActivityTimeline({ records: cloudTimelineItems, category: filter, query }), [cloudTimelineItems, filter, query]);
  const groupedCloudItems = useMemo(() => groupActivityTimeline(filteredCloudItems), [filteredCloudItems]);
  const cloudRows = useMemo<CloudTimelineRow[]>(() => groupedCloudItems.flatMap((group) => [
    { rowType: "group" as const, key: `group:${group.key}`, title: group.title },
    ...group.items.map((item, index) => ({
      rowType: "event" as const,
      key: item.id,
      item,
      last: index === group.items.length - 1,
    })),
  ]), [groupedCloudItems]);

  const localTimelineItems = useMemo(() => activity.map((item) => ({
    ...item,
    category: item.kind === "measurement" ? "measurements" as const : item.kind === "delta" ? "variances" as const : item.kind === "evidence" ? "evidence" as const : "other" as const,
    searchableText: [item.kind, "label" in item ? item.label : "", item.kind === "evidence" ? item.note : "", item.kind === "savedReport" ? item.periodLabel : ""].join(" "),
  })), [activity]);
  const filteredLocalItems = useMemo(() => filterActivityTimeline({ records: localTimelineItems, category: filter, query }), [filter, localTimelineItems, query]);
  const groupedLocalItems = useMemo(() => groupActivityTimeline(filteredLocalItems), [filteredLocalItems]);

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

  const cloudEventPress = (event: RemoteActivityEvent): (() => void) | undefined => {
    if (event.type === "evidence_created") return undefined;
    if (event.related.agentRunId && remoteProjectId) {
      const metadata = event.metadata;
      const summaryId = typeof metadata === "object" && metadata !== null && "summaryId" in metadata && typeof metadata.summaryId === "string"
        ? metadata.summaryId
        : null;
      if (summaryId) return () => navigation.navigate("AgentSummary", { projectId: remoteProjectId, summaryId });
      return () => navigation.navigate("AgentRunDetail", { projectId: remoteProjectId, agentRunId: event.related.agentRunId! });
    }
    if (event.related.planItemId && remoteProjectId) {
      return () => navigation.navigate("PlanItemDetail", {
        projectId: remoteProjectId,
        planItemId: event.related.planItemId!,
        source: "shared",
      });
    }
    return undefined;
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

  const searchAndFilter = (
    <View style={styles.searchFilterRow}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={17} color={colors.text.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search activity..."
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search activity"
        />
        {query.length > 0 ? <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear activity search"><Ionicons name="close-circle" size={17} color={colors.text.muted} /></Pressable> : null}
      </View>
      <Pressable style={[styles.filterButton, filter !== "all" && styles.filterButtonActive]} onPress={() => setFilterVisible(true)} accessibilityRole="button" accessibilityLabel={`Filter activity${filter !== "all" ? `: ${FILTER_OPTIONS.find((option) => option.value === filter)?.label}` : ""}`}>
        <Ionicons name="options-outline" size={19} color={colors.brand.navy} />
        {filter !== "all" ? <View style={styles.filterDot} /> : null}
      </Pressable>
    </View>
  );

  const filterModal = (
    <Modal visible={filterVisible} transparent animationType="fade" onRequestClose={() => setFilterVisible(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setFilterVisible(false)}>
        <Pressable style={styles.filterSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.filterSheetHeader}><Text style={styles.filterSheetTitle}>Filter activity</Text><Pressable onPress={() => setFilterVisible(false)} accessibilityRole="button" accessibilityLabel="Close filters"><Ionicons name="close" size={22} color={colors.text.primary} /></Pressable></View>
          {FILTER_OPTIONS.map((option) => (
            <Pressable key={option.value} style={styles.filterOption} onPress={() => { setFilter(option.value); setFilterVisible(false); }} accessibilityRole="button" accessibilityState={{ selected: filter === option.value }}>
              <Text style={[styles.filterOptionText, filter === option.value && styles.filterOptionTextActive]}>{option.label}</Text>
              <Ionicons name={filter === option.value ? "radio-button-on" : "radio-button-off"} size={19} color={filter === option.value ? colors.brand.navy : colors.text.muted} />
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const frame = (content: React.ReactNode) => embedded
    ? <View style={styles.embeddedFrame}>{content}</View>
    : <SafeAreaView style={styles.safeArea} edges={["top"]}>{content}</SafeAreaView>;

  if (mode === "loading" || (mode === "local" && project === undefined)) {
    return frame(<View style={styles.container}><ActivityIndicator color={colors.brand.navy} /></View>);
  }

  if (mode === "local" && !project) {
    return frame(<View style={styles.container}>{embedded ? null : <Pressable style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back"><Text style={styles.backButtonText}>←</Text></Pressable>}<Text style={styles.title}>Project not found.</Text></View>);
  }

  if (mode === "cloud") {
    return frame(<>
      <FlatList
        data={cloudRows}
        keyExtractor={(item) => item.key}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand.navy} onRefresh={() => {
          if (!remoteProjectId) return;
          setRefreshing(true);
          void loadCloudPage(remoteProjectId, null, false, true);
        }} />}
        ListHeaderComponent={<View>{embedded ? null : header}{searchAndFilter}
          {cloudLoading && cloudItems.length === 0 ? <View style={styles.centeredInline}><ActivityIndicator color={colors.brand.blue} /><Text style={styles.emptyText}>Loading activity…</Text></View> : null}
          {cloudError && cloudItems.length === 0 ? <View style={styles.centeredInline}><Text style={styles.emptyText}>{cloudError}</Text><Pressable style={styles.retryButton} onPress={() => setRetryToken((value) => value + 1)} accessibilityRole="button" accessibilityLabel="Retry"><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
          {!cloudLoading && !cloudError && cloudItems.length === 0 ? <Text style={styles.emptyText}>No activity yet.</Text> : null}
          {!cloudLoading && !cloudError && cloudItems.length > 0 && filteredCloudItems.length === 0 ? <Text style={styles.emptyText}>No matching activity.</Text> : null}
        </View>}
        renderItem={({ item }) => item.rowType === "group" ? (
          <TimelineGroupHeader title={item.title} />
        ) : (
          <TimelineRailRow time={formatTimelineTime(item.item.createdAt)} last={item.last}>
            <CloudActivityCard
              event={item.item}
              workPackageName={item.item.related.workPackageId ? workPackageNames.get(item.item.related.workPackageId) : undefined}
              assignmentTargetName={item.item.related.teamId ? teamNames.get(item.item.related.teamId) : item.item.related.projectMemberId ? memberNames.get(item.item.related.projectMemberId) : undefined}
              actorLabel={item.item.actorUid ? actorNames.get(item.item.actorUid) : undefined}
              planItemLabel={item.item.related.planItemId ? planItemNames.get(item.item.related.planItemId) : undefined}
              measurement={item.item.related.measurementId ? measurementsById.get(item.item.related.measurementId) : undefined}
              delta={item.item.related.deltaId ? deltasById.get(item.item.related.deltaId) : undefined}
              evidence={item.item.related.evidenceId ? evidenceById.get(item.item.related.evidenceId) : undefined}
              remoteProjectId={remoteProjectId}
              evidencePhotoRefreshToken={evidencePhotoRefreshToken}
              onPress={cloudEventPress(item.item)}
            />
          </TimelineRailRow>
        )}
        onEndReached={() => { if (remoteProjectId && nextCursor) void loadCloudPage(remoteProjectId, nextCursor, true, false); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={cloudLoadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.brand.blue} /> : null}
      />
      {filterModal}
    </>);
  }

  return frame(<>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {embedded ? null : header}
      {searchAndFilter}
      {activity.length === 0 ? <Text style={styles.emptyText}>No activity yet.</Text> : filteredLocalItems.length === 0 ? <Text style={styles.emptyText}>No matching activity.</Text> : groupedLocalItems.map((group) => (
        <View key={group.key}>
          <TimelineGroupHeader title={group.title} />
          {group.items.map((item, index) => (
            <TimelineRailRow key={item.id} time={formatTimelineTime(item.occurredAt)} last={index === group.items.length - 1}>
              <LocalTimelineContent item={item} onPress={item.kind === "evidence" ? undefined : () => handleActivityPress(item)} />
            </TimelineRailRow>
          ))}
        </View>
      ))}
    </ScrollView>
    {filterModal}
  </>);
}

export default function ProjectActivityScreen({ route }: Props) {
  return <ProjectActivityContent projectId={route.params.projectId} source={route.params.source} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  embeddedFrame: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    marginBottom: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.shadow.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    ...typography.title,
    color: colors.text.primary,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
  },
  topBarSpacer: {
    width: 42,
  },
  eyebrow: {
    ...typography.caption,
    color: colors.delta,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
    marginTop: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
    marginBottom: 14,
  },
  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 8,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: colors.text.primary,
    ...typography.caption,
  },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: {
    borderColor: colors.brand.navy,
    backgroundColor: "#F4F6FA",
  },
  filterDot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    top: 7,
    right: 7,
    backgroundColor: colors.brand.blue,
  },
  emptyText: {
    ...typography.caption,
    color: colors.text.muted,
    paddingVertical: 12,
  },
  centeredInline: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F4F6FA",
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    ...typography.button,
    color: colors.brand.navy,
  },
  footerLoader: {
    marginVertical: 16,
  },
  card: {
    backgroundColor: colors.surface,
    paddingVertical: 3,
  },
  cardEyebrow: {
    ...typography.caption,
    color: colors.delta,
    marginBottom: 6,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    marginTop: 1,
    flexShrink: 1,
  },
  cardLine: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 4,
    flexShrink: 1,
  },
  cardRelationship: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 4,
  },
  evidenceNotePreview: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 6,
  },
  evidencePhotoFrame: {
    width: 76,
    height: 76,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: colors.shadow.soft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  evidencePhoto: {
    width: "100%",
    height: "100%",
  },
  cardMeta: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 10,
  },
  cardCta: {
    ...typography.button,
    color: colors.delta,
    marginTop: 8,
  },
  photo: {
    marginTop: 10,
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: colors.shadow.soft,
  },
  timelineGroupTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 56,
  },
  timelineTime: {
    width: 62,
    paddingTop: 5,
    paddingRight: 7,
    textAlign: "right",
    ...typography.caption,
    color: colors.text.muted,
    fontVariant: ["tabular-nums"],
  },
  timelineRailColumn: {
    width: 18,
    alignItems: "center",
  },
  timelineMarker: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.brand.blue,
    borderWidth: 2,
    borderColor: colors.background,
    marginTop: 7,
    zIndex: 1,
  },
  timelineLine: {
    position: "absolute",
    top: 14,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 7,
    paddingBottom: 12,
  },
  timelineEvent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 3,
  },
  eventIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  varianceText: {
    ...typography.bodyMedium,
    color: colors.delta,
    marginTop: 3,
  },
  rowPressed: {
    opacity: 0.72,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16, 24, 40, 0.28)",
  },
  filterSheet: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  filterSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  filterSheetTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  filterOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterOptionText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  filterOptionTextActive: {
    color: colors.brand.navy,
    fontWeight: "600",
  },
});
