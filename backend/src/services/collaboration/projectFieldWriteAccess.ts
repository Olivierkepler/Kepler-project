/**
 * Scoped field contribution WRITE authorization (Phase 2I.1 / 2J.1).
 *
 * membership + role + write-active assignment + WorkPackage + PlanItem
 * = allowed Measurement / Measurement-linked Evidence create.
 *
 * Phase 2J.1: the same traversal returns deterministic authorization
 * provenance for collaborator Measurement snapshots.
 */

import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { Measurement } from "../../domain/measurement.js";
import type { Project } from "../../domain/project.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import type { WorkPackageAssignmentStatus } from "../../domain/workPackageAssignment.js";
import { createRemoteMeasurementId } from "../../domain/measurementId.js";
import { getMeasurementById } from "../../repositories/measurementsRepository.js";
import { getPlanItemById } from "../../repositories/planItemsRepository.js";
import { getProjectMember } from "../../repositories/projectMembersRepository.js";
import { getProjectById } from "../../repositories/projectsRepository.js";
import { listWorkPackageAssignmentsForProject } from "../../repositories/workPackageAssignmentsRepository.js";
import { getWorkPackagesByIds } from "../../repositories/workPackagesRepository.js";

/**
 * Assignment statuses that permit NEW field contributions.
 * completed remains readable (Phase 2H) but is not writable.
 */
export const WRITE_ACTIVE_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] =
  ["assigned", "accepted", "in_progress", "ready_for_review"] as const;

const WRITE_ACTIVE_STATUS_SET: ReadonlySet<string> = new Set(
  WRITE_ACTIVE_ASSIGNMENT_STATUSES,
);

/**
 * Immutable authorization context that made a PlanItem writable.
 * Chosen deterministically when multiple contexts match.
 */
export type FieldWriteAuthorizationProvenance = {
  planItemId: string;
  projectMemberId: string;
  assignmentId: string;
  workPackageId: string;
};

export type ProjectFieldWriteContext = {
  project: Project;
  currentUserId: string;
  membership: ProjectMember;
  role: "contractor" | "field_member";
  writableAssignedPlanItemIds: readonly string[];
  /**
   * Canonical write-authorizing context for the requested planItemId.
   * Selection: sort matching contexts by workPackageId, then assignmentId
   * (localeCompare); take the first.
   */
  authorizationProvenance: FieldWriteAuthorizationProvenance;
};

function isFieldContributorRole(
  role: string,
): role is "contractor" | "field_member" {
  return role === "contractor" || role === "field_member";
}

type WritableScopeResolution = {
  writableAssignedPlanItemIds: string[];
  /**
   * All write-authorizing contexts for a specific planItemId, unsorted.
   */
  contextsForPlanItem: FieldWriteAuthorizationProvenance[];
};

async function resolveWritableScope(input: {
  projectId: string;
  membershipId: string;
  planItemId: string;
}): Promise<WritableScopeResolution> {
  const assignments = await listWorkPackageAssignmentsForProject(
    input.projectId,
  );

  const activeAssignments = assignments.filter(
    (assignment) =>
      assignment.projectMemberId === input.membershipId &&
      WRITE_ACTIVE_STATUS_SET.has(assignment.status),
  );

  const candidateWorkPackageIds = [
    ...new Set(activeAssignments.map((assignment) => assignment.workPackageId)),
  ];

  if (candidateWorkPackageIds.length === 0) {
    return { writableAssignedPlanItemIds: [], contextsForPlanItem: [] };
  }

  const workPackages = await getWorkPackagesByIds(candidateWorkPackageIds);
  const workPackageById = new Map(
    workPackages.map((workPackage) => [workPackage.id, workPackage]),
  );

  const planItemIdSet = new Set<string>();
  const contextsForPlanItem: FieldWriteAuthorizationProvenance[] = [];

  for (const assignment of activeAssignments) {
    const workPackage = workPackageById.get(assignment.workPackageId);

    if (!workPackage) {
      continue;
    }

    if (workPackage.projectId !== input.projectId) {
      continue;
    }

    if (workPackage.status === "cancelled") {
      continue;
    }

    for (const planItemId of workPackage.planItemIds) {
      const trimmed = planItemId.trim();
      if (!trimmed) {
        continue;
      }

      planItemIdSet.add(trimmed);

      if (trimmed === input.planItemId) {
        contextsForPlanItem.push({
          planItemId: trimmed,
          projectMemberId: input.membershipId,
          assignmentId: assignment.id,
          workPackageId: workPackage.id,
        });
      }
    }
  }

  return {
    writableAssignedPlanItemIds: [...planItemIdSet].sort((a, b) =>
      a.localeCompare(b),
    ),
    contextsForPlanItem,
  };
}

