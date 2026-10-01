import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import { effectiveMeasurementReviewStatus } from "../measurementReview";
import {
  canMeasureAgainstPlanItem,
  getLatestMeasurementForPlanItem,
} from "./planItemFieldContext";

export type ProjectTodoKind =
  | "needs_assignment"
  | "awaiting_measurement"
  | "ready_for_review"
  | "needs_correction";

export type ProjectTodoScope = "mine" | "team" | "all";
export type ProjectTodoKindFilter = ProjectTodoKind | "all";

export type ProjectTodoItem = {
  id: string;
  kind: ProjectTodoKind;
  sourceType: "work_package" | "plan_item" | "assignment" | "measurement";
  title: string;
  context: string;
  reason: string;
  planItemId: string;
  workPackageId?: string;
  /** All canonical package paths containing this item, when there is more than one. */
  workPackageIds?: string[];
  assignmentId?: string;
  measurementId?: string;
};

export type ProjectTodoInput = {
  planItems: readonly PlanItem[];
  workPackages: readonly WorkPackage[];
  memberAssignments: readonly WorkPackageAssignment[];
  teamAssignments: readonly TeamWorkPackageAssignment[];
  measurements: readonly Measurement[];
  /** Set false when scoped Team assignment data could not be loaded. */
  assignmentDataComplete?: boolean;
  canManageAssignments?: boolean;
  canReviewMeasurements?: boolean;
};

const KIND_ORDER: Record<ProjectTodoKind, number> = {
  needs_correction: 0,
  ready_for_review: 1,
  awaiting_measurement: 2,
  needs_assignment: 3,
};

/**
 * Derive a compact action queue from already-loaded, already-authorized
 * project records. No result is persisted and no scheduling is inferred.
 */
export function deriveProjectTodos(input: ProjectTodoInput): ProjectTodoItem[] {
  const planItemsById = new Map<string, PlanItem>();
  for (const item of input.planItems) {
    if (item.id && !planItemsById.has(item.id)) planItemsById.set(item.id, item);
  }

  const results = new Map<string, ProjectTodoItem>();
  const conditionKeys = new Set<string>();
  const push = (item: ProjectTodoItem) => {
    const conditionKey = item.kind === "ready_for_review"
      ? `${item.kind}:${item.sourceType}:${item.assignmentId ?? item.measurementId ?? item.id}`
      : item.id;
    if (conditionKeys.has(conditionKey)) return;
    conditionKeys.add(conditionKey);
    results.set(item.id, item);
  };

  const packageByPlanItemId = new Map<string, WorkPackage>();
  const packageIdsByPlanItemId = new Map<string, string[]>();
  for (const workPackage of [...input.workPackages].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const planItemId of [...new Set(workPackage.planItemIds)]) {
      if (planItemsById.has(planItemId) && !packageByPlanItemId.has(planItemId)) {
        packageByPlanItemId.set(planItemId, workPackage);
      }
      if (planItemsById.has(planItemId)) {
        const packageIds = packageIdsByPlanItemId.get(planItemId) ?? [];
        if (!packageIds.includes(workPackage.id)) packageIds.push(workPackage.id);
        packageIdsByPlanItemId.set(planItemId, packageIds);
      }
    }
  }

  if (input.canManageAssignments !== false && input.assignmentDataComplete !== false) {
    const memberAssigned = new Set(
      input.memberAssignments
        .filter((assignment) => assignment.status !== "cancelled")
        .map((assignment) => assignment.workPackageId),
    );
    const teamAssigned = new Set(
      input.teamAssignments
        .filter((assignment) => assignment.status !== "cancelled")
        .map((assignment) => assignment.workPackageId),
    );

    for (const item of input.planItems) {
      if (!packageByPlanItemId.has(item.id)) {
        push({
          id: `needs_assignment:plan_item:${item.id}`,
          kind: "needs_assignment",
          sourceType: "plan_item",
          title: item.label,
          context: "Not in a work package",
          reason: "Needs assignment",
          planItemId: item.id,
        });
      }
    }

    for (const workPackage of input.workPackages) {
      if (workPackage.status === "completed" || workPackage.status === "cancelled") continue;
      const items = [...new Set(workPackage.planItemIds)]
        .map((id) => planItemsById.get(id))
        .filter((item): item is PlanItem => item !== undefined);
      if (
        items.length === 0 ||
        memberAssigned.has(workPackage.id) ||
        teamAssigned.has(workPackage.id)
      ) continue;

      push({
        id: `needs_assignment:work_package:${workPackage.id}`,
        kind: "needs_assignment",
        sourceType: "work_package",
        title: workPackage.name,
        context: `${items.length} ${items.length === 1 ? "Plan Item" : "Plan Items"}`,
        reason: "Needs assignment",
        planItemId: items[0].id,
        workPackageId: workPackage.id,
      });
    }
  }

  for (const assignment of input.memberAssignments) {
    if (input.canReviewMeasurements === false || assignment.status !== "ready_for_review") continue;
    const workPackage = input.workPackages.find((item) => item.id === assignment.workPackageId);
    const planItem = workPackage?.planItemIds
      .map((id) => planItemsById.get(id))
      .find((item): item is PlanItem => item !== undefined);
    if (!workPackage || !planItem) continue;
    push({
      id: `ready_for_review:assignment:${assignment.id}`,
      kind: "ready_for_review",
      sourceType: "assignment",
      title: workPackage.name,
      context: planItem.label,
      reason: "Ready for review",
      planItemId: planItem.id,
      workPackageId: workPackage.id,
      workPackageIds: [workPackage.id],
      assignmentId: assignment.id,
    });
  }

  for (const planItem of input.planItems) {
    const measurement = getLatestMeasurementForPlanItem(input.measurements, planItem.id) ?? undefined;
    if (measurement) {
      const reviewStatus = effectiveMeasurementReviewStatus(measurement.reviewStatus);
      const workPackage = packageByPlanItemId.get(planItem.id);
      if (reviewStatus === "pending" && input.canReviewMeasurements !== false) {
        push({
          id: `ready_for_review:measurement:${measurement.id}`,
          kind: "ready_for_review",
          sourceType: "measurement",
          title: planItem.label,
          context: workPackage?.name ?? "Unassigned",
          reason: "Ready for review",
          planItemId: planItem.id,
          ...(workPackage ? { workPackageId: workPackage.id } : {}),
          ...(workPackage
            ? { workPackageIds: packageIdsByPlanItemId.get(planItem.id) ?? [workPackage.id] }
            : {}),
          measurementId: measurement.id,
        });
      } else if (reviewStatus === "rejected") {
        push({
          id: `needs_correction:measurement:${measurement.id}`,
          kind: "needs_correction",
          sourceType: "measurement",
          title: planItem.label,
          context: workPackage?.name ?? "Unassigned",
          reason: "Needs correction",
          planItemId: planItem.id,
          ...(workPackage ? { workPackageId: workPackage.id } : {}),
          ...(workPackage ? { workPackageIds: packageIdsByPlanItemId.get(planItem.id) ?? [workPackage.id] } : {}),
          measurementId: measurement.id,
        });
      }
      continue;
    }

    if (canMeasureAgainstPlanItem(planItem)) {
      const workPackage = packageByPlanItemId.get(planItem.id);
      push({
        id: `awaiting_measurement:plan_item:${planItem.id}`,
        kind: "awaiting_measurement",
        sourceType: "plan_item",
        title: planItem.label,
        context: workPackage?.name ?? "Unassigned",
        reason: "Awaiting field measurement",
        planItemId: planItem.id,
        ...(workPackage ? { workPackageId: workPackage.id } : {}),
        ...(workPackage ? { workPackageIds: packageIdsByPlanItemId.get(planItem.id) ?? [workPackage.id] } : {}),
      });
    }
  }

  return [...results.values()].sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id),
  );
}

