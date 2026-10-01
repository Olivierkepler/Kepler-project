import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../auth/AuthProvider";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getRemoteWorkPackageId } from "../../store/workPackageCloudMappings";
import { getMeasurementsForProject } from "../../store/measurements";
import { getPlanItemsForProject } from "../../store/planItems";
import { getWorkPackageAssignmentsForProject } from "../../store/workPackageAssignments";
import { getWorkPackagesForProject } from "../../store/workPackages";
import { listTeamWorkPackageAssignments } from "../../services/api/teamWorkPackageAssignments";
import { listTeamMembers, listTeams } from "../../services/api/teams";
import { findProjectMemberByUserId } from "../../store/projectMembers";
import { createRemoteProjectMemberId } from "../../utils/assignmentProgress";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { ProjectMemberRole } from "../../types/projectMember";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  deriveProjectTodos,
  filterProjectTodosByKind,
  filterProjectTodosByScope,
  type ProjectTodoItem,
  type ProjectTodoKind,
  type ProjectTodoKindFilter,
  type ProjectTodoScope,
} from "../../utils/domain/projectTodos";
import { colors, typography } from "../../theme/colors";
import OrganizeWorkModal from "./OrganizeWorkModal";
import WorkPackagesSection from "./WorkPackagesSection";

type Props = {
  projectId: string;
  isShared: boolean;
  membershipRole?: ProjectMemberRole;
  onOpenPlanItem: (planItemId: string) => void;
  onMeasurePlanItem?: (planItemId: string) => void;
  onOpenMeasurementReview?: (planItemId: string) => void;
  onOpenAssignmentReview?: (workPackageId: string, fallbackPlanItemId: string) => void;
  sharedPlanItems?: PlanItem[];
  sharedMeasurements?: Measurement[];
  sharedWorkPackages?: WorkPackage[];
  sharedMemberAssignments?: WorkPackageAssignment[];
  sharedAssignmentDataComplete?: boolean;
  onOpenWorkPackage?: (workPackageId: string, fallbackPlanItemId: string) => void;
};

const KIND_ICON: Record<ProjectTodoItem["kind"], React.ComponentProps<typeof Ionicons>["name"]> = {
  needs_assignment: "people-outline",
  awaiting_measurement: "resize-outline",
  ready_for_review: "time-outline",
  needs_correction: "alert-circle-outline",
};

const EMPTY_PLAN_ITEMS: PlanItem[] = [];
const EMPTY_MEASUREMENTS: Measurement[] = [];
const EMPTY_WORK_PACKAGES: WorkPackage[] = [];
const EMPTY_MEMBER_ASSIGNMENTS: WorkPackageAssignment[] = [];
const KIND_LABEL: Record<ProjectTodoKind, string> = {
  needs_assignment: "Needs assignment",
  awaiting_measurement: "Awaiting field measurement",
  ready_for_review: "Ready for review",
  needs_correction: "Needs correction",
};

async function loadVisibleTeamScope(
  projectId: string,
  currentCloudMemberId: string | null,
): Promise<{ visibleTeamIds: string[]; currentMemberTeamIds: string[] }> {
  const teams = (await listTeams(projectId)).filter((team) => team.status === "active");
  const membershipSets = await Promise.all(
    teams.map(async (team) => ({
      teamId: team.id,
      memberIds: (await listTeamMembers(projectId, team.id))
        .filter((membership) => membership.status === "active")
        .map((membership) => membership.projectMemberId),
    })),
  );
  return {
    visibleTeamIds: teams.map((team) => team.id),
    currentMemberTeamIds: currentCloudMemberId
      ? membershipSets
          .filter((team) => team.memberIds.includes(currentCloudMemberId))
          .map((team) => team.teamId)
      : [],
  };
}

