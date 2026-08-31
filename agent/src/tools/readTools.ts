import {
  ToolAuthorizationError,
  assertProjectOwnedByAgentRun,
  computeDirectDeltaEvidencePolicy,
  toSafeEvidenceView,
  type TrustedToolContext,
} from "./toolContext.js";
import {
  effectiveMeasurementReviewStatus,
  isAuthoritativeFieldMeasurement,
  type Measurement,
} from "../domain/measurement.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";

/** Read-only BuildSigma tools. Scope comes only from trusted AgentRun. */

export type CollaborationProvenanceView = {
  workPackage?: {
    id: string;
    name: string;
    status: WorkPackage["status"];
  };
  assignment?: {
    id: string;
    status: WorkPackageAssignment["status"];
  };
  projectMember?: {
    id: string;
    role: ProjectMember["role"];
  };
};

/**
 * Resolve optional collaboration provenance under AgentRun.projectId only.
 *
 * Behavior (Phase 2L.1): malformed/stale/cross-project provenance is omitted
 * from the optional bundle. The Measurement remains analyzable — missing
 * optional provenance must not fail the run or broaden access.
 */
export async function resolveCollaborationProvenance(
  ctx: TrustedToolContext,
  measurement: Measurement,
): Promise<CollaborationProvenanceView | undefined> {
  const projectId = ctx.agentRun.projectId;
  const bundle: CollaborationProvenanceView = {};

  const wpId = measurement.submittedWorkPackageId?.trim();
  const assignmentId = measurement.submittedAssignmentId?.trim();
  const memberId = measurement.capturedByProjectMemberId?.trim();

  if (!wpId && !assignmentId && !memberId) {
    return undefined;
  }

  let workPackage: WorkPackage | undefined;
  if (wpId && ctx.loaders.getWorkPackageById) {
    const loaded = await ctx.loaders.getWorkPackageById(wpId);
    if (loaded && loaded.projectId === projectId) {
      workPackage = loaded;
      bundle.workPackage = {
        id: loaded.id,
        name: loaded.name,
        status: loaded.status,
      };
    }
  }

  let assignment: WorkPackageAssignment | undefined;
  if (assignmentId && ctx.loaders.getWorkPackageAssignmentById) {
    const loaded = await ctx.loaders.getWorkPackageAssignmentById(assignmentId);
    if (
      loaded &&
      loaded.projectId === projectId &&
      (!workPackage || loaded.workPackageId === workPackage.id) &&
      (!wpId || loaded.workPackageId === wpId)
    ) {
      assignment = loaded;
      bundle.assignment = {
        id: loaded.id,
        status: loaded.status,
      };
    }
  }

  if (memberId && ctx.loaders.getProjectMemberById) {
    const loaded = await ctx.loaders.getProjectMemberById(memberId);
    if (
      loaded &&
      loaded.projectId === projectId &&
      (!assignment || loaded.id === assignment.projectMemberId)
    ) {
      bundle.projectMember = {
        id: loaded.id,
        role: loaded.role,
      };
    }
  }

  if (!bundle.workPackage && !bundle.assignment && !bundle.projectMember) {
    return undefined;
  }

  return bundle;
}

export async function getProjectContext(ctx: TrustedToolContext) {
  const project = await ctx.loaders.getProjectById(ctx.agentRun.projectId);
  if (!project) {
    throw new ToolAuthorizationError("project_not_found", "Project not found");
  }
  assertProjectOwnedByAgentRun(project, ctx.agentRun);
  return {
    projectId: project.id,
    name: project.name,
    status: project.status,
    location: project.location,
    openDeltas: project.openDeltas,
  };
}

export async function getPlanItem(ctx: TrustedToolContext) {
  const planItemId = ctx.agentRun.contextRefs.remotePlanItemId;
  const planItem = await ctx.loaders.getPlanItemById(planItemId);
  if (!planItem) {
    throw new ToolAuthorizationError("plan_item_not_found", "Plan item not found");
  }
  if (planItem.projectId !== ctx.agentRun.projectId) {
    throw new ToolAuthorizationError(
      "plan_item_project_mismatch",
      "Plan item projectId does not match AgentRun",
    );
  }
  return {
    planItemId: planItem.id,
    label: planItem.label,
    type: planItem.type,
    plannedValue: planItem.plannedValue,
    unit: planItem.unit,
    unitCost: planItem.unitCost,
    productionRatePerDay: planItem.productionRatePerDay,
    laborHoursPerUnit: planItem.laborHoursPerUnit,
  };
}

