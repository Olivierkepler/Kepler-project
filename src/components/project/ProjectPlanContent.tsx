import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import SharePlanItemSheet, {
  type SharePlanItemDestination,
} from "../chat/SharePlanItemSheet";
import type { RootStackParamList } from "../../navigation/types";
import type { Delta } from "../../types/delta";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  getLatestDeltaForPlanItem,
  getLatestMeasurementForPlanItem,
} from "../../utils/domain/planItemFieldContext";
import { buildPlanItemAssignmentMaps } from "../../utils/domain/planItemAssignmentContext";
import {
  buildPlanWorkPackageGroups,
  filterPlanItemsForListFilter,
} from "../../utils/domain/planWorkPackageGroups";
import {
  resolveSharePlanItemDestination,
  SharePlanItemFlowError,
} from "../../utils/domain/sharePlanItemFlow";
import PlanItemCard from "./PlanItemCard";
import WorkPackageImage from "./WorkPackageImage";
import PlanSearchFilterControls, {
  type PlanAssignmentFilter,
  type PlanStatusFilter,
} from "./PlanSearchFilterControls";
import { searchPlanWorkPackageGroups } from "../../utils/domain/planWorkPackageSearch";
import { useAuth } from "../../auth/AuthProvider";
import { colors, typography } from "../../theme/colors";

export type ProjectPlanContentProps = {
  plannedItems: PlanItem[];
  isShared?: boolean;
  showAssignedScopeEmpty?: boolean;
  onOpenPlan?: () => void;
  onOpenPlanItem?: (planItemId: string) => void;
  workPackages?: WorkPackage[];
  assignments?: WorkPackageAssignment[];
  members?: ProjectMember[];
  measurements?: Measurement[];
  deltas?: Delta[];
  projectId?: string;
  projectName?: string;
  profileByUserId?: ReadonlyMap<
    string,
    { displayName?: string | null; email?: string | null }
  >;
};

/**
 * Presentational Plan overview for ProjectScreen tabs.
 * Data and navigation are owned by the parent — no store/API writes here.
 */