export default function ProjectTodoContent({
  projectId,
  isShared,
  membershipRole,
  onOpenPlanItem,
  onMeasurePlanItem,
  onOpenMeasurementReview,
  onOpenAssignmentReview,
  sharedPlanItems = EMPTY_PLAN_ITEMS,
  sharedMeasurements = EMPTY_MEASUREMENTS,
  sharedWorkPackages = EMPTY_WORK_PACKAGES,
  sharedMemberAssignments = EMPTY_MEMBER_ASSIGNMENTS,
  sharedAssignmentDataComplete = false,
  onOpenWorkPackage,
}: Props) {
  const { user } = useAuth();
  const [localPlanItems, setLocalPlanItems] = useState<PlanItem[]>([]);
  const [localMeasurements, setLocalMeasurements] = useState<Measurement[]>([]);
  const [localWorkPackages, setLocalWorkPackages] = useState<WorkPackage[]>([]);
  const [localMemberAssignments, setLocalMemberAssignments] = useState<WorkPackageAssignment[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<TeamWorkPackageAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentWarning, setAssignmentWarning] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [currentProjectMemberIds, setCurrentProjectMemberIds] = useState<string[]>([]);
  const [visibleTeamIds, setVisibleTeamIds] = useState<string[]>([]);
  const [activeMemberTeamIds, setActiveMemberTeamIds] = useState<string[]>([]);
  const [teamScopeReady, setTeamScopeReady] = useState(false);
  const [selectedScope, setSelectedScope] = useState<ProjectTodoScope>(
    isShared && (membershipRole === "contractor" || membershipRole === "field_member")
      ? "mine"
      : "all",
  );
  const [selectedKind, setSelectedKind] = useState<ProjectTodoKindFilter>("all");
  const [kindFilterVisible, setKindFilterVisible] = useState(false);
  const [assignmentWorkPackageId, setAssignmentWorkPackageId] = useState<string | null>(null);
  const [organizePlanItem, setOrganizePlanItem] = useState<PlanItem | null>(null);
  const focusedBefore = useRef(false);

  const canManageAssignments = !isShared || membershipRole === "owner" || membershipRole === "project_admin";
  const canReview = !isShared || membershipRole === "owner" || membershipRole === "project_admin";

  useFocusEffect(useCallback(() => {
    if (focusedBefore.current) setRetryKey((current) => current + 1);
    focusedBefore.current = true;
  }, []));

  const loadLocal = useCallback(async (isCurrent: () => boolean) => {
    if (!user?.uid) {
      setError("Project data is unavailable.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setAssignmentWarning(false);
    setTeamScopeReady(false);
    try {
      const [planItems, measurements, workPackages, memberAssignments, remoteProjectId, currentMember] = await Promise.all([
        getPlanItemsForProject(user.uid, projectId),
        getMeasurementsForProject(user.uid, projectId),
        getWorkPackagesForProject(user.uid, projectId),
        getWorkPackageAssignmentsForProject(user.uid, projectId),
        getRemoteProjectId(user.uid, projectId),
        findProjectMemberByUserId(user.uid, projectId, user.uid),
      ]);
      if (!isCurrent()) return;
      setLocalPlanItems(planItems);
      setLocalMeasurements(measurements);
      setLocalWorkPackages(workPackages);
      setLocalMemberAssignments(memberAssignments);
      setCurrentProjectMemberIds(
        currentMember?.status === "active" ? [currentMember.id] : [],
      );

      if (!remoteProjectId) {
        setTeamAssignments([]);
        setVisibleTeamIds([]);
        setActiveMemberTeamIds([]);
        setTeamScopeReady(true);
      } else {
        try {
          const [remoteAssignments, teamScope] = await Promise.all([
            listTeamWorkPackageAssignments(remoteProjectId),
            loadVisibleTeamScope(
              remoteProjectId,
              createRemoteProjectMemberId(remoteProjectId, user.uid),
            ),
          ]);
          const remoteToLocal = new Map<string, string>();
          await Promise.all(workPackages.map(async (workPackage) => {
            const remoteId = await getRemoteWorkPackageId(user.uid, projectId, workPackage.id);
            if (remoteId) remoteToLocal.set(remoteId, workPackage.id);
          }));
          if (!isCurrent()) return;
          setTeamAssignments(remoteAssignments.flatMap((assignment) => {
            const localWorkPackageId = remoteToLocal.get(assignment.workPackageId);
            return localWorkPackageId && teamScope.visibleTeamIds.includes(assignment.teamId)
              ? [{ ...assignment, workPackageId: localWorkPackageId }]
              : [];
          }));
          setVisibleTeamIds(teamScope.visibleTeamIds);
          setActiveMemberTeamIds(teamScope.currentMemberTeamIds);
          setCurrentProjectMemberIds((current) => [
            ...new Set([
              ...current,
              createRemoteProjectMemberId(remoteProjectId, user.uid),
            ]),
          ]);
          setTeamScopeReady(true);
        } catch {
          if (!isCurrent()) return;
          setTeamAssignments([]);
          setAssignmentWarning(true);
          setVisibleTeamIds([]);
          setActiveMemberTeamIds([]);
          setTeamScopeReady(false);
        }
      }
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "Project actions could not be loaded.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [projectId, user?.uid]);

  useEffect(() => {
    if (isShared) {
      let active = true;
      setLoading(true);
      setError(null);
      setAssignmentWarning(false);
      setTeamScopeReady(false);
      setLocalPlanItems(sharedPlanItems);
      setLocalMeasurements(sharedMeasurements);
      setLocalWorkPackages(sharedWorkPackages);
      setLocalMemberAssignments(sharedMemberAssignments);
      setAssignmentWarning(!sharedAssignmentDataComplete);
      const cloudMemberId = user?.uid ? createRemoteProjectMemberId(projectId, user.uid) : null;
      setCurrentProjectMemberIds(cloudMemberId ? [cloudMemberId] : []);
      Promise.all([
        listTeamWorkPackageAssignments(projectId),
        loadVisibleTeamScope(projectId, cloudMemberId),
      ])
        .then(([assignments, teamScope]) => {
          if (!active) return;
          setTeamAssignments(assignments.filter((item) => teamScope.visibleTeamIds.includes(item.teamId)));
          setVisibleTeamIds(teamScope.visibleTeamIds);
          setActiveMemberTeamIds(teamScope.currentMemberTeamIds);
          setTeamScopeReady(true);
        })
        .catch(() => {
          if (active) {
            setTeamAssignments([]);
            setAssignmentWarning(true);
            setVisibleTeamIds([]);
            setActiveMemberTeamIds([]);
            setTeamScopeReady(false);
          }
        })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }
    let active = true;
    void loadLocal(() => active);
    return () => { active = false; };
  }, [isShared, loadLocal, projectId, retryKey, sharedAssignmentDataComplete, sharedMemberAssignments, sharedMeasurements, sharedPlanItems, sharedWorkPackages, user?.uid]);

  const derivedItems = useMemo(() => deriveProjectTodos({
    planItems: localPlanItems,
    workPackages: localWorkPackages,
    memberAssignments: localMemberAssignments,
    teamAssignments,
    measurements: localMeasurements,
    assignmentDataComplete: !assignmentWarning,
    canManageAssignments,
    canReviewMeasurements: canReview,
  }), [assignmentWarning, canManageAssignments, canReview, localMemberAssignments, localMeasurements, localPlanItems, localWorkPackages, teamAssignments]);

  const assignmentScopeAllowed = !(isShared && membershipRole === "viewer");
  const mineAvailable =
    teamScopeReady &&
    !assignmentWarning &&
    assignmentScopeAllowed &&
    currentProjectMemberIds.length > 0;
  const teamAvailable =
    teamScopeReady &&
    !assignmentWarning &&
    assignmentScopeAllowed &&
    visibleTeamIds.length > 0;
  const scopeOptions: ProjectTodoScope[] = [
    ...(mineAvailable ? ["mine" as const] : []),
    ...(teamAvailable ? ["team" as const] : []),
    "all",
  ];
  const resolvedScope = scopeOptions.includes(selectedScope) ? selectedScope : "all";
  const scopedItems = useMemo(() => filterProjectTodosByScope({
    items: derivedItems,
    scope: resolvedScope,
    memberAssignments: localMemberAssignments,
    teamAssignments,
    currentProjectMemberIds,
    activeTeamIds: resolvedScope === "team" ? visibleTeamIds : activeMemberTeamIds,
  }), [activeMemberTeamIds, currentProjectMemberIds, derivedItems, localMemberAssignments, resolvedScope, teamAssignments, visibleTeamIds]);
  const items = useMemo(
    () => filterProjectTodosByKind(scopedItems, selectedKind),
    [scopedItems, selectedKind],
  );
  const defaultsToAll = !(isShared && (membershipRole === "contractor" || membershipRole === "field_member"));
  const countLabel = `${items.length} ${items.length === 1 ? "action" : "actions"}`;
  const emptyMessage = selectedKind !== "all"
    ? `No ${KIND_LABEL[selectedKind].toLowerCase()} actions.`
    : resolvedScope === "mine"
      ? "Nothing assigned to you needs attention."
      : resolvedScope === "team"
        ? "No team-assigned work needs attention."
        : "No project items need attention right now.";

  useEffect(() => {
    setSelectedScope(defaultsToAll ? "all" : "mine");
    setSelectedKind("all");
  }, [defaultsToAll, projectId]);

  useEffect(() => {
    if (!loading && !scopeOptions.includes(selectedScope)) {
      setSelectedScope(!defaultsToAll && mineAvailable ? "mine" : "all");
    }
  }, [defaultsToAll, loading, mineAvailable, scopeOptions.join("|"), selectedScope]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.heading}>To Do</Text>
          {!loading && !error ? <Text style={styles.count}>{countLabel}</Text> : null}
        </View>
        {!loading && !error ? (
          <Pressable
            style={styles.kindFilterButton}
            onPress={() => setKindFilterVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Filter actions, ${selectedKind === "all" ? "all actions" : KIND_LABEL[selectedKind]}`}
            accessibilityState={{ expanded: kindFilterVisible }}
          >
            <Ionicons name="filter-outline" size={18} color={colors.brand.navy} />
          </Pressable>
        ) : <Ionicons name="checkbox-outline" size={23} color={colors.brand.navy} />}
      </View>

      {!loading && !error ? (
        <View style={styles.scopeControl} accessibilityRole="radiogroup" accessibilityLabel="Action scope">
          {scopeOptions.map((option) => {
            const selected = resolvedScope === option;
            const label = option === "mine" ? "Mine" : option === "team" ? "Team" : "All";
            return (
              <Pressable
                key={option}
                style={[styles.scopeOption, selected && styles.scopeOptionSelected]}
                onPress={() => setSelectedScope(option)}
                accessibilityRole="radio"
                accessibilityLabel={`${label} scope${selected ? ", selected" : ""}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.scopeOptionText, selected && styles.scopeOptionTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.stateRow}><ActivityIndicator color={colors.brand.navy} /><Text style={styles.stateText}>Loading project actions…</Text></View>
      ) : error ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>{error}</Text>
          {!isShared ? <Pressable onPress={() => void loadLocal(() => true)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable> : null}
        </View>
      ) : items.length === 0 && assignmentWarning ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>Some assignment actions are unavailable right now.</Text>
          <Pressable onPress={() => setRetryKey((current) => current + 1)} style={styles.retry} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          {resolvedScope === "all" && selectedKind === "all" ? (
            <View style={styles.emptyIcon}><Ionicons name="checkmark" size={22} color={colors.success} /></View>
          ) : null}
          <Text style={styles.emptyTitle}>{resolvedScope === "all" && selectedKind === "all" ? "You’re all caught up" : emptyMessage}</Text>
          {resolvedScope === "all" && selectedKind === "all" ? <Text style={styles.emptyText}>{emptyMessage}</Text> : null}
        </View>
      ) : (
        <View style={styles.list}>
          {assignmentWarning ? (
            <View style={styles.warningRow}>
              <Text style={styles.warning}>Assignment actions are temporarily unavailable.</Text>
              <Pressable onPress={() => setRetryKey((current) => current + 1)} style={styles.retry} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></Pressable>
            </View>
          ) : null}
          {items.map((item, index) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.row, index === 0 && styles.firstRow, pressed && styles.rowPressed]}
              onPress={() => {
                if (item.kind === "needs_assignment" && item.sourceType === "work_package" && item.workPackageId) {
                  if (!isShared && user?.uid) setAssignmentWorkPackageId(item.workPackageId);
                  else onOpenPlanItem(item.planItemId);
                  return;
                }
                if (item.kind === "needs_assignment" && item.sourceType === "plan_item") {
                  if (!isShared) {
                    const target = localPlanItems.find((planItem) => planItem.id === item.planItemId);
                    if (target) setOrganizePlanItem(target);
                    else onOpenPlanItem(item.planItemId);
                  } else onOpenPlanItem(item.planItemId);
                  return;
                }
                if (item.kind === "awaiting_measurement" || item.kind === "needs_correction") {
                  if (onMeasurePlanItem) onMeasurePlanItem(item.planItemId);
                  else onOpenPlanItem(item.planItemId);
                  return;
                }
                if (item.kind === "ready_for_review" && item.sourceType === "assignment" && item.workPackageId) {
                  (onOpenAssignmentReview ?? onOpenWorkPackage)?.(item.workPackageId, item.planItemId);
                  return;
                }
                if (item.kind === "ready_for_review" && item.sourceType === "measurement") {
                  if (onOpenMeasurementReview) onOpenMeasurementReview(item.planItemId);
                  else onOpenPlanItem(item.planItemId);
                  return;
                }
                onOpenPlanItem(item.planItemId);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.context}. ${item.reason}. Open related work.`}
            >
              <View style={styles.iconWrap}><Ionicons name={KIND_ICON[item.kind]} size={17} color={item.kind === "needs_correction" ? colors.delta : colors.brand.navy} /></View>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.context}>{item.context}</Text>
                <Text numberOfLines={1} style={styles.reason}>{item.reason}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={kindFilterVisible} transparent animationType="fade" onRequestClose={() => setKindFilterVisible(false)}>
        <View style={styles.filterOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setKindFilterVisible(false)} accessibilityRole="button" accessibilityLabel="Close action filters" />
          <View style={styles.filterSheet}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Action type</Text>
              <Pressable onPress={() => setKindFilterVisible(false)} accessibilityRole="button" accessibilityLabel="Close action filters" hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
            {(["all", "needs_correction", "ready_for_review", "awaiting_measurement", "needs_assignment"] as ProjectTodoKindFilter[]).map((kind) => {
              const selected = selectedKind === kind;
              const label = kind === "all" ? "All actions" : KIND_LABEL[kind];
              return (
                <Pressable
                  key={kind}
                  style={styles.filterOption}
                  onPress={() => { setSelectedKind(kind); setKindFilterVisible(false); }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${label}${selected ? ", selected" : ""}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.filterOptionText}>{label}</Text>
                  {selected ? <Ionicons name="checkmark" size={19} color={colors.brand.navy} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      {assignmentWorkPackageId && user?.uid && !isShared ? (
        <WorkPackagesSection
          mode="local"
          projectId={projectId}
          ownerUid={user.uid}
          canMutate
          planItems={localPlanItems.map(({ id, label }) => ({ id, label }))}
          assignmentOnly
          openAssignmentForWorkPackageId={assignmentWorkPackageId}
          onAssignmentModalClose={() => {
            setAssignmentWorkPackageId(null);
            setRetryKey((current) => current + 1);
          }}
          onAssignmentsChanged={() => setRetryKey((current) => current + 1)}
        />
      ) : null}

      {organizePlanItem && user?.uid && !isShared ? (
        <OrganizeWorkModal
          visible
          projectId={projectId}
          ownerUid={user.uid}
          canMutate
          planItems={[organizePlanItem]}
          selectionMode="unassignedItemsFirst"
          highlightPlanItemId={organizePlanItem.id}
          onClose={() => {
            setOrganizePlanItem(null);
            setRetryKey((current) => current + 1);
          }}
          onUpdated={() => setRetryKey((current) => current + 1)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 48 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  heading: { ...typography.title, color: colors.text.primary },
  count: { ...typography.caption, color: colors.text.secondary, marginTop: 2 },
  kindFilterButton: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  scopeControl: { minHeight: 42, flexDirection: "row", padding: 3, borderRadius: 11, backgroundColor: "#F2F4F7", marginBottom: 16 },
  scopeOption: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  scopeOptionSelected: { backgroundColor: colors.surface, shadowColor: "#101828", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  scopeOptionText: { ...typography.caption, color: colors.text.secondary, fontWeight: "600" },
  scopeOptionTextSelected: { color: colors.brand.navy, fontWeight: "700" },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 12 },
  firstRow: { borderTopWidth: 0 },
  rowPressed: { opacity: 0.7 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(1,33,105,0.06)" },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...typography.bodyMedium, color: colors.text.primary },
  context: { ...typography.caption, color: colors.text.secondary },
  reason: { ...typography.caption, color: colors.brand.navy },
  stateRow: { minHeight: 100, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  stateBlock: { minHeight: 100, alignItems: "center", justifyContent: "center", gap: 8 },
  stateText: { ...typography.body, color: colors.text.secondary, textAlign: "center" },
  retry: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  retryText: { ...typography.button, color: colors.brand.navy },
  warningRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  warning: { ...typography.caption, color: colors.text.secondary, paddingVertical: 10, flex: 1 },
  emptyState: { alignItems: "center", paddingTop: 58, paddingHorizontal: 20 },
  emptyIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(18,183,106,0.10)", marginBottom: 14 },
  emptyTitle: { ...typography.bodyMedium, color: colors.text.primary },
  emptyText: { ...typography.body, color: colors.text.secondary, textAlign: "center", marginTop: 5 },
  filterOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,24,40,0.35)" },
  filterSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  filterHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  filterTitle: { ...typography.bodyMedium, color: colors.text.primary },
  filterOption: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterOptionText: { ...typography.body, color: colors.text.primary },
});
