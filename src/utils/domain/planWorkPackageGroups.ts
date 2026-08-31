import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import { isBlockingAssignmentStatus } from "../../components/project/WorkPackageAssignmentsModal";
import {
  type MemberPresentationContext,
  resolveMemberPresentation,
} from "./memberDisplay";
import {
  buildPlanItemAssignmentMaps,
  type PlanItemAssignmentRowMeta,
} from "./planItemAssignmentContext";

export type PlanListFilter =
  | "all"
  | "assigned"
  | "unassigned"
  | "measured"
  | "pending";

export const PLAN_LIST_FILTERS: readonly {
  id: PlanListFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned" },
  { id: "unassigned", label: "Unassigned" },
  { id: "measured", label: "Measured" },
  { id: "pending", label: "Pending" },
] as const;

export type WorkPackageAssigneePresentation = {
  nameLabel: string;
  roleLabel: string;
  hasAssignee: boolean;
};

export type PlanWorkPackageGroup = {
  key: string;
  workPackageId: string | null;
  title: string;
  assignee: WorkPackageAssigneePresentation;
  items: PlanItem[];
  measuredCount: number;
  pendingCount: number;
};

function getPrimaryAssignment(
  assignments: WorkPackageAssignment[],
): WorkPackageAssignment | null {
  const active = assignments.filter((item) => item.status !== "cancelled");
  const blocking = active.find((item) =>
    isBlockingAssignmentStatus(item.status),
  );
  return blocking ?? active[0] ?? null;
}

/**
 * Presentation-only assignee label. Does not change assignment identity.
 * Prefer real name/email when available; never invent personal names.
 */
export function resolveWorkPackageAssigneePresentation(input: {
  projectId: string;
  projectMemberId: string | null;
  members: ProjectMember[];
  /** Optional email keyed by Firebase userId from invitations (presentation). */
  emailByUserId?: ReadonlyMap<string, string>;
  /** Optional cloud profile keyed by Firebase userId (presentation). */
  profileByUserId?: ReadonlyMap<
    string,
    { displayName?: string | null; email?: string | null }
  >;
}): WorkPackageAssigneePresentation {
  if (!input.projectMemberId) {
    return {
      nameLabel: "No assignee",
      roleLabel: "Unassigned",
      hasAssignee: false,
    };
  }

  const context: MemberPresentationContext = {
    emailByUserId: input.emailByUserId,
    profileByUserId: input.profileByUserId,
  };

  const display = resolveMemberPresentation({
    projectId: input.projectId,
    projectMemberId: input.projectMemberId,
    members: input.members,
    context,
  });

  return {
    nameLabel: display.label,
    roleLabel: display.roleLabel,
    hasAssignee: true,
  };
}

function isPlanItemMeasured(
  planItemId: string,
  measurements: readonly Measurement[],
): boolean {
  return measurements.some((item) => item.planItemId === planItemId);
}

/**
 * Presentation filter applied AFTER authorization has already scoped planItems.
 */
export function filterPlanItemsForListFilter(input: {
  planItems: readonly PlanItem[];
  filter: PlanListFilter;
  measurements: readonly Measurement[];
  assignmentByPlanItemId: ReadonlyMap<string, PlanItemAssignmentRowMeta>;
}): PlanItem[] {
  const { planItems, filter, measurements, assignmentByPlanItemId } = input;

  if (filter === "all") {
    return [...planItems];
  }

  return planItems.filter((item) => {
    const meta = assignmentByPlanItemId.get(item.id);
    const measured = isPlanItemMeasured(item.id, measurements);

    switch (filter) {
      case "assigned":
        return meta?.hasActiveAssignment === true;
      case "unassigned":
        return meta?.hasActiveAssignment !== true;
      case "measured":
        return measured;
      case "pending":
        return !measured;
      default:
        return true;
    }
  });
}

/**
 * Group already-authorized plan items by Work Package for Plan tab UI.
 * Does not fetch, filter by permissions, or mutate domain records.
 */
