import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors, typography } from "../../theme/colors";
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
  buildFilteredPlanWorkPackageGroups,
  PLAN_LIST_FILTERS,
  type PlanListFilter,
} from "../../utils/domain/planWorkPackageGroups";
import PlanItemCard from "./PlanItemCard";

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
  profileByUserId,
}: ProjectPlanContentProps) {
  const isEmpty = plannedItems.length === 0;
  const canEdit = !isShared && typeof onOpenPlan === "function";
  const [listFilter, setListFilter] = useState<PlanListFilter>("all");
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );

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

  const workPackageGroups = useMemo(
    () =>
      buildFilteredPlanWorkPackageGroups({
        planItems: plannedItems,
        workPackages,
        assignments,
        members,
        projectId,
        measurements,
        filter: listFilter,
        profileByUserId,
      }),
    [
      assignments,
      listFilter,
      measurements,
      members,
      plannedItems,
      profileByUserId,
      projectId,
      workPackages,
    ],
  );

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>PROJECT PLAN</Text>
      <Text style={styles.title}>
        {isShared ? "Your assigned work" : "What the field is measured against."}
      </Text>
      <Text style={styles.description}>
        {isShared
          ? "Plan items in your assigned work packages for field comparison."
          : "Quantities and targets form the baseline BuildSigma compares against field reality."}
      </Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>PLANNED</Text>
          <Text style={styles.summaryValue}>{plannedItems.length}</Text>
        </View>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>MEASURED</Text>
          <Text style={styles.summaryValue}>{measuredCount}</Text>
        </View>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>PENDING</Text>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
        </View>
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            accessibilityRole="tablist"
          >
            {PLAN_LIST_FILTERS.filter((filter) =>
              isShared ? filter.id !== "unassigned" : true,
            ).map((filter) => {
              const selected = listFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => setListFilter(filter.id)}
                  style={[
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel={filter.label}
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected && styles.filterChipTextSelected,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {workPackageGroups.length === 0 ? (
            <Text style={styles.emptyText}>
              No plan items match this filter.
            </Text>
          ) : (
            workPackageGroups.map((group) => {
              const collapsed = collapsedGroupKeys.has(group.key);
              const itemCountLabel = `${group.items.length} ${
                group.items.length === 1 ? "item" : "items"
              }`;

              return (
                <View key={group.key} style={styles.packageGroup}>
                  <Pressable
                    onPress={() => toggleGroupCollapsed(group.key)}
                    style={styles.packageHeader}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.title}, ${itemCountLabel}, ${group.assignee.nameLabel}`}
                    accessibilityState={{ expanded: !collapsed }}
                  >
                    <View style={styles.packageHeaderText}>
                      <View style={styles.packageTitleRow}>
                        <Text style={styles.packageTitle} numberOfLines={2}>
                          {group.title}
                        </Text>
                        <Text style={styles.packageCount}>
                          {itemCountLabel}
                        </Text>
                      </View>
                      <Text style={styles.packageAssignee} numberOfLines={1}>
                        {group.assignee.nameLabel}
                      </Text>
                      <Text style={styles.packageRole}>
                        {group.assignee.roleLabel}
                      </Text>
                      <Text style={styles.packageSummary}>
                        {group.measuredCount} measured · {group.pendingCount}{" "}
                        pending
                      </Text>
                    </View>
                    <Ionicons
                      name={collapsed ? "chevron-forward" : "chevron-down"}
                      size={18}
                      color="#98A2B3"
                    />
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
                          showAssignmentMeta={false}
                          onPress={
                            onOpenPlanItem
                              ? () => onOpenPlanItem(item.id)
                              : undefined
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
  );
}

const styles = StyleSheet.create({
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
  filterRow: {
    gap: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipSelected: {
    borderColor: colors.brand.navy,
    backgroundColor: "#F5F7FB",
  },
  filterChipText: {
    ...typography.caption,
    color: colors.text.muted,
  },
  filterChipTextSelected: {
    color: colors.brand.navy,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FAFBFC",
  },
  packageHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  packageTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  packageTitle: {
    ...typography.bodyMedium,
    color: colors.text.primary,
    flex: 1,
    minWidth: 0,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  packageCount: {
    ...typography.caption,
    color: colors.text.muted,
  },
  packageAssignee: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: 6,
  },
  packageRole: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 2,
  },
  packageSummary: {
    ...typography.caption,
    color: colors.text.muted,
    marginTop: 6,
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
});
