/**
 * Assignment-aware project READ access (Phase 2H.1).
 *
 * Extends Phase 1I membership gate with role → accessMode and assigned scope.
 * Discoverability ≠ read authorization ≠ write permission.
 * Empty assigned scope NEVER becomes full access.
 */

import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { Delta } from "../../domain/delta.js";
import type { Evidence } from "../../domain/evidence.js";
import type { Measurement } from "../../domain/measurement.js";
import type { PlanItem } from "../../domain/planItem.js";
import type { Project } from "../../domain/project.js";
import type {
  ProjectMember,
  ProjectMemberRole,
} from "../../domain/projectMember.js";
import type { WorkPackage } from "../../domain/workPackage.js";
import {
  BLOCKING_ASSIGNMENT_STATUSES,
  type WorkPackageAssignment,
} from "../../domain/workPackageAssignment.js";
import { getProjectMember } from "../../repositories/projectMembersRepository.js";
import { getProjectById } from "../../repositories/projectsRepository.js";
import { listWorkPackageAssignmentsForProject } from "../../repositories/workPackageAssignmentsRepository.js";
import { getWorkPackagesByIds } from "../../repositories/workPackagesRepository.js";

export type ProjectAccessMode = "full" | "assigned_scope";

export type ProjectAccessRole = ProjectMemberRole | "legacy_owner";

export type ProjectAccessContext = {
  project: Project;
  currentUserId: string;
  isOwner: boolean;
  membership: ProjectMember | null;
  role: ProjectAccessRole;
  accessMode: ProjectAccessMode;
  assignedWorkPackageIds: readonly string[];
  assignedPlanItemIds: readonly string[];
};

const SCOPE_CONTRIBUTING_ASSIGNMENT_STATUSES: ReadonlySet<string> = new Set(
  BLOCKING_ASSIGNMENT_STATUSES,
);

function accessModeForRole(role: ProjectAccessRole): ProjectAccessMode {
  if (
    role === "legacy_owner" ||
    role === "owner" ||
    role === "project_admin" ||
    role === "viewer"
  ) {
    return "full";
  }

  // contractor / field_member (and any unexpected role): fail closed to scope
  return "assigned_scope";
}

