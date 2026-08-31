import React, { useCallback, useState } from "react";
import {
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
import Ionicons from "@expo/vector-icons/Ionicons";

import { useAuth } from "../auth/AuthProvider";
import SharePlanItemSheet, {
  type SharePlanItemDestination,
} from "../components/chat/SharePlanItemSheet";
import PlanItemProvenanceSheet from "../components/plan/PlanItemProvenanceSheet";
import OrganizeWorkModal from "../components/project/OrganizeWorkModal";
import type { RootStackParamList } from "../navigation/types";
import {
  ensureDirectConversation,
  ensureProjectConversation,
} from "../services/api/conversations";
import {
  getRemotePlanItemProvenance,
  type PlanItemProvenance,
} from "../services/api/planItems";
import {
  loadSharedProjectSnapshot,
} from "../services/api/sharedProjects";
import { getRemoteProjectMembers } from "../services/api/projects";
import { getRemoteWorkPackageAssignmentsForProject } from "../services/api/workPackageAssignments";
import { getRemoteWorkPackagesForProject } from "../services/api/workPackages";
import { ensureRemotePlanItem } from "../services/sync/planItemBootstrap";
import { getAgentRunsForProject } from "../services/api/agentRuns";
import { getDeltasForProject } from "../store/deltas";
import { getEvidenceForProject } from "../store/evidence";
import { getMeasurementsForProject } from "../store/measurements";
import { getPlanItemById, getPlanItemsForProject } from "../store/planItems";
import { getRemotePlanItemId } from "../store/planItemCloudMappings";
import { getProjectMembersForProject } from "../store/projectMembers";
import { getRemoteProjectId } from "../store/projectCloudMappings";
import { getProjectById } from "../store/projects";
import { getWorkPackageAssignmentsForProject } from "../store/workPackageAssignments";
import { getWorkPackagesForProject } from "../store/workPackages";
import type { AgentRunSummary } from "../types/agentRun";
import type { Delta } from "../types/delta";
import type { Evidence } from "../types/evidence";
import type { Measurement } from "../types/measurement";
import type { PlanItem } from "../types/plan";
import type { Project } from "../types/project";
import type { ProjectMember } from "../types/projectMember";
import type { WorkPackage } from "../types/workPackage";
import type { WorkPackageAssignment } from "../types/workPackageAssignment";
import { buildAgentRunPresentation } from "../utils/domain/agentRunPresentation";
import { buildPlanItemAssignmentMaps } from "../utils/domain/planItemAssignmentContext";
import { formatAssignmentProgressStatusLabel } from "../utils/assignmentProgress";
import {
  canMeasureAgainstPlanItem,
  formatPlanItemTypeLabel,
  getEvidenceRelatedToPlanItem,
  getLatestAgentRunForPlanItem,
  getLatestDeltaForPlanItem,
  getLatestMeasurementForPlanItem,
} from "../utils/domain/planItemFieldContext";
import { fetchMemberPresentationContext } from "../utils/domain/memberPresentationContext";
import type { MemberPresentationContext } from "../utils/domain/memberDisplay";
import { formatProvenanceDate } from "../utils/planItemProvenance";

import { colors, typography } from "../theme/colors";
type Props = NativeStackScreenProps<RootStackParamList, "PlanItemDetail">;

function mergeLocalAndCloudMembers(
  localMembers: ProjectMember[],
  cloudMembers: ProjectMember[],
): ProjectMember[] {
  const byId = new Map<string, ProjectMember>();

  for (const member of localMembers) {
    byId.set(member.id, member);
  }

  for (const member of cloudMembers) {
    // Cloud ProjectMember.id is canonical for collaboration assignments.
    byId.set(member.id, member);
  }

  return [...byId.values()];
}

function extractUserIdFromProjectMemberId(
  projectId: string,
  projectMemberId: string,
): string {
  const prefix = `${projectId}_`;
  if (projectMemberId.startsWith(prefix)) {
    return projectMemberId.slice(prefix.length);
  }
  return projectMemberId;
}

function syntheticMembersFromAssignments(
  projectId: string,
  assignments: readonly WorkPackageAssignment[],
): ProjectMember[] {
  const now = new Date().toISOString();
  const byId = new Map<string, ProjectMember>();

  for (const assignment of assignments) {
    if (byId.has(assignment.projectMemberId)) {
      continue;
    }
    const userId = extractUserIdFromProjectMemberId(
      projectId,
      assignment.projectMemberId,
    );
    byId.set(assignment.projectMemberId, {
      id: assignment.projectMemberId,
      projectId,
      userId,
      role: "field_member",
      status: "active",
      invitedBy: "",
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...byId.values()];
}

function formatQuantity(value: number, unit: string): string {
  if (unit === "ea") {
    return `${value} ${unit}`;
  }
  return `${value.toFixed(2)} ${unit}`;
}

function formatSignedQuantity(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function MetaRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={last ? styles.metaRowLast : styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function PlanItemDetailScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, planItemId } = route.params;
  const isShared = route.params.source === "shared";

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [planItem, setPlanItem] = useState<PlanItem | null>(null);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
  const [remotePlanItemId, setRemotePlanItemId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [allPlanItems, setAllPlanItems] = useState<PlanItem[]>([]);
  const [latestMeasurement, setLatestMeasurement] =
    useState<Measurement | null>(null);
  const [latestDelta, setLatestDelta] = useState<Delta | null>(null);
  const [relatedEvidence, setRelatedEvidence] = useState<Evidence[]>([]);
  const [latestAgentRun, setLatestAgentRun] =
    useState<AgentRunSummary | null>(null);
  const [agentNote, setAgentNote] = useState<string | null>(null);
  const [provenanceSheetVisible, setProvenanceSheetVisible] = useState(false);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<PlanItemProvenance | null>(null);
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [assignments, setAssignments] = useState<WorkPackageAssignment[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [presentationContext, setPresentationContext] =
    useState<MemberPresentationContext>({});

  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) {
        setProject(null);
        setPlanItem(null);
        setLatestMeasurement(null);
        setLatestDelta(null);
        setRelatedEvidence([]);
        setLatestAgentRun(null);
        setAgentNote(null);
        return;
      }

      const ownerUid = user.uid;
      let active = true;

      async function load() {
        if (isShared) {
          try {
            const snapshot = await loadSharedProjectSnapshot(projectId);
            if (!active) {
              return;
            }

            const foundPlanItem =
              snapshot.planItems.find((item) => item.id === planItemId) ?? null;

            if (!foundPlanItem) {
              setProject(snapshot.project);
              setPlanItem(null);
              setRemoteProjectId(projectId);
              setRemotePlanItemId(null);
              setLatestMeasurement(null);
              setLatestDelta(null);
              setRelatedEvidence([]);
              setWorkPackages([]);
              setAssignments([]);
              setMembers([]);
              setAllPlanItems([]);
              return;
            }

            const [remotePackages, remoteAssignments] = await Promise.all([
              getRemoteWorkPackagesForProject(projectId).catch(() => []),
              getRemoteWorkPackageAssignmentsForProject(projectId).catch(
                () => [],
              ),
            ]);

            if (!active) {
              return;
            }

            const packageItems: WorkPackage[] = remotePackages;
            const assignmentItems: WorkPackageAssignment[] = remoteAssignments;
            const memberItems = syntheticMembersFromAssignments(
              projectId,
              assignmentItems,
            );

            let nextPresentation: MemberPresentationContext = {};
            try {
              nextPresentation = await fetchMemberPresentationContext({
                projectId,
                projectMemberIds: assignmentItems.map(
                  (item) => item.projectMemberId,
                ),
                members: memberItems,
              });
            } catch {
              nextPresentation = {};
            }

            if (!active) {
              return;
            }

            setProject(snapshot.project);
            setPlanItem(foundPlanItem);
            setRemoteProjectId(projectId);
            setRemotePlanItemId(planItemId);
            setAllPlanItems(snapshot.planItems);
            setWorkPackages(packageItems);
            setAssignments(assignmentItems);
            setMembers(memberItems);
            setPresentationContext(nextPresentation);
            setLatestMeasurement(
              getLatestMeasurementForPlanItem(
                snapshot.measurements,
                planItemId,
              ),
            );
            setLatestDelta(
              getLatestDeltaForPlanItem(snapshot.deltas, planItemId),
            );
            setRelatedEvidence(
              getEvidenceRelatedToPlanItem(
                snapshot.evidence,
                snapshot.measurements,
                snapshot.deltas,
                planItemId,
              ),
            );

            try {
              const agentRuns = await getAgentRunsForProject(projectId);
              if (active) {
                setLatestAgentRun(
                  getLatestAgentRunForPlanItem(
                    agentRuns,
                    snapshot.deltas,
                    planItemId,
                  ),
                );
                setAgentNote(null);
              }
            } catch {
              if (active) {
                setLatestAgentRun(null);
                setAgentNote(null);
              }
            }
          } catch {
            if (active) {
              setProject(null);
              setPlanItem(null);
            }
          }
          return;
        }

        const [
          foundProject,
          foundPlanItem,
          projectPlanItems,
          measurements,
          deltas,
          evidence,
          packageItems,
          assignmentItems,
          memberItems,
        ] = await Promise.all([
          getProjectById(ownerUid, projectId),
          getPlanItemById(ownerUid, planItemId),
          getPlanItemsForProject(ownerUid, projectId),
          getMeasurementsForProject(ownerUid, projectId),
          getDeltasForProject(ownerUid, projectId),
          getEvidenceForProject(ownerUid, projectId),
          getWorkPackagesForProject(ownerUid, projectId),
          getWorkPackageAssignmentsForProject(ownerUid, projectId),
          getProjectMembersForProject(ownerUid, projectId),
        ]);

        if (!active) {
          return;
        }

        if (
          !foundProject ||
          !foundPlanItem ||
          foundPlanItem.projectId !== projectId
        ) {
          setProject(foundProject ?? null);
          setPlanItem(null);
          setLatestMeasurement(null);
          setLatestDelta(null);
          setRelatedEvidence([]);
          setLatestAgentRun(null);
          setAgentNote(null);
          return;
        }

        setProject(foundProject);
        setPlanItem(foundPlanItem);
        const mappedRemoteProjectId = await getRemoteProjectId(ownerUid, projectId);
        const mappedRemotePlanItemId =
          (await getRemotePlanItemId(ownerUid, projectId, planItemId)) ?? null;
        if (active) {
          setRemoteProjectId(mappedRemoteProjectId ?? null);
          setRemotePlanItemId(mappedRemotePlanItemId);
        }

        let mergedMembers = memberItems;
        if (mappedRemoteProjectId) {
          try {
            const remoteMembers = await getRemoteProjectMembers(
              mappedRemoteProjectId,
            );
            mergedMembers = mergeLocalAndCloudMembers(
              memberItems,
              remoteMembers.map((member) => ({
                id: member.id,
                projectId,
                userId: member.userId,
                role: member.role,
                status: member.status,
                invitedBy: member.invitedBy,
                createdAt: member.createdAt,
                updatedAt: member.updatedAt,
              })),
            );
          } catch {
            mergedMembers = memberItems;
          }
        }

        if (!active) {
          return;
        }

        setAllPlanItems(projectPlanItems);
        setWorkPackages(packageItems);
        setAssignments(assignmentItems);
        setMembers(mergedMembers);
        setLatestMeasurement(
          getLatestMeasurementForPlanItem(measurements, planItemId),
        );
        setLatestDelta(getLatestDeltaForPlanItem(deltas, planItemId));
        setRelatedEvidence(
          getEvidenceRelatedToPlanItem(
            evidence,
            measurements,
            deltas,
            planItemId,
          ),
        );

        try {
          const presentation = await fetchMemberPresentationContext({
            members: mergedMembers,
            projectId: mappedRemoteProjectId ?? undefined,
            projectMemberIds: assignmentItems.map(
              (item) => item.projectMemberId,
            ),
          });
          if (active) {
            setPresentationContext(presentation);
          }
        } catch {
          if (active) {
            setPresentationContext({});
          }
        }

        const net = await NetInfo.fetch();
        const online =
          net.isConnected === true && net.isInternetReachable !== false;

        if (!online) {
          setLatestAgentRun(null);
          setAgentNote("Agent status requires a connection.");
          return;
        }

        try {
          const remoteProjectId = await getRemoteProjectId(ownerUid, projectId);
          if (!remoteProjectId) {
            setLatestAgentRun(null);
            setAgentNote(
              "Connect this project to cloud to load agent status.",
            );
            return;
          }

          const runs = await getAgentRunsForProject(remoteProjectId);
          if (!active) {
            return;
          }

          setLatestAgentRun(
            getLatestAgentRunForPlanItem(runs, deltas, planItemId),
          );
          setAgentNote(null);
        } catch {
          if (!active) {
            return;
          }
          setLatestAgentRun(null);
          setAgentNote("Agent status could not be loaded.");
        }
      }

      void load();

      return () => {
        active = false;
      };
    }, [isShared, planItemId, projectId, user?.uid]),
  );

  const loadProvenance = useCallback(async () => {
    if (!user?.uid || !planItem) {
      return;
    }

    setProvenanceLoading(true);
    setProvenanceError(null);

    try {
      // Manual items: local-only answer without a network round-trip.
      if (planItem.origin !== "plan_import") {
        setProvenance({
          origin: "manual",
          planItemId: planItem.id,
        });
        return;
      }

      const remoteProjectId = await getRemoteProjectId(user.uid, projectId);
      const remotePlanItemId = await getRemotePlanItemId(
        user.uid,
        projectId,
        planItem.id,
      );

      if (!remoteProjectId || !remotePlanItemId) {
        setProvenanceError(
          "This imported item is not linked to cloud provenance yet.",
        );
        setProvenance(null);
        return;
      }

      const result = await getRemotePlanItemProvenance(
        remoteProjectId,
        remotePlanItemId,
      );
      setProvenance(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Source details unavailable.";
      setProvenanceError(message);
      setProvenance(null);
    } finally {
      setProvenanceLoading(false);
    }
  }, [user?.uid, planItem, projectId]);

  const openProvenance = useCallback(() => {
    setProvenanceSheetVisible(true);
    void loadProvenance();
  }, [loadProvenance]);

  const reloadAssignmentContext = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    const ownerUid = user.uid;
    const [packageItems, assignmentItems, memberItems] = await Promise.all([
      getWorkPackagesForProject(ownerUid, projectId),
      getWorkPackageAssignmentsForProject(ownerUid, projectId),
      getProjectMembersForProject(ownerUid, projectId),
    ]);

    setWorkPackages(packageItems);
    setAssignments(assignmentItems);
    setMembers(memberItems);
  }, [projectId, user?.uid]);


  const handleShareDestination = async (destination: SharePlanItemDestination) => {
    if (!user?.uid || !planItem || sharing) {
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      let resolvedRemoteProjectId = remoteProjectId;
      let resolvedRemotePlanItemId = remotePlanItemId;

      if (!isShared) {
        resolvedRemotePlanItemId =
          (await ensureRemotePlanItem(user.uid, projectId, planItem.id)) ?? null;
        resolvedRemoteProjectId =
          (await getRemoteProjectId(user.uid, projectId)) ?? null;
        setRemoteProjectId(resolvedRemoteProjectId);
        setRemotePlanItemId(resolvedRemotePlanItemId);
      }

      if (!resolvedRemoteProjectId || !resolvedRemotePlanItemId) {
        setShareError(
          "Cloud sync is required before this Plan Item can be shared in chat.",
        );
        return;
      }

      const conversation =
        destination.kind === "project_chat"
          ? await ensureProjectConversation(resolvedRemoteProjectId)
          : await ensureDirectConversation(
              resolvedRemoteProjectId,
              destination.projectMemberId,
            );

      setShareSheetVisible(false);
      navigation.navigate("ProjectChat", {
        remoteProjectId: resolvedRemoteProjectId,
        conversationId: conversation.id,
        titleHint:
          destination.kind === "project_chat"
            ? project?.name
            : destination.titleHint,
        subtitleHint:
          destination.kind === "project_chat"
            ? "Project Chat"
            : destination.subtitleHint,
        pendingPlanItemId: resolvedRemotePlanItemId,
        pendingPlanItemLabel: planItem.label,
        pendingDraftText: "Please verify this item.",
      });
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Unable to share Plan Item.",
      );
    } finally {
      setSharing(false);
    }
  };

  if (project === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container} />
      </SafeAreaView>
    );
  }

  if (!project || !planItem) {
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
          <Text style={styles.title}>Plan item not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const measurable = canMeasureAgainstPlanItem(planItem);
  const agentPresentation = latestAgentRun
    ? buildAgentRunPresentation(latestAgentRun)
    : null;

  const assignmentMeta = buildPlanItemAssignmentMaps(
    [planItem.id],
    workPackages,
    assignments,
    members,
    projectId,
    presentationContext,
  ).byPlanItemId.get(planItem.id);

  const hasAssignment = assignmentMeta?.hasActiveAssignment ?? false;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
        <Text style={styles.topBarTitle}>Plan Item</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      {isShared ? (
        <Text style={styles.sharedBanner}>Shared project · Read only</Text>
      ) : null}
        <Text style={styles.eyebrow}>{project.name}</Text>
        <Text style={styles.title}>{planItem.label}</Text>
        <Text style={styles.typeBadge}>
          {formatPlanItemTypeLabel(planItem.type)}
        </Text>

        <Section title="PLAN">
          <MetaRow
            label="Planned quantity"
            value={formatQuantity(planItem.plannedValue, planItem.unit)}
          />
          <MetaRow label="Unit" value={planItem.unit} />
          <MetaRow
            label="Unit cost"
            value={formatCurrency(planItem.unitCost)}
          />
          <MetaRow
            label="Production rate / day"
            value={`${planItem.productionRatePerDay}`}
          />
          <MetaRow
            label="Labor hours / unit"
            value={`${planItem.laborHoursPerUnit}`}
            last
          />
        </Section>

        <Section title="SOURCE">
          {planItem.origin === "plan_import" ? (
            <Text style={styles.emptyText}>
              Imported from project documents
            </Text>
          ) : (
            <Text style={styles.emptyText}>Created manually</Text>
          )}
          {!isShared ? (
            <Pressable
              style={styles.linkButton}
              onPress={openProvenance}
              accessibilityRole="button"
              accessibilityLabel={`View source for ${planItem.label}`}
            >
              <Text style={styles.linkButtonText}>
                {planItem.origin === "plan_import"
                  ? "View provenance →"
                  : "View source →"}
              </Text>
            </Pressable>
          ) : null}
        </Section>

        <Section title="ASSIGNMENT">
          {hasAssignment && assignmentMeta ? (
            <>
              <MetaRow
                label="Work package"
                value={assignmentMeta.workPackageName ?? "—"}
              />
              <MetaRow
                label="Assigned to"
                value={assignmentMeta.assigneeLabel ?? "Unassigned"}
              />
              <MetaRow
                label="Assignment status"
                value={
                  assignmentMeta.assignmentStatus
                    ? formatAssignmentProgressStatusLabel(
                        assignmentMeta.assignmentStatus,
                      )
                    : "Unassigned"
                }
                last
              />
              {!isShared ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => setOrganizeOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Change assignment"
                >
                  <Text style={styles.linkButtonText}>Change assignment</Text>
                </Pressable>
              ) : null}
            </>
          ) : assignmentMeta?.workPackageName ? (
            <>
              <MetaRow
                label="Work package"
                value={assignmentMeta.workPackageName}
              />
              <Text style={styles.emptyText}>
                No member assigned to this work package yet.
              </Text>
              {!isShared ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => setOrganizeOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Change assignment"
                >
                  <Text style={styles.linkButtonText}>Change assignment</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.emptyText}>Not assigned</Text>
              {!isShared ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => setOrganizeOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Organize work"
                >
                  <Text style={styles.linkButtonText}>Organize work</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </Section>

        <Section title="FIELD">
          {latestMeasurement ? (
            <>
              <MetaRow
                label="Latest measurement"
                value={formatQuantity(
                  latestMeasurement.value,
                  latestMeasurement.unit,
                )}
              />
              <MetaRow
                label="Recorded"
                value={formatDateTime(latestMeasurement.createdAt)}
                last={isShared}
              />
              {!isShared ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() =>
                    navigation.navigate("MeasurementDetail", {
                      measurementId: latestMeasurement.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Open measurement detail"
                >
                  <Text style={styles.linkButtonText}>View measurement →</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>No field measurement yet</Text>
          )}
        </Section>

        <Section title="VARIANCE">
          {latestDelta ? (
            <>
              <MetaRow
                label="Difference"
                value={formatSignedQuantity(
                  latestDelta.difference,
                  latestDelta.unit,
                )}
              />
              <MetaRow
                label="Status"
                value={latestDelta.status.toUpperCase()}
              />
              <MetaRow
                label="Recorded"
                value={formatDateTime(latestDelta.createdAt)}
              />
              <Pressable
                style={styles.linkButton}
                onPress={() =>
                  navigation.navigate("DeltaDetail", {
                    deltaId: latestDelta.id,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Open delta detail"
              >
                <Text style={styles.linkButtonText}>View delta →</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.emptyText}>No delta recorded</Text>
          )}
        </Section>

        <Section title="EVIDENCE">
          {relatedEvidence.length === 0 ? (
            <Text style={styles.emptyText}>
              No related evidence linked through measurement or delta.
            </Text>
          ) : (
            <>
              <Text style={styles.emptyText}>
                {relatedEvidence.length} related evidence record
                {relatedEvidence.length === 1 ? "" : "s"}
              </Text>
              <Pressable
                style={styles.linkButton}
                onPress={() =>
                  navigation.navigate("ProjectEvidence", { projectId })
                }
                accessibilityRole="button"
                accessibilityLabel="Open project evidence"
              >
                <Text style={styles.linkButtonText}>
                  View project evidence →
                </Text>
              </Pressable>
            </>
          )}
        </Section>

        <Section title="AGENT">
          {latestAgentRun && agentPresentation ? (
            <>
              <MetaRow label="Status" value={agentPresentation.badge} />
              <Text style={styles.agentDescription}>
                {agentPresentation.description}
              </Text>
              {latestAgentRun.status === "waiting_for_evidence" &&
              latestAgentRun.pendingRequest ? (
                <View style={styles.evidenceRequestCard}>
                  <Text style={styles.evidenceRequestEyebrow}>
                    EVIDENCE REQUESTED
                  </Text>
                  <Text style={styles.evidenceRequestMessage}>
                    {latestAgentRun.pendingRequest.message}
                  </Text>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() =>
                      navigation.navigate("AddEvidence", {
                        projectId: isShared
                          ? remoteProjectId ?? projectId
                          : projectId,
                        mode: "photo",
                        deltaId: latestAgentRun.deltaContext.localDeltaId,
                        returnToAgentRunId: isShared
                          ? undefined
                          : latestAgentRun.id,
                        source: isShared ? "shared" : "local",
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Capture evidence"
                  >
                    <Text style={styles.primaryButtonText}>
                      Capture evidence
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {!isShared ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() =>
                    navigation.navigate("AgentRunDetail", {
                      projectId,
                      agentRunId: latestAgentRun.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Open agent run detail"
                >
                  <Text style={styles.linkButtonText}>View agent run →</Text>
                </Pressable>
              ) : null}
              {agentPresentation.summaryId ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() =>
                    navigation.navigate("AgentSummary", {
                      projectId,
                      summaryId: agentPresentation.summaryId!,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Open agent summary"
                >
                  <Text style={styles.linkButtonText}>
                    View agent summary →
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>
              {agentNote ?? "No related agent activity for this plan item."}
            </Text>
          )}
        </Section>

        <Text style={styles.actionsTitle}>ACTIONS</Text>

        {measurable && !isShared ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              navigation.navigate("Measurement", {
                projectId,
                planItemId: planItem.id,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Measure against this plan item"
          >
            <Text style={styles.primaryButtonText}>
              Measure against this item
            </Text>
          </Pressable>
        ) : !isShared ? (
          <View style={styles.disabledActionCard}>
            <Text style={styles.disabledActionTitle}>
              Measurement not available for this item type
            </Text>
            <Text style={styles.disabledActionBody}>
              Field measurement currently supports length plan items in feet.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.secondaryButton, styles.shareButton]}
          onPress={() => {
            setShareError(null);
            setShareSheetVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Share plan item"
        >
          <Ionicons name="share-outline" size={18} color={colors.brand.navy} />
          <Text style={styles.shareButtonText}>Share</Text>
        </Pressable>

        {shareError ? (
          <Text style={styles.shareErrorText}>{shareError}</Text>
        ) : null}

        {!isShared ? (
        <Pressable
          style={styles.secondaryButton}
          onPress={() =>
            navigation.navigate("EditPlanItem", {
              projectId,
              planItemId: planItem.id,
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Edit plan item"
        >
          <Text style={styles.secondaryButtonText}>Edit plan item</Text>
        </Pressable>
        ) : null}
      </ScrollView>

      <PlanItemProvenanceSheet
        visible={provenanceSheetVisible}
        loading={provenanceLoading}
        errorMessage={provenanceError}
        provenance={provenance}
        planItemLabel={planItem.label}
        onClose={() => setProvenanceSheetVisible(false)}
        onRetry={() => {
          void loadProvenance();
        }}
      />

      <SharePlanItemSheet
        visible={shareSheetVisible}
        remoteProjectId={remoteProjectId}
        projectName={project.name}
        planItemLabel={planItem.label}
        onClose={() => setShareSheetVisible(false)}
        onSelect={(destination) => {
          void handleShareDestination(destination);
        }}
      />

      {user?.uid && !isShared ? (
        <OrganizeWorkModal
          visible={organizeOpen}
          projectId={projectId}
          ownerUid={user.uid}
          canMutate
          planItems={allPlanItems.length > 0 ? allPlanItems : [planItem]}
          initialWorkPackageId={assignmentMeta?.workPackageId ?? null}
          highlightPlanItemId={planItem.id}
          onClose={() => setOrganizeOpen(false)}
          onUpdated={() => {
            void reloadAssignmentContext();
          }}
        />
      ) : null}
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
    paddingBottom: 50,
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
  sharedBanner: {
    ...typography.caption,
    color: "#98A2B3",
    marginBottom: 10,
  },
  topBarPlaceholder: {
    width: 42,
  },
  eyebrow: {
    ...typography.button,
    color: "#8F9BA8",
  },
  title: {
    ...typography.display,
    color: "#FFFFFF",
    marginTop: 8,
  },
  typeBadge: {
    ...typography.caption,
    marginTop: 10,
    color: "#F4A623",
  },
  section: {
    marginTop: 26,
  },
  sectionTitle: {
    ...typography.caption,
    color: "#8F9BA8",
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  metaRowLast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 12,
  },
  metaLabel: {
    ...typography.caption,
    color: "#788493",
  },
  metaValue: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    textAlign: "right",
    flexShrink: 1,
  },
  emptyText: {
    ...typography.body,
    color: "#9AA5B1",
    marginBottom: 8,
  },
  agentDescription: {
    ...typography.body,
    color: "#9AA5B1",
    marginBottom: 8,
  },
  evidenceRequestCard: {
    marginTop: 8,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#3D4A5C",
  },
  evidenceRequestEyebrow: {
    ...typography.caption,
    color: "#F0B429",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  evidenceRequestMessage: {
    ...typography.body,
    color: "#E8EEF6",
    marginBottom: 12,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkButtonText: {
    ...typography.button,
    color: "#F4A623",
  },
  actionsTitle: {
    ...typography.button,
    color: "#8F9BA8",
    marginTop: 30,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#F4A623",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: "#111111",
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  shareButton: {
    backgroundColor: "#F8FBFE",
    borderColor: "#D6EAF9",
  },
  secondaryButtonText: {
    ...typography.bodyMedium,
    color: "#F4A623",
  },
  shareButtonText: {
    ...typography.bodyMedium,
    color: colors.brand.navy,
  },
  shareErrorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 8,
  },
  disabledActionCard: {
    backgroundColor: "#151C25",
    borderWidth: 1,
    borderColor: "#27313D",
    borderRadius: 14,
    padding: 16,
  },
  disabledActionTitle: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
  },
  disabledActionBody: {
    ...typography.button,
    color: "#8F9BA8",
    marginTop: 6,
  },
});