export default function ProjectPlanContent({
  plannedItems,
  isShared = false,
  showAssignedScopeEmpty = false,
  onOpenPlan,
  onOpenPlanItem,
  workPackages = [],
  assignments = [],
  members = [],
  measurements = [],
  deltas = [],
  projectId = "",
  projectName = "Project",
  profileByUserId,
}: ProjectPlanContentProps) {
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isEmpty = plannedItems.length === 0;
  const canEdit = !isShared && typeof onOpenPlan === "function";
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>("all");
  const [assignmentFilter, setAssignmentFilter] =
    useState<PlanAssignmentFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const emptyDescription = showAssignedScopeEmpty
    ? "No work has been assigned to you yet."
    : isShared
      ? "No plan items on this shared project yet."
      : "No plan items yet. Set the quantities and targets field work will be measured against.";

  const assignmentMaps = useMemo(
    () =>
      buildPlanItemAssignmentMaps(
        plannedItems.map((item) => item.id),
        workPackages,
        assignments,
        members,
        projectId,
      ),
    [assignments, members, plannedItems, projectId, workPackages],
  );

  const workPackageGroups = useMemo(() => {
    const statusMatchedItems = filterPlanItemsForListFilter({
      planItems: plannedItems,
      filter: statusFilter,
      measurements,
      assignmentByPlanItemId: assignmentMaps.byPlanItemId,
    });
    const visibleItems = filterPlanItemsForListFilter({
      planItems: statusMatchedItems,
      filter: assignmentFilter,
      measurements,
      assignmentByPlanItemId: assignmentMaps.byPlanItemId,
    });
    const groups = buildPlanWorkPackageGroups({
      planItems: visibleItems,
      workPackages,
      assignments,
      members,
      projectId,
      measurements,
      profileByUserId,
    });
    return searchPlanWorkPackageGroups(groups, searchText, measurements);
  }, [
    assignmentFilter,
    assignmentMaps.byPlanItemId,
    assignments,
    measurements,
    members,
    plannedItems,
    profileByUserId,
    projectId,
    searchText,
    statusFilter,
    workPackages,
  ]);

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const measuredCount = useMemo(
    () =>
      plannedItems.filter((item) =>
        Boolean(getLatestMeasurementForPlanItem(measurements, item.id)),
      ).length,
    [measurements, plannedItems],
  );

  const pendingCount = Math.max(plannedItems.length - measuredCount, 0);

  const openShareSheet = useCallback(
    (planItemId: string, planItemLabel: string) => {
      setShareError(null);
      setShareTarget({ id: planItemId, label: planItemLabel });
      setShareSheetVisible(true);
    },
    [],
  );

  const closeShareSheet = useCallback(() => {
    setShareSheetVisible(false);
    setShareTarget(null);
    setShareError(null);
  }, []);

  const handleShareDestination = useCallback(
    async (destination: SharePlanItemDestination) => {
      if (!user?.uid || !shareTarget || sharing || !projectId) {
        return;
      }

      setSharing(true);
      setShareError(null);

      try {
        const chatParams = await resolveSharePlanItemDestination({
          ownerUid: user.uid,
          projectId,
          planItemId: shareTarget.id,
          planItemLabel: shareTarget.label,
          projectName,
          isShared: true,
          remoteProjectId: projectId,
          remotePlanItemId: shareTarget.id,
          destination,
        });

        closeShareSheet();
        navigation.navigate("ProjectChat", chatParams);
      } catch (err) {
        setShareError(
          err instanceof SharePlanItemFlowError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to share Plan Item.",
        );
      } finally {
        setSharing(false);
      }
    },
    [
      closeShareSheet,
      navigation,
      projectId,
      projectName,
      shareTarget,
      sharing,
      user?.uid,
    ],
  );

  return (
    <View style={styles.wrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PlanSearchFilterControls
        searchText={searchText}
        onSearchTextChange={setSearchText}
        statusFilter={statusFilter}
        assignmentFilter={assignmentFilter}
        allowUnassigned={!isShared}
        onApply={(status, assignment) => {
          setStatusFilter(status);
          setAssignmentFilter(assignment);
        }}
      />

      <View
        style={styles.summaryRow}
        accessibilityLabel={`${plannedItems.length} plan items, ${workPackages.length} work packages, ${measuredCount} measured, ${pendingCount} pending`}
      >
        <Text style={styles.summaryMetric}>
          {plannedItems.length} plan {plannedItems.length === 1 ? "item" : "items"}
        </Text>
        <Text style={styles.summaryDot}>·</Text>
        <Text style={styles.summaryMetric}>
          {workPackages.length} work {workPackages.length === 1 ? "package" : "packages"}
        </Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>{emptyDescription}</Text>
          {canEdit ? (
            <Pressable
              style={styles.primaryButton}
              onPress={onOpenPlan}
              accessibilityRole="button"
              accessibilityLabel="Set up project plan"
            >
              <Text style={styles.primaryButtonText}>Set up Plan</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.listBlock}>
          <Text style={styles.listHeading}>Work packages</Text>

          {workPackageGroups.length === 0 ? (
            <View style={styles.filteredEmpty}>
              <Text style={styles.emptyText}>No matching plan items</Text>
              <Text style={styles.filteredEmptyHint}>
                Try adjusting your search or filters.
              </Text>
            </View>
          ) : (
            workPackageGroups.map((group) => {
              const collapsed = collapsedGroupKeys.has(group.key);
              const itemCountLabel = `${group.items.length} plan ${
                group.items.length === 1 ? "item" : "items"
              }`;
              const assignmentLine = group.assignee.hasAssignee
                ? group.assignee.nameLabel === "Assigned member" &&
                  group.assignee.roleLabel.trim()
                  ? `Assigned · ${group.assignee.roleLabel}`
                  : `Assigned to ${group.assignee.nameLabel}`
                : "";

              return (
                <View key={group.key} style={styles.packageGroup}>
                  <Pressable
                    onPress={() => toggleGroupCollapsed(group.key)}
                    style={styles.packageHeader}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.title}, ${itemCountLabel}${assignmentLine ? `, ${assignmentLine}` : ""}`}
                    accessibilityState={{ expanded: !collapsed }}
                  >
                    <Ionicons
                      name={collapsed ? "chevron-forward" : "chevron-down"}
                      size={18}
                      color="#667085"
                    />
                    <WorkPackageImage
                      uri={
                        group.workPackageId
                          ? workPackages.find(
                              (item) => item.id === group.workPackageId,
                            )?.imageUrl
                          : undefined
                      }
                      size={36}
                      radius={9}
                    />
                    <View style={styles.packageHeaderText}>
                      <Text style={styles.packageTitle} numberOfLines={2}>
                        {group.title}
                      </Text>
                      <Text style={styles.packageAssignee} numberOfLines={1}>
                        {itemCountLabel}{assignmentLine ? ` · ${assignmentLine}` : ""}
                      </Text>
                      <Text style={styles.packageSummary}>
                        {group.measuredCount} measured · {group.pendingCount}{" "}
                        pending
                      </Text>
                    </View>
                  </Pressable>

                  {!collapsed
                    ? group.items.map((item, index) => (
                        <PlanItemCard
                          key={item.id}
                          item={item}
                          latestMeasurement={getLatestMeasurementForPlanItem(
                            measurements,
                            item.id,
                          )}
                          latestDelta={getLatestDeltaForPlanItem(
                            deltas,
                            item.id,
                          )}
                          assignment={
                            assignmentMaps.byPlanItemId.get(item.id) ?? null
                          }
                          showAssignmentMeta
                          showExecutionDetails={false}
                          onView={
                            onOpenPlanItem
                              ? () => onOpenPlanItem(item.id)
                              : undefined
                          }
                          onShare={() =>
                            openShareSheet(item.id, item.label)
                          }
                          readOnly={isShared}
                          showDivider={index !== group.items.length - 1}
                        />
                      ))
                    : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {canEdit && !isEmpty ? (
        <Pressable
          style={styles.primaryButton}
          onPress={onOpenPlan}
          accessibilityRole="button"
          accessibilityLabel="View and edit project plan"
        >
          <Text style={styles.primaryButtonText}>View & edit Plan</Text>
        </Pressable>
      ) : null}

      {isShared ? (
        <Text style={styles.sharedNotice}>
          Shared project plan is read-only. Editing stays with the project
          owner.
        </Text>
      ) : null}
    </ScrollView>

    {shareError ? (
      <View style={styles.shareErrorBanner}>
        <Text style={styles.shareErrorText}>{shareError}</Text>
      </View>
    ) : null}

    <SharePlanItemSheet
      visible={shareSheetVisible}
      remoteProjectId={projectId || null}
      projectName={projectName}
      planItemLabel={shareTarget?.label ?? ""}
      onClose={closeShareSheet}
      onSelect={(destination) => {
        void handleShareDestination(destination);
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,

  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    
  },
  eyebrow: {
    ...typography.caption,
    color: colors.text.muted,
    letterSpacing: 1.4,
  },
  title: {
    ...typography.title,
    color: colors.text.primary,
    marginTop: 8,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 8,
  },
  summaryRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  summaryMetric: {
    ...typography.caption,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  summaryDot: {
    ...typography.caption,
    color: colors.text.muted,
  },
  summaryCard: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    gap: 16,
  },
  summaryColumn: {
    flex: 1,
  },
  summaryLabel: {
    ...typography.metadata,
    color: colors.text.muted,
  },
  summaryValue: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    marginTop: 6,
  },
  emptyBlock: {
    marginTop: 24,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  listBlock: {
    marginTop: 24,
  },
  listHeading: {
    ...typography.sectionTitle,
    color: colors.brand.navy,
    marginBottom: 12,
  },
  filteredEmpty: {
    paddingVertical: 20,
    alignItems: "center",
  },
  filteredEmptyHint: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 4,
    textAlign: "center",
  },
  packageGroup: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  packageHeader: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#FAFBFC",
  },
  packageHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  packageTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    minWidth: 0,
    fontWeight: "700",
  },
  packageAssignee: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 3,
  },
  packageSummary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  primaryButton: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    ...typography.button,
    color: "#FFFFFF",
  },
  sharedNotice: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 20,
  },
  shareErrorBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(227,24,55,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(227,24,55,0.18)",
  },
  shareErrorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
