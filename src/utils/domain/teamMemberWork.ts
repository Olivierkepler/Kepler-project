import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type {
  WorkPackageAssignment,
  WorkPackageAssignmentStatus,
} from "../../types/workPackageAssignment";

export type TeamProjectWorkMaps = {
  assignmentsByMemberId: Map<string, WorkPackageAssignment[]>;
  workPackagesById: Map<string, WorkPackage>;
  planItemsById: Map<string, PlanItem>;
};

export type TeamMemberWorkSummary = {
  projectMemberId: string;
  workPackageCount: number;
  planItemCount: number;
  measuredCount: number;
  pendingCount: number;
  workPackageLabel: string;
  hasAssignedWork: boolean;
};

export type TeamMemberWorkPackageGroup = {
  workPackageId: string;
  workPackageName: string;
  assignmentId: string;
  assignmentStatus: WorkPackageAssignmentStatus;
  items: PlanItem[];
  measuredCount: number;
  pendingCount: number;
};

export type TeamMemberWorkDetail = {
  member: ProjectMember;
  summary: TeamMemberWorkSummary;
  workPackageGroups: TeamMemberWorkPackageGroup[];
};

function isPlanItemMeasured(
  planItemId: string,
  measurements: readonly Measurement[],
): boolean {
  return measurements.some((item) => item.planItemId === planItemId);
}

function countMeasuredPending(
  planItemIds: readonly string[],
  measurements: readonly Measurement[],
): { measuredCount: number; pendingCount: number } {
  let measuredCount = 0;

  for (const planItemId of planItemIds) {
    if (isPlanItemMeasured(planItemId, measurements)) {
      measuredCount += 1;
    }
  }

  const pendingCount = Math.max(planItemIds.length - measuredCount, 0);
  return { measuredCount, pendingCount };
}

/**
 * Active assignments exclude cancelled records only.
 */
export function isActiveWorkPackageAssignment(
  assignment: WorkPackageAssignment,
): boolean {
  return assignment.status !== "cancelled";
}

export function buildTeamProjectWorkMaps(input: {
  workPackages: readonly WorkPackage[];
  assignments: readonly WorkPackageAssignment[];
  planItems: readonly PlanItem[];
}): TeamProjectWorkMaps {
  const workPackagesById = new Map(
    input.workPackages.map((item) => [item.id, item] as const),
  );
  const planItemsById = new Map(
    input.planItems.map((item) => [item.id, item] as const),
  );
  const assignmentsByMemberId = new Map<string, WorkPackageAssignment[]>();

  for (const assignment of input.assignments) {
    if (!isActiveWorkPackageAssignment(assignment)) {
      continue;
    }

    const list = assignmentsByMemberId.get(assignment.projectMemberId) ?? [];
    list.push(assignment);
    assignmentsByMemberId.set(assignment.projectMemberId, list);
  }

  for (const [memberId, memberAssignments] of assignmentsByMemberId) {
    assignmentsByMemberId.set(
      memberId,
      [...memberAssignments].sort((a, b) =>
        a.workPackageId.localeCompare(b.workPackageId),
      ),
    );
  }

  return {
    assignmentsByMemberId,
    workPackagesById,
    planItemsById,
  };
}

export function formatWorkPackageNamesSummary(names: readonly string[]): string {
  const unique = [...new Set(names.map((item) => item.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return "";
  }

  if (unique.length === 1) {
    return unique[0]!;
  }

  return `${unique[0]!} + ${unique.length - 1} more`;
}

function collectAssignedPlanItemIds(
  assignments: readonly WorkPackageAssignment[],
  workPackagesById: ReadonlyMap<string, WorkPackage>,
): string[] {
  const ids = new Set<string>();

  for (const assignment of assignments) {
    const workPackage = workPackagesById.get(assignment.workPackageId);
    if (!workPackage) {
      continue;
    }

    for (const planItemId of workPackage.planItemIds) {
      ids.add(planItemId);
    }
  }

  return [...ids];
}

export function buildTeamMemberWorkSummary(input: {
  projectMemberId: string;
  maps: TeamProjectWorkMaps;
  measurements: readonly Measurement[];
}): TeamMemberWorkSummary {
  const assignments =
    input.maps.assignmentsByMemberId.get(input.projectMemberId) ?? [];

  const workPackageNames: string[] = [];
  const planItemIds = collectAssignedPlanItemIds(
    assignments,
    input.maps.workPackagesById,
  );

  for (const assignment of assignments) {
    const workPackage = input.maps.workPackagesById.get(assignment.workPackageId);
    if (workPackage) {
      workPackageNames.push(workPackage.name);
    }
  }

  const { measuredCount, pendingCount } = countMeasuredPending(
    planItemIds,
    input.measurements,
  );

  return {
    projectMemberId: input.projectMemberId,
    workPackageCount: assignments.length,
    planItemCount: planItemIds.length,
    measuredCount,
    pendingCount,
    workPackageLabel: formatWorkPackageNamesSummary(workPackageNames),
    hasAssignedWork: assignments.length > 0,
  };
}

export function buildTeamMemberWorkSummaries(input: {
  members: readonly ProjectMember[];
  maps: TeamProjectWorkMaps;
  measurements: readonly Measurement[];
}): Map<string, TeamMemberWorkSummary> {
  const summaries = new Map<string, TeamMemberWorkSummary>();

  for (const member of input.members) {
    summaries.set(
      member.id,
      buildTeamMemberWorkSummary({
        projectMemberId: member.id,
        maps: input.maps,
        measurements: input.measurements,
      }),
    );
  }

  return summaries;
}

export function buildTeamMemberWorkDetail(input: {
  member: ProjectMember;
  maps: TeamProjectWorkMaps;
  measurements: readonly Measurement[];
}): TeamMemberWorkDetail {
  const assignments =
    input.maps.assignmentsByMemberId.get(input.member.id) ?? [];
  const summary = buildTeamMemberWorkSummary({
    projectMemberId: input.member.id,
    maps: input.maps,
    measurements: input.measurements,
  });

  const workPackageGroups: TeamMemberWorkPackageGroup[] = [];

  for (const assignment of assignments) {
    const workPackage = input.maps.workPackagesById.get(assignment.workPackageId);

    if (!workPackage) {
      continue;
    }

    const items = workPackage.planItemIds
      .map((id) => input.maps.planItemsById.get(id))
      .filter((item): item is PlanItem => item != null)
      .sort((a, b) => a.label.localeCompare(b.label));

    const { measuredCount, pendingCount } = countMeasuredPending(
      items.map((item) => item.id),
      input.measurements,
    );

    workPackageGroups.push({
      workPackageId: workPackage.id,
      workPackageName: workPackage.name,
      assignmentId: assignment.id,
      assignmentStatus: assignment.status,
      items,
      measuredCount,
      pendingCount,
    });
  }

  workPackageGroups.sort((a, b) =>
    a.workPackageName.localeCompare(b.workPackageName),
  );

  return {
    member: input.member,
    summary,
    workPackageGroups,
  };
}

export function formatTeamMemberWorkLine(summary: TeamMemberWorkSummary): string {
  if (!summary.hasAssignedWork) {
    return "No work assigned yet";
  }

  const itemLabel = `${summary.planItemCount} plan item${
    summary.planItemCount === 1 ? "" : "s"
  }`;

  if (summary.planItemCount === 0) {
    return summary.workPackageLabel || "Assigned work package";
  }

  return `${itemLabel} · ${summary.measuredCount} measured`;
}