async function resolveAssignedScope(input: {
  projectId: string;
  membershipId: string;
}): Promise<{
  assignedWorkPackageIds: string[];
  assignedPlanItemIds: string[];
}> {
  const assignments = await listWorkPackageAssignmentsForProject(
    input.projectId,
  );

  const candidateWorkPackageIds = [
    ...new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.projectMemberId === input.membershipId &&
            SCOPE_CONTRIBUTING_ASSIGNMENT_STATUSES.has(assignment.status),
        )
        .map((assignment) => assignment.workPackageId),
    ),
  ];

  if (candidateWorkPackageIds.length === 0) {
    return { assignedWorkPackageIds: [], assignedPlanItemIds: [] };
  }

  const workPackages = await getWorkPackagesByIds(candidateWorkPackageIds);
  const assignedWorkPackageIds: string[] = [];
  const planItemIdSet = new Set<string>();

  for (const workPackage of workPackages) {
    if (workPackage.projectId !== input.projectId) {
      continue;
    }

    if (workPackage.status === "cancelled") {
      continue;
    }

    assignedWorkPackageIds.push(workPackage.id);

    for (const planItemId of workPackage.planItemIds) {
      const trimmed = planItemId.trim();
      if (trimmed) {
        planItemIdSet.add(trimmed);
      }
    }
  }

  assignedWorkPackageIds.sort((a, b) => a.localeCompare(b));

  return {
    assignedWorkPackageIds,
    assignedPlanItemIds: [...planItemIdSet].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Membership-aware READ authorization with assignment scope (Phase 2H.1).
 *
 * Same gate as assertProjectReadableByUser, plus role → accessMode and
 * assigned WorkPackage / PlanItem id sets for contractor / field_member.
 */
export async function assertProjectAccessContext(
  projectId: string,
  uid: string,
): Promise<ProjectAccessContext> {
  if (!uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const trimmedProjectId = projectId.trim();
  const currentUserId = uid.trim();

  if (!trimmedProjectId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const project = await getProjectById(trimmedProjectId);

  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (project.ownerUid === currentUserId) {
    const membership = await getProjectMember(trimmedProjectId, currentUserId);
    const activeMembership =
      membership && membership.status === "active" ? membership : null;
    const role: ProjectAccessRole =
      activeMembership?.role === "owner" ? "owner" : "legacy_owner";

    return {
      project,
      currentUserId,
      isOwner: true,
      membership: activeMembership,
      role,
      accessMode: "full",
      assignedWorkPackageIds: [],
      assignedPlanItemIds: [],
    };
  }

  const membership = await getProjectMember(trimmedProjectId, currentUserId);

  if (!membership || membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  const role: ProjectAccessRole = membership.role;
  const accessMode = accessModeForRole(role);

  if (accessMode === "full") {
    return {
      project,
      currentUserId,
      isOwner: false,
      membership,
      role,
      accessMode,
      assignedWorkPackageIds: [],
      assignedPlanItemIds: [],
    };
  }

  const scope = await resolveAssignedScope({
    projectId: trimmedProjectId,
    membershipId: membership.id,
  });

  return {
    project,
    currentUserId,
    isOwner: false,
    membership,
    role,
    accessMode,
    assignedWorkPackageIds: scope.assignedWorkPackageIds,
    assignedPlanItemIds: scope.assignedPlanItemIds,
  };
}

export function filterPlanItemsForAccess(
  items: readonly PlanItem[],
  access: ProjectAccessContext,
): PlanItem[] {
  if (access.accessMode === "full") {
    return [...items];
  }

  const allowed = new Set(access.assignedPlanItemIds);
  return items.filter((item) => allowed.has(item.id));
}

export function filterMeasurementsForAccess(
  items: readonly Measurement[],
  access: ProjectAccessContext,
): Measurement[] {
  if (access.accessMode === "full") {
    return [...items];
  }

  const allowed = new Set(access.assignedPlanItemIds);
  return items.filter((item) => allowed.has(item.planItemId));
}

export function filterDeltasForAccess(
  items: readonly Delta[],
  access: ProjectAccessContext,
): Delta[] {
  if (access.accessMode === "full") {
    return [...items];
  }

  const allowed = new Set(access.assignedPlanItemIds);
  return items.filter((item) => allowed.has(item.planItemId));
}

export function filterWorkPackagesForAccess(
  items: readonly WorkPackage[],
  access: ProjectAccessContext,
): WorkPackage[] {
  if (access.accessMode === "full") {
    return [...items];
  }

  const allowed = new Set(access.assignedWorkPackageIds);
  return items.filter((item) => allowed.has(item.id));
}

/**
 * Assignment list policy (Phase 2H):
 * - full owner/admin: all
 * - viewer: []
 * - assigned_scope: assignments on assigned WorkPackages only
 */
export function filterAssignmentsForAccess(
  items: readonly WorkPackageAssignment[],
  access: ProjectAccessContext,
): WorkPackageAssignment[] {
  if (access.role === "viewer") {
    return [];
  }

  if (access.accessMode === "full") {
    return [...items];
  }

  const allowed = new Set(access.assignedWorkPackageIds);
  return items.filter((item) => allowed.has(item.workPackageId));
}

/**
 * Evidence scoped by local Measurement/Delta → remote planItemId join.
 * Unresolved / unlinked Evidence is excluded (fail closed).
 */
export function filterEvidenceForAccess(
  items: readonly Evidence[],
  measurements: readonly Measurement[],
  deltas: readonly Delta[],
  access: ProjectAccessContext,
): Evidence[] {
  if (access.accessMode === "full") {
    return [...items];
  }

  const allowedPlanItems = new Set(access.assignedPlanItemIds);
  const measurementByLocalId = new Map<string, Measurement>();
  const deltaByLocalId = new Map<string, Delta>();

  for (const measurement of measurements) {
    if (measurement.projectId !== access.project.id) {
      continue;
    }
    measurementByLocalId.set(measurement.localMeasurementId, measurement);
  }

  for (const delta of deltas) {
    if (delta.projectId !== access.project.id) {
      continue;
    }
    deltaByLocalId.set(delta.localDeltaId, delta);
  }

  const included: Evidence[] = [];

  for (const evidence of items) {
    if (evidence.projectId !== access.project.id) {
      continue;
    }

    const localMeasurementId = evidence.localMeasurementId;
    const localDeltaId = evidence.localDeltaId;

    if (localMeasurementId) {
      const measurement = measurementByLocalId.get(localMeasurementId);
      if (measurement && allowedPlanItems.has(measurement.planItemId)) {
        included.push(evidence);
      }
      continue;
    }

    if (localDeltaId) {
      const delta = deltaByLocalId.get(localDeltaId);
      if (delta && allowedPlanItems.has(delta.planItemId)) {
        included.push(evidence);
      }
      continue;
    }

    // Unlinked project Evidence → exclude for assigned_scope.
  }

  return included;
}

export function canReadWorkPackageId(
  access: ProjectAccessContext,
  workPackageId: string,
): boolean {
  if (access.accessMode === "full") {
    return true;
  }

  return access.assignedWorkPackageIds.includes(workPackageId);
}

export function canReadAssignment(
  access: ProjectAccessContext,
  assignment: WorkPackageAssignment,
): boolean {
  if (access.role === "viewer") {
    return false;
  }

  if (access.accessMode === "full") {
    return true;
  }

  return access.assignedWorkPackageIds.includes(assignment.workPackageId);
}