export async function getMeasurement(ctx: TrustedToolContext) {
  const measurementId = ctx.agentRun.contextRefs.remoteMeasurementId;
  const measurement = await ctx.loaders.getMeasurementById(measurementId);
  if (!measurement) {
    throw new ToolAuthorizationError(
      "measurement_not_found",
      "Measurement not found",
    );
  }
  if (measurement.projectId !== ctx.agentRun.projectId) {
    throw new ToolAuthorizationError(
      "measurement_project_mismatch",
      "Measurement projectId does not match AgentRun",
    );
  }
  if (
    measurement.localMeasurementId !==
    ctx.agentRun.contextRefs.localMeasurementId
  ) {
    throw new ToolAuthorizationError(
      "measurement_local_id_mismatch",
      "Measurement localMeasurementId does not match AgentRun contextRefs",
    );
  }

  // pending / rejected are not authoritative field truth for this agent.
  if (!isAuthoritativeFieldMeasurement(measurement)) {
    throw new ToolAuthorizationError(
      "measurement_not_authoritative",
      "Measurement reviewStatus is not accepted field truth",
    );
  }

  const reviewStatus = effectiveMeasurementReviewStatus(measurement);
  const collaborationProvenance = await resolveCollaborationProvenance(
    ctx,
    measurement,
  );

  return {
    measurementId: measurement.id,
    localMeasurementId: measurement.localMeasurementId,
    label: measurement.label,
    value: measurement.value,
    unit: measurement.unit,
    createdAt: measurement.createdAt,
    planItemId: measurement.planItemId,
    reviewStatus,
    ...(collaborationProvenance
      ? { collaborationProvenance }
      : {}),
  };
}

export async function getDelta(ctx: TrustedToolContext) {
  const deltaId = ctx.agentRun.contextRefs.remoteDeltaId;
  const delta = await ctx.loaders.getDeltaById(deltaId);
  if (!delta) {
    throw new ToolAuthorizationError("delta_not_found", "Delta not found");
  }
  if (delta.projectId !== ctx.agentRun.projectId) {
    throw new ToolAuthorizationError(
      "delta_project_mismatch",
      "Delta projectId does not match AgentRun",
    );
  }
  if (delta.localDeltaId !== ctx.agentRun.contextRefs.localDeltaId) {
    throw new ToolAuthorizationError(
      "delta_local_id_mismatch",
      "Delta localDeltaId does not match AgentRun contextRefs",
    );
  }
  // Persisted math is authoritative — never recomputed.
  return {
    deltaId: delta.id,
    localDeltaId: delta.localDeltaId,
    plannedValue: delta.plannedValue,
    actualValue: delta.actualValue,
    difference: delta.difference,
    percentDifference: delta.percentDifference,
    costImpact: delta.costImpact,
    laborImpactHours: delta.laborImpactHours,
    scheduleImpactDays: delta.scheduleImpactDays,
    status: delta.status,
    unit: delta.unit,
    createdAt: delta.createdAt,
    planItemId: delta.planItemId,
    measurementId: delta.measurementId,
  };
}

export async function listDeltaEvidence(ctx: TrustedToolContext) {
  const projectEvidence = await ctx.loaders.getEvidenceForProject(
    ctx.agentRun.projectId,
  );
  const localDeltaId = ctx.agentRun.contextRefs.localDeltaId;
  const items = projectEvidence
    .filter(
      (item) =>
        item.projectId === ctx.agentRun.projectId &&
        item.localDeltaId === localDeltaId,
    )
    .map(toSafeEvidenceView);
  const policy = computeDirectDeltaEvidencePolicy({
    agentRun: ctx.agentRun,
    evidence: projectEvidence,
  });
  return {
    relationship: "delta" as const,
    localDeltaId,
    evidence: items,
    deterministicPolicy: policy,
  };
}

export async function listMeasurementEvidence(ctx: TrustedToolContext) {
  const projectEvidence = await ctx.loaders.getEvidenceForProject(
    ctx.agentRun.projectId,
  );
  const localMeasurementId = ctx.agentRun.contextRefs.localMeasurementId;
  const items = projectEvidence
    .filter(
      (item) =>
        item.projectId === ctx.agentRun.projectId &&
        item.localMeasurementId === localMeasurementId,
    )
    .map(toSafeEvidenceView);
  return {
    relationship: "measurement" as const,
    localMeasurementId,
    evidence: items,
  };
}
