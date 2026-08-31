import {
  isBlockingAssignmentStatus,
  resolveAssignmentMemberDisplay,
} from "../../components/project/WorkPackageAssignmentsModal";
import { updateWorkPackage } from "../../store/workPackages";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type {
  WorkPackageAssignment,
  WorkPackageAssignmentStatus,
} from "../../types/workPackageAssignment";
import { formatAssignmentProgressStatusLabel } from "../assignmentProgress";
import type { MemberPresentationContext } from "./memberDisplay";

export type PlanItemAssignmentRowMeta = {
  workPackageId: string | null;
  workPackageName: string | null;
  assigneeLabel: string | null;
  hasActiveAssignment: boolean;
  assignmentStatus: WorkPackageAssignmentStatus | null;
  /** Row subtitle, e.g. "Electrical Rough-In · Contractor" or "Unassigned". */
  displayLabel: string;
};

export type PlanItemAssignmentMaps = {
  byPlanItemId: Map<string, PlanItemAssignmentRowMeta>;
  assignedPlanItemCount: number;
  unassignedPlanItemCount: number;
};

export type WorkPackageAssignmentSummary = {
  primaryAssignment: WorkPackageAssignment | null;
  assigneeLabel: string;
  assignmentStatusLabel: string;
  planItemCount: number;
};

function getPrimaryAssignment(
  assignments: WorkPackageAssignment[],
): WorkPackageAssignment | null {
  const active = assignments.filter(
    (item) => item.status !== "cancelled",
  );

  const blocking = active.find((item) =>
    isBlockingAssignmentStatus(item.status),
  );

  return blocking ?? active[0] ?? null;
}

function buildWorkPackageToPlanItemMap(
  workPackages: WorkPackage[],
): Map<string, WorkPackage> {
  const map = new Map<string, WorkPackage>();

  for (const workPackage of workPackages) {
    for (const planItemId of workPackage.planItemIds) {
      if (!map.has(planItemId)) {
        map.set(planItemId, workPackage);
      }
    }
  }

  return map;
}

function buildAssignmentsByWorkPackage(
  assignments: WorkPackageAssignment[],
): Map<string, WorkPackageAssignment[]> {
  const map = new Map<string, WorkPackageAssignment[]>();

  for (const assignment of assignments) {
    const list = map.get(assignment.workPackageId) ?? [];
    list.push(assignment);
    map.set(assignment.workPackageId, list);
  }

  return map;
}

export function summarizeWorkPackageAssignment(
  workPackage: WorkPackage,
  assignments: WorkPackageAssignment[],
  members: ProjectMember[],
  projectId: string,
): WorkPackageAssignmentSummary {
  const primary = getPrimaryAssignment(assignments);
  const assigneeLabel = primary
    ? resolveAssignmentMemberDisplay(
        projectId,
        primary.projectMemberId,
        members,
      ).roleLabel
    : "Unassigned";

  return {
    primaryAssignment: primary,
    assigneeLabel,
    assignmentStatusLabel: primary
      ? formatAssignmentProgressStatusLabel(primary.status)
      : "Unassigned",
    planItemCount: workPackage.planItemIds.length,
  };
}

export function buildPlanItemAssignmentMaps(
  planItemIds: readonly string[],
  workPackages: WorkPackage[],
  assignments: WorkPackageAssignment[],
  members: ProjectMember[],
  projectId: string,
  presentationContext?: MemberPresentationContext,
): PlanItemAssignmentMaps {
  const planItemToWorkPackage = buildWorkPackageToPlanItemMap(workPackages);
  const assignmentsByWorkPackage =
    buildAssignmentsByWorkPackage(assignments);

  const byPlanItemId = new Map<string, PlanItemAssignmentRowMeta>();
  let assignedPlanItemCount = 0;

  for (const planItemId of planItemIds) {
    const workPackage = planItemToWorkPackage.get(planItemId) ?? null;
    const packageAssignments = workPackage
      ? (assignmentsByWorkPackage.get(workPackage.id) ?? [])
      : [];
    const primary = workPackage
      ? getPrimaryAssignment(packageAssignments)
      : null;

    const assigneeDisplay = primary
      ? resolveAssignmentMemberDisplay(
          projectId,
          primary.projectMemberId,
          members,
          presentationContext,
        )
      : null;

    const hasActiveAssignment = primary != null;

    let displayLabel = "Unassigned";

    if (workPackage) {
      displayLabel = assigneeDisplay
        ? `${workPackage.name} · ${assigneeDisplay.label}`
        : `${workPackage.name} · Unassigned`;
    }

    if (hasActiveAssignment) {
      assignedPlanItemCount += 1;
    }

    byPlanItemId.set(planItemId, {
      workPackageId: workPackage?.id ?? null,
      workPackageName: workPackage?.name ?? null,
      assigneeLabel: assigneeDisplay?.label ?? null,
      hasActiveAssignment,
      assignmentStatus: primary?.status ?? null,
      displayLabel,
    });
  }

  return {
    byPlanItemId,
    assignedPlanItemCount,
    unassignedPlanItemCount: planItemIds.length - assignedPlanItemCount,
  };
}

/**
 * Persist plan item membership for one work package and remove duplicates elsewhere.
 */
export async function persistWorkPackagePlanItems(
  ownerUid: string,
  targetWorkPackageId: string,
  selectedPlanItemIds: string[],
  allWorkPackages: WorkPackage[],
): Promise<void> {
  const selected = new Set(selectedPlanItemIds);

  for (const workPackage of allWorkPackages) {
    if (workPackage.id === targetWorkPackageId) {
      continue;
    }

    const nextIds = workPackage.planItemIds.filter((id) => !selected.has(id));

    if (nextIds.length !== workPackage.planItemIds.length) {
      await updateWorkPackage(ownerUid, workPackage.id, {
        planItemIds: nextIds,
      });
    }
  }

  await updateWorkPackage(ownerUid, targetWorkPackageId, {
    planItemIds: selectedPlanItemIds,
  });
}
