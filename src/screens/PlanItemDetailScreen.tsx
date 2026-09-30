import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import PlanItemProvenanceSheet from "../components/plan/PlanItemProvenanceSheet";
import OrganizeWorkModal from "../components/project/OrganizeWorkModal";
import type { RootStackParamList } from "../navigation/types";
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
import { getPlanItemImageDisplaySource } from "../utils/domain/planItemImage";

import { typography } from "../theme/colors";
import BuildSigmaFoldBackground from "../components/background/BuildSigmaFoldBackground";

const KEPLER_NAVY = "#012169";
const KEPLER_RED = "#E31837";

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
    hour: "numeric",
    minute: "2-digit",
  });
}

type SectionVariant = "core" | "supporting" | "intelligence";

function Section({
  title,
  children,
  variant = "core",
  accent,
}: {
  title: string;
  children: React.ReactNode;
  variant?: SectionVariant;
  accent?: "variance";
}) {
  const sectionStyle =
    variant === "supporting"
      ? styles.sectionSupporting
      : variant === "intelligence"
        ? styles.sectionIntelligence
        : styles.section;

  const titleStyle =
    variant === "intelligence"
      ? styles.sectionTitleIntelligence
      : styles.sectionTitle;

  const cardStyle = [
    variant === "supporting"
      ? styles.sectionCardSupporting
      : variant === "intelligence"
        ? styles.sectionCardIntelligence
        : styles.sectionCard,
    accent === "variance" ? styles.sectionCardVarianceAccent : null,
  ];

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>{title}</Text>
      <View style={cardStyle}>{children}</View>
    </View>
  );
}

