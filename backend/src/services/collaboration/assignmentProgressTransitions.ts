/**
 * WorkPackageAssignment lifecycle transition policy (Phase 2K.1).
 *
 * Member transitions are narrow.
 * Owner retains administrative flexibility except cancelled is terminal.
 */

import type { WorkPackageAssignmentStatus } from "../../domain/workPackageAssignment.js";

const MEMBER_TRANSITIONS: ReadonlyMap<
  WorkPackageAssignmentStatus,
  ReadonlySet<WorkPackageAssignmentStatus>
> = new Map<
  WorkPackageAssignmentStatus,
  ReadonlySet<WorkPackageAssignmentStatus>
>([
  ["assigned", new Set<WorkPackageAssignmentStatus>(["accepted"])],
  ["accepted", new Set<WorkPackageAssignmentStatus>(["in_progress"])],
  ["in_progress", new Set<WorkPackageAssignmentStatus>(["ready_for_review"])],
  ["ready_for_review", new Set<WorkPackageAssignmentStatus>(["in_progress"])],
]);

/**
 * Contractor / field_member transitions on their own assignment.
 */
export function isMemberAllowedAssignmentTransition(
  from: WorkPackageAssignmentStatus,
  to: WorkPackageAssignmentStatus,
): boolean {
  if (from === to) {
    return true;
  }

  const allowed = MEMBER_TRANSITIONS.get(from);
  return allowed ? allowed.has(to) : false;
}

/**
 * Owner transitions.
 * Cancelled is terminal (only same-status idempotent).
 * Otherwise any valid target status is allowed (admin flexibility).
 */
export function isOwnerAllowedAssignmentTransition(
  from: WorkPackageAssignmentStatus,
  to: WorkPackageAssignmentStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (from === "cancelled") {
    return false;
  }

  return true;
}