export function buildPlanWorkPackageGroups(input: {
  planItems: readonly PlanItem[];
  workPackages: readonly WorkPackage[];
  assignments: readonly WorkPackageAssignment[];
  members: readonly ProjectMember[];
  projectId: string;
  measurements: readonly Measurement[];
  emailByUserId?: ReadonlyMap<string, string>;
  profileByUserId?: ReadonlyMap<
    string,
    { displayName?: string | null; email?: string | null }
  >;
}): PlanWorkPackageGroup[] {
  const {
    planItems,
    workPackages,
    assignments,
    members,
    projectId,
    measurements,
    emailByUserId,
    profileByUserId,
  } = input;

  const itemsById = new Map(planItems.map((item) => [item.id, item]));
  const assignmentsByWorkPackage = new Map<string, WorkPackageAssignment[]>();

  for (const assignment of assignments) {
    const list = assignmentsByWorkPackage.get(assignment.workPackageId) ?? [];
    list.push(assignment);
    assignmentsByWorkPackage.set(assignment.workPackageId, list);
  }

  const claimedIds = new Set<string>();
  const groups: PlanWorkPackageGroup[] = [];

  const sortedPackages = [...workPackages].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const workPackage of sortedPackages) {
    const items = workPackage.planItemIds
      .map((id) => itemsById.get(id))
      .filter((item): item is PlanItem => item != null)
      .sort((a, b) => a.label.localeCompare(b.label));

    if (items.length === 0) {
      continue;
    }

    for (const item of items) {
      claimedIds.add(item.id);
    }

    const primary = getPrimaryAssignment(
      assignmentsByWorkPackage.get(workPackage.id) ?? [],
    );

    const assignee = resolveWorkPackageAssigneePresentation({
      projectId,
      projectMemberId: primary?.projectMemberId ?? null,
      members: [...members],
      emailByUserId,
      profileByUserId,
    });

    const measuredCount = items.filter((item) =>
      isPlanItemMeasured(item.id, measurements),
    ).length;

    groups.push({
      key: workPackage.id,
      workPackageId: workPackage.id,
      title: workPackage.name,
      assignee,
      items,
      measuredCount,
      pendingCount: Math.max(items.length - measuredCount, 0),
    });
  }

  const unassignedItems = planItems
    .filter((item) => !claimedIds.has(item.id))
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));

  if (unassignedItems.length > 0) {
    const measuredCount = unassignedItems.filter((item) =>
      isPlanItemMeasured(item.id, measurements),
    ).length;

    groups.push({
      key: "__unassigned__",
      workPackageId: null,
      title: "Unassigned",
      assignee: {
        nameLabel: "No assignee",
        roleLabel: "Unassigned",
        hasAssignee: false,
      },
      items: unassignedItems,
      measuredCount,
      pendingCount: Math.max(unassignedItems.length - measuredCount, 0),
    });
  }

  return groups;
}

export function buildFilteredPlanWorkPackageGroups(input: {
  planItems: readonly PlanItem[];
  workPackages: readonly WorkPackage[];
  assignments: readonly WorkPackageAssignment[];
  members: readonly ProjectMember[];
  projectId: string;
  measurements: readonly Measurement[];
  filter: PlanListFilter;
  emailByUserId?: ReadonlyMap<string, string>;
  profileByUserId?: ReadonlyMap<
    string,
    { displayName?: string | null; email?: string | null }
  >;
}): PlanWorkPackageGroup[] {
  const assignmentMaps = buildPlanItemAssignmentMaps(
    input.planItems.map((item) => item.id),
    [...input.workPackages],
    [...input.assignments],
    [...input.members],
    input.projectId,
  );

  const filteredItems = filterPlanItemsForListFilter({
    planItems: input.planItems,
    filter: input.filter,
    measurements: input.measurements,
    assignmentByPlanItemId: assignmentMaps.byPlanItemId,
  });

  return buildPlanWorkPackageGroups({
    ...input,
    planItems: filteredItems,
  });
}