function MetaRow({
  label,
  value,
  last = false,
  valueStyle,
  leadingIcon,
}: {
  label: string;
  value: string;
  last?: boolean;
  valueStyle?: object;
  leadingIcon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={last ? styles.metaRowLast : styles.metaRow}>
      <View style={styles.metaLabelWrap}>
        {leadingIcon ? (
          <Ionicons
            name={leadingIcon}
            size={14}
            color="#667085"
            style={styles.metaLabelIcon}
          />
        ) : null}
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={[styles.metaValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function PlanItemHeroImage({
  item,
}: {
  item: Pick<PlanItem, "imageUri" | "imageUrl">;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const source = getPlanItemImageDisplaySource(item, failedUri);
  if (!source) return null;

  return (
    <Image
      source={{ uri: source.uri }}
      style={styles.heroImage}
      resizeMode="cover"
      onError={() => setFailedUri(source.uri)}
      accessibilityLabel="Plan Item image"
    />
  );
}

function StatusGroup({
  title,
  icon,
  last = false,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={last ? styles.statusGroupLast : styles.statusGroup}>
      <View style={styles.statusGroupHeading}>
        <Ionicons name={icon} size={15} color="#667085" />
        <Text style={styles.statusGroupTitle}>{title}</Text>
      </View>
      <View>{children}</View>
    </View>
  );
}

export default function PlanItemDetailScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { projectId, planItemId } = route.params;
  const isShared = route.params.source === "shared";

  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [planItem, setPlanItem] = useState<PlanItem | null>(null);
  const [remoteProjectId, setRemoteProjectId] = useState<string | null>(null);
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


  if (project === undefined) {
    return (
      <BuildSigmaFoldBackground intensity={0.55}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={KEPLER_NAVY} />
            <Text style={styles.loadingText}>Loading plan item…</Text>
          </View>
        </SafeAreaView>
      </BuildSigmaFoldBackground>
    );
  }

  if (!project || !planItem) {
    return (
      <BuildSigmaFoldBackground intensity={0.55}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.container}>
            <View style={styles.topBar}>
              <Pressable
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={8}
              >
                <Ionicons
                  name="chevron-back"
                  size={24}
                  color={KEPLER_NAVY}
                />
              </Pressable>
              <View style={styles.topBarPlaceholder} />
              <View style={styles.topBarPlaceholder} />
            </View>
            <View style={styles.notFoundBody}>
              <Ionicons
                name="document-outline"
                size={32}
                color="#667085"
              />
              <Text style={styles.notFoundTitle}>Plan item not found.</Text>
            </View>
          </View>
        </SafeAreaView>
      </BuildSigmaFoldBackground>
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
    <BuildSigmaFoldBackground intensity={0.55}>
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
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={KEPLER_NAVY}
          />
        </Pressable>
        <Text style={styles.topBarTitle}>Plan Item</Text>
        <View style={styles.topBarPlaceholder} />
      </View>

      {isShared ? (
        <View style={styles.sharedBanner}>
          <Ionicons
            name="lock-closed-outline"
            size={13}
            color={KEPLER_NAVY}
          />
          <Text style={styles.sharedBannerText}>
            Shared project · Read only
          </Text>
        </View>
      ) : null}

        <View style={styles.hero}>
          <PlanItemHeroImage item={planItem} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>PLAN ITEM</Text>
            <Text style={styles.projectName}>{project.name}</Text>
            <Text style={styles.title}>{planItem.label}</Text>
            <View style={styles.typeBadgePill}>
              <Text style={styles.typeBadgeText}>
                {formatPlanItemTypeLabel(planItem.type)}
              </Text>
            </View>
          </View>
        </View>

        <Section title="PLAN">
          <View style={styles.planSummary}>
            <Text style={styles.planQuantityLabel}>PLANNED QUANTITY</Text>
            <Text style={styles.planQuantityValue}>
              {formatQuantity(planItem.plannedValue, planItem.unit)}
            </Text>
            <View style={styles.planMetricGrid}>
              <View style={styles.planMetricCell}>
                <Text style={styles.planMetricLabel}>Unit</Text>
                <Text style={styles.planMetricValue}>{planItem.unit}</Text>
              </View>
              <View style={styles.planMetricCell}>
                <Text style={styles.planMetricLabel}>Unit cost</Text>
                <Text style={styles.planMetricValue}>
                  {formatCurrency(planItem.unitCost)}
                </Text>
              </View>
              <View style={styles.planMetricCell}>
                <Text style={styles.planMetricLabel}>Production / day</Text>
                <Text style={styles.planMetricValue}>
                  {planItem.productionRatePerDay}
                </Text>
              </View>
              <View style={styles.planMetricCell}>
                <Text style={styles.planMetricLabel}>Labor / unit</Text>
                <Text style={styles.planMetricValue}>
                  {planItem.laborHoursPerUnit} hr
                </Text>
              </View>
            </View>
          </View>
        </Section>

        <Section title="DETAILS" variant="supporting">
          <View style={styles.detailsGroup}>
            <View style={styles.detailGroupHeading}>
              <Ionicons name="document-text-outline" size={15} color="#667085" />
              <Text style={styles.detailGroupLabel}>SOURCE</Text>
            </View>
          {planItem.origin === "plan_import" ? (
            <Text style={styles.supportingBody}>
              Imported from project documents
            </Text>
          ) : (
            <Text style={styles.supportingBody}>Created manually</Text>
          )}
          {!isShared ? (
            <Pressable
              style={styles.linkButton}
              onPress={openProvenance}
              accessibilityRole="button"
              accessibilityLabel={`View source for ${planItem.label}`}
              hitSlop={6}
            >
              <View style={styles.linkRow}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={KEPLER_NAVY}
                />
                <Text style={styles.linkButtonText}>
                  {planItem.origin === "plan_import"
                    ? "View provenance →"
                    : "View source →"}
                </Text>
              </View>
            </Pressable>
          ) : null}
          </View>

          <View style={styles.detailsDivider} />
          <View style={styles.detailsGroup}>
            <View style={styles.detailGroupHeading}>
              <Ionicons name="briefcase-outline" size={15} color="#667085" />
              <Text style={styles.detailGroupLabel}>ASSIGNMENT</Text>
            </View>
          {hasAssignment && assignmentMeta ? (
            <>
              <MetaRow
                label="Work package"
                value={assignmentMeta.workPackageName ?? "—"}
              />
              <MetaRow
                label="Assigned to"
                value={assignmentMeta.assigneeLabel ?? "Unassigned"}
                leadingIcon="person-outline"
                valueStyle={styles.metaValueEmphasized}
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
                  hitSlop={6}
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
                last
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
                  hitSlop={6}
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
                  hitSlop={6}
                >
                  <Text style={styles.linkButtonText}>Organize work</Text>
                </Pressable>
              ) : null}
            </>
          )}
          </View>
        </Section>

        <Section title="FIELD STATUS" variant="supporting">
          <StatusGroup title="FIELD" icon="resize-outline">
          {latestMeasurement ? (
            <>
              <MetaRow
                label="Latest measurement"
                value={formatQuantity(
                  latestMeasurement.value,
                  latestMeasurement.unit,
                )}
                valueStyle={styles.metaValueFocus}
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
                  hitSlop={6}
                >
                  <Text style={styles.linkButtonText}>View measurement →</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyStateRow}>
              <Ionicons
                name="resize-outline"
                size={18}
                color="#667085"
              />
              <Text style={styles.emptyStateText}>
                No field measurement yet
              </Text>
            </View>
          )}
          </StatusGroup>

          <StatusGroup title="VARIANCE" icon="git-compare-outline">
          {latestDelta ? (
            <>
              <MetaRow
                label="Difference"
                value={formatSignedQuantity(
                  latestDelta.difference,
                  latestDelta.unit,
                )}
                valueStyle={styles.varianceValue}
              />
              <MetaRow
                label="Status"
                value={latestDelta.status.toUpperCase()}
                valueStyle={
                  latestDelta.status === "open"
                    ? styles.varianceValue
                    : undefined
                }
              />
              <MetaRow
                label="Recorded"
                value={formatDateTime(latestDelta.createdAt)}
                last
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
                hitSlop={6}
              >
                <Text style={styles.linkButtonText}>View delta →</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.emptyTextCalm}>No delta recorded</Text>
          )}
          </StatusGroup>

          <StatusGroup title="EVIDENCE" icon="image-outline">
          {relatedEvidence.length === 0 ? (
            <View style={styles.emptyStateRow}>
              <Ionicons
                name="image-outline"
                size={18}
                color="#667085"
              />
              <Text style={styles.emptyStateText}>
                No related evidence linked through measurement or delta.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.evidenceSummaryRow}>
                <Ionicons
                  name="document-attach-outline"
                  size={16}
                  color="#475467"
                />
                <Text style={styles.supportingBody}>
                  {relatedEvidence.length} related evidence record
                  {relatedEvidence.length === 1 ? "" : "s"}
                </Text>
              </View>
              <Pressable
                style={styles.linkButton}
                onPress={() =>
                  navigation.navigate("ProjectEvidence", { projectId })
                }
                accessibilityRole="button"
                accessibilityLabel="Open project evidence"
                hitSlop={6}
              >
                <Text style={styles.linkButtonText}>
                  View project evidence →
                </Text>
              </Pressable>
            </>
          )}
          </StatusGroup>

          <StatusGroup
            title="KEPLER AGENT"
            icon="sparkles-outline"
            last
          >
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
                  hitSlop={6}
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
                  hitSlop={6}
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
          </StatusGroup>
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
          <View style={styles.disabledActionRow}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#667085"
            />
            <View style={styles.disabledActionCopy}>
              <Text style={styles.disabledActionTitle}>
                Measurement unavailable for this item type
              </Text>
              <Text style={styles.disabledActionBody}>
                Field measurement currently supports length plan items in feet.
              </Text>
            </View>
          </View>
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
    </BuildSigmaFoldBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingText: {
    ...typography.caption,
    color: "#667085",
    fontSize: 13,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    marginBottom: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  topBarTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 16,
    fontWeight: "600",
  },
  sharedBanner: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(1,33,105,0.06)",
  },
  sharedBannerText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 12,
    fontWeight: "500",
  },
  topBarPlaceholder: {
    width: 44,
  },
  notFoundBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
    gap: 12,
  },
  notFoundTitle: {
    ...typography.body,
    color: "#475467",
    fontSize: 15,
    textAlign: "center",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 3,
  },
  heroImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "rgba(1,33,105,0.06)",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 10.5,
    letterSpacing: 0.75,
    fontWeight: "600",
  },
  projectName: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
    marginTop: 2,
  },
  eyebrow: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11,
    letterSpacing: 0.7,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  title: {
    ...typography.title,
    color: "#101828",
    fontSize: 25,
    lineHeight: 31,
    marginTop: 6,
    letterSpacing: -0.35,
  },
  typeBadgePill: {
    alignSelf: "flex-start",
    marginTop: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(1,33,105,0.07)",
  },
  typeBadgeText: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11.5,
    fontWeight: "600",
  },
  planSummary: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  planQuantityLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 10.5,
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  planQuantityValue: {
    ...typography.title,
    color: KEPLER_NAVY,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 8,
  },
  planMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.08)",
  },
  planMetricCell: {
    width: "50%",
    minWidth: 0,
    paddingVertical: 8,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },
  planMetricLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 11.5,
  },
  planMetricValue: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  section: {
    marginTop: 18,
  },
  sectionSupporting: {
    marginTop: 15,
  },
  sectionIntelligence: {
    marginTop: 16,
  },
  sectionTitle: {
    ...typography.caption,
    color: "#475467",
    fontSize: 11,
    letterSpacing: 0.75,
    fontWeight: "600",
    marginBottom: 7,
  },
  sectionTitleIntelligence: {
    ...typography.caption,
    color: KEPLER_NAVY,
    fontSize: 11,
    letterSpacing: 0.75,
    fontWeight: "600",
    marginBottom: 7,
  },
  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.07)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 2,
    overflow: "hidden",
  },
  sectionCardSupporting: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.05)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    overflow: "hidden",
  },
  sectionCardIntelligence: {
    backgroundColor: "rgba(1,33,105,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(1,33,105,0.10)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 4,
    overflow: "hidden",
  },
  sectionCardVarianceAccent: {
    borderLeftWidth: 2.5,
    borderLeftColor: KEPLER_RED,
  },
  detailsGroup: {
    paddingVertical: 3,
  },
  detailGroupHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  detailGroupLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 10.5,
    letterSpacing: 0.65,
    fontWeight: "600",
  },
  detailsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(15,23,42,0.08)",
    marginVertical: 5,
  },
  statusGroup: {
    paddingTop: 8,
    paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.07)",
  },
  statusGroupLast: {
    paddingTop: 8,
    paddingBottom: 7,
  },
  statusGroupHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  statusGroupTitle: {
    ...typography.caption,
    color: "#475467",
    fontSize: 10.5,
    letterSpacing: 0.55,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.07)",
  },
  metaRowLast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
    paddingVertical: 8,
    gap: 12,
  },
  metaLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "48%",
  },
  metaLabelIcon: {
    marginRight: 5,
  },
  metaLabel: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
    fontWeight: "500",
    flexShrink: 1,
    minWidth: 0,
  },
  metaValue: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 13.5,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    minWidth: 0,
    flexGrow: 1,
  },
  metaValueEmphasized: {
    fontSize: 14,
    fontWeight: "600",
    color: "#101828",
  },
  metaValueFocus: {
    fontSize: 15,
    fontWeight: "600",
    color: "#101828",
  },
  varianceValue: {
    color: KEPLER_RED,
  },
  emptyText: {
    ...typography.body,
    color: "#667085",
    fontSize: 13.5,
    lineHeight: 19,
    marginVertical: 8,
    paddingHorizontal: 2,
  },
  emptyTextCalm: {
    ...typography.body,
    color: "#667085",
    fontSize: 13.5,
    lineHeight: 19,
    marginVertical: 10,
    paddingHorizontal: 2,
  },
  emptyStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 2,
    minHeight: 38,
  },
  emptyStateText: {
    ...typography.body,
    color: "#667085",
    fontSize: 13.5,
    lineHeight: 19,
    flex: 1,
    minWidth: 0,
  },
  supportingBody: {
    ...typography.body,
    color: "#475467",
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: 2,
  },
  evidenceSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  agentDescription: {
    ...typography.body,
    color: "#475467",
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  evidenceRequestCard: {
    marginTop: 6,
    marginBottom: 8,
    marginHorizontal: 0,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(227, 24, 55, 0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(227, 24, 55, 0.12)",
  },
  evidenceRequestEyebrow: {
    ...typography.caption,
    color: KEPLER_RED,
    fontSize: 11,
    letterSpacing: 0.6,
    fontWeight: "600",
    marginBottom: 6,
  },
  evidenceRequestMessage: {
    ...typography.body,
    color: "#344054",
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 12,
  },
  linkButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  linkButtonText: {
    ...typography.bodyMedium,
    color: KEPLER_NAVY,
    fontSize: 13.5,
    fontWeight: "600",
  },
  actionsTitle: {
    ...typography.caption,
    color: "#475467",
    fontSize: 11,
    letterSpacing: 0.75,
    fontWeight: "600",
    marginTop: 22,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: KEPLER_NAVY,
    borderRadius: 15,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledActionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
  },
  disabledActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  disabledActionTitle: {
    ...typography.bodyMedium,
    color: "#101828",
    fontSize: 13.5,
    fontWeight: "600",
  },
  disabledActionBody: {
    ...typography.caption,
    color: "#667085",
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
  },
});