/**
 * Filter derived actions against already-authorized assignment data.
 * A Plan Item inherits responsibility through its containing Work Package.
 * Mine includes direct assignments and active Team responsibilities belonging
 * to the current member; Team includes visible active Team assignments only.
 */
export function filterProjectTodosByScope(input: {
  items: readonly ProjectTodoItem[];
  scope: ProjectTodoScope;
  memberAssignments: readonly WorkPackageAssignment[];
  teamAssignments: readonly TeamWorkPackageAssignment[];
  currentProjectMemberIds: readonly string[];
  activeTeamIds: readonly string[];
}): ProjectTodoItem[] {
  if (input.scope === "all") return [...input.items];

  const currentMemberIds = new Set(input.currentProjectMemberIds);
  const activeTeamIds = new Set(input.activeTeamIds);
  const directlyAssignedWorkPackageIds = new Set(
    input.memberAssignments
      .filter(
        (assignment) =>
          assignment.status !== "cancelled" &&
          currentMemberIds.has(assignment.projectMemberId),
      )
      .map((assignment) => assignment.workPackageId),
  );
  const teamAssignedWorkPackageIds = new Set(
    input.teamAssignments
      .filter(
        (assignment) =>
          assignment.status !== "cancelled" &&
          activeTeamIds.has(assignment.teamId),
      )
      .map((assignment) => assignment.workPackageId),
  );

  return input.items.filter((item) => {
    const workPackageIds = item.workPackageIds ?? (item.workPackageId ? [item.workPackageId] : []);
    if (workPackageIds.length === 0) return false;
    const direct = workPackageIds.some((id) => directlyAssignedWorkPackageIds.has(id));
    const team = workPackageIds.some((id) => teamAssignedWorkPackageIds.has(id));
    return input.scope === "mine" ? direct || team : team;
  });
}

export function filterProjectTodosByKind(
  items: readonly ProjectTodoItem[],
  kind: ProjectTodoKindFilter,
): ProjectTodoItem[] {
  return kind === "all" ? [...items] : items.filter((item) => item.kind === kind);
}