/**
 * Deterministic provenance selection among valid write-authorizing contexts.
 * Sort by workPackageId, then assignmentId (localeCompare); take first.
 */
export function selectCanonicalFieldWriteProvenance(
  contexts: readonly FieldWriteAuthorizationProvenance[],
): FieldWriteAuthorizationProvenance | null {
  if (contexts.length === 0) {
    return null;
  }

  const sorted = [...contexts].sort((a, b) => {
    const wpCmp = a.workPackageId.localeCompare(b.workPackageId);
    if (wpCmp !== 0) {
      return wpCmp;
    }
    return a.assignmentId.localeCompare(b.assignmentId);
  });

  return sorted[0] ?? null;
}

/**
 * Asserts contractor / field_member may contribute against a remote PlanItem.
 * Owners must use assertProjectOwnedByUser instead.
 */
export async function assertPlanItemFieldWritableByUser(
  projectId: string,
  uid: string,
  planItemId: string,
): Promise<ProjectFieldWriteContext> {
  if (!uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const trimmedProjectId = projectId.trim();
  const trimmedPlanItemId = planItemId.trim();
  const currentUserId = uid.trim();

  if (!trimmedProjectId || !trimmedPlanItemId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const project = await getProjectById(trimmedProjectId);

  if (!project) {
    throw new ProjectAccessError("Project not found", 404);
  }

  // Owners are not authorized through this helper.
  if (project.ownerUid === currentUserId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const membership = await getProjectMember(trimmedProjectId, currentUserId);

  if (!membership || membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (!isFieldContributorRole(membership.role)) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const planItem = await getPlanItemById(trimmedPlanItemId);

  if (!planItem || planItem.projectId !== trimmedProjectId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const scope = await resolveWritableScope({
    projectId: trimmedProjectId,
    membershipId: membership.id,
    planItemId: trimmedPlanItemId,
  });

  if (!scope.writableAssignedPlanItemIds.includes(trimmedPlanItemId)) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const authorizationProvenance = selectCanonicalFieldWriteProvenance(
    scope.contextsForPlanItem,
  );

  if (!authorizationProvenance) {
    throw new ProjectAccessError("Project not found", 404);
  }

  return {
    project,
    currentUserId,
    membership,
    role: membership.role,
    writableAssignedPlanItemIds: scope.writableAssignedPlanItemIds,
    authorizationProvenance,
  };
}

/**
 * Resolves a project Measurement by deterministic local id, then asserts
 * its remote planItemId is field-writable for the collaborator.
 */
export async function assertMeasurementLinkedFieldWritableByUser(
  projectId: string,
  uid: string,
  localMeasurementId: string,
): Promise<{
  write: ProjectFieldWriteContext;
  measurement: Measurement;
}> {
  if (!uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const trimmedProjectId = projectId.trim();
  const trimmedLocalId = localMeasurementId.trim();

  if (!trimmedProjectId || !trimmedLocalId || trimmedLocalId.includes("/")) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const remoteMeasurementId = createRemoteMeasurementId(
    trimmedProjectId,
    trimmedLocalId,
  );
  const measurement = await getMeasurementById(remoteMeasurementId);

  if (!measurement || measurement.projectId !== trimmedProjectId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (measurement.localMeasurementId !== trimmedLocalId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const write = await assertPlanItemFieldWritableByUser(
    trimmedProjectId,
    uid,
    measurement.planItemId,
  );

  return { write, measurement };
}

/**
 * Resolves a project Delta by deterministic local id, then asserts
 * its remote planItemId is field-writable for the collaborator.
 * Enables Delta-linked Evidence for assigned Field Members (evidence requests).
 */
export async function assertDeltaLinkedFieldWritableByUser(
  projectId: string,
  uid: string,
  localDeltaId: string,
): Promise<{
  write: ProjectFieldWriteContext;
  delta: import("../../domain/delta.js").Delta;
}> {
  if (!uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }

  const trimmedProjectId = projectId.trim();
  const trimmedLocalId = localDeltaId.trim();

  if (!trimmedProjectId || !trimmedLocalId || trimmedLocalId.includes("/")) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const { createRemoteDeltaId } = await import("../../domain/deltaId.js");
  const { getDeltaById } = await import(
    "../../repositories/deltasRepository.js"
  );

  const remoteDeltaId = createRemoteDeltaId(trimmedProjectId, trimmedLocalId);
  const delta = await getDeltaById(remoteDeltaId);

  if (!delta || delta.projectId !== trimmedProjectId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  if (delta.localDeltaId !== trimmedLocalId) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const write = await assertPlanItemFieldWritableByUser(
    trimmedProjectId,
    uid,
    delta.planItemId,
  );

  return { write, delta };
}
