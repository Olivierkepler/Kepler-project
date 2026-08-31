import type { ActivityEvent } from "../../domain/activityEvent.js";
import {
  VIEWER_VISIBLE_ACTIVITY_TYPES,
} from "../../domain/activityEvent.js";
import type { ProjectAccessContext } from "../collaboration/projectAccessScope.js";

/**
 * Role-aware Activity visibility (Phase 2M.1).
 * Filtering is server-side only.
 */
export function isActivityVisibleToAccess(
  activity: ActivityEvent,
  access: ProjectAccessContext,
  options?: { currentUserMeasurementIds?: ReadonlySet<string> },
): boolean {
  if (access.role === "viewer") {
    return VIEWER_VISIBLE_ACTIVITY_TYPES.has(activity.type);
  }

  if (access.accessMode === "full") {
    return true;
  }

  // contractor / field_member assigned_scope
  const assignedWp = new Set(access.assignedWorkPackageIds);
  const assignedPlan = new Set(access.assignedPlanItemIds);

  const scopeWp = activity.scopeWorkPackageIds ?? [];
  const scopePlan = activity.scopePlanItemIds ?? [];

  for (const id of scopeWp) {
    if (assignedWp.has(id)) {
      return true;
    }
  }

  for (const id of scopePlan) {
    if (assignedPlan.has(id)) {
      return true;
    }
  }

  // Own contribution review outcomes (contributor may have empty current scope)
  if (
    (activity.type === "measurement_accepted" ||
      activity.type === "measurement_rejected") &&
    options?.currentUserMeasurementIds?.has(activity.subjectId)
  ) {
    return true;
  }

  if (
    activity.type === "measurement_submitted" &&
    activity.actorType === "human" &&
    activity.actorUid === access.currentUserId
  ) {
    return true;
  }

  return false;
}

export function filterActivityEventsForAccess(
  items: readonly ActivityEvent[],
  access: ProjectAccessContext,
  options?: { currentUserMeasurementIds?: ReadonlySet<string> },
): ActivityEvent[] {
  return items.filter((item) =>
    isActivityVisibleToAccess(item, access, options),
  );
}
