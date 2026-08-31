import type { Delta } from "../domain/delta.js";
import type { Measurement } from "../domain/measurement.js";
import {
  effectiveMeasurementReviewStatus,
} from "../domain/measurement.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import {
  createDeltaIfAbsentForMeasurement,
} from "../repositories/deltasRepository.js";
import { createDeltaFromMeasurement } from "./createDeltaFromMeasurement.js";
import {
  triggerFieldVarianceForNewDelta,
  type FieldVarianceTriggerDeps,
  type FieldVarianceTriggerResult,
} from "./fieldVarianceTrigger.js";
import { logAgentEvent } from "./agentLogging.js";
import { projectDeltaCreatedActivity } from "./activity/projectActivityProjections.js";

export type AcceptedMeasurementBridgeDeps = FieldVarianceTriggerDeps & {
  getProjectByIdFn?: typeof getProjectById;
  getPlanItemByIdFn?: typeof getPlanItemById;
  createDeltaIfAbsentFn?: typeof createDeltaIfAbsentForMeasurement;
  createDeltaFromMeasurementFn?: typeof createDeltaFromMeasurement;
};

export type AcceptedMeasurementBridgeResult = {
  bridged: boolean;
  reason:
    | "bridged"
    | "not_collaborator_contribution"
    | "not_accepted"
    | "project_not_found"
    | "project_mismatch"
    | "plan_item_not_found"
    | "plan_item_mismatch"
    | "delta_ineligible"
    | "delta_reused"
    | "delta_created";
  delta: Delta | null;
  deltaCreated: boolean;
  trigger: FieldVarianceTriggerResult | null;
};

/**
 * Narrow discriminator: collaborator field contributions carry server
 * provenance from the Phase 2I/2J create path. Owner-created Measurements
 * do not — they keep the existing Capture → Delta bootstrap path.
 */
export function isCollaboratorFieldContribution(
  measurement: Pick<
    Measurement,
    | "capturedByProjectMemberId"
    | "submittedAssignmentId"
    | "submittedWorkPackageId"
  >,
): boolean {
  return (
    hasNonEmptyId(measurement.capturedByProjectMemberId) ||
    hasNonEmptyId(measurement.submittedAssignmentId) ||
    hasNonEmptyId(measurement.submittedWorkPackageId)
  );
}

function hasNonEmptyId(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * After an actual Measurement review transition to accepted for a
 * collaborator contribution: create/reuse Delta, then trigger the
 * existing Field Variance AgentRun pipeline.
 *
 * Does not roll back Measurement acceptance on downstream failure.
 * Caller must only invoke on kind === "updated" && nextStatus accepted.
 */
export async function bridgeAcceptedCollaboratorMeasurementToFieldVariance(
  args: {
    projectId: string;
    measurement: Measurement;
  },
  deps: AcceptedMeasurementBridgeDeps = {},
): Promise<AcceptedMeasurementBridgeResult> {
  const getProjectFn = deps.getProjectByIdFn ?? getProjectById;
  const getPlanItemFn = deps.getPlanItemByIdFn ?? getPlanItemById;
  const createDeltaFn =
    deps.createDeltaIfAbsentFn ?? createDeltaIfAbsentForMeasurement;
  const buildDeltaFn =
    deps.createDeltaFromMeasurementFn ?? createDeltaFromMeasurement;

  const { projectId, measurement } = args;

  if (!isCollaboratorFieldContribution(measurement)) {
    return {
      bridged: false,
      reason: "not_collaborator_contribution",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  if (effectiveMeasurementReviewStatus(measurement) !== "accepted") {
    return {
      bridged: false,
      reason: "not_accepted",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  const project = await getProjectFn(projectId);

  if (!project) {
    logAgentEvent({
      event: "agent_triggered",
      projectId,
      errorCategory: "project_not_found",
    });
    return {
      bridged: false,
      reason: "project_not_found",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  if (measurement.projectId !== project.id) {
    return {
      bridged: false,
      reason: "project_mismatch",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  const planItem = await getPlanItemFn(measurement.planItemId);

  if (!planItem) {
    return {
      bridged: false,
      reason: "plan_item_not_found",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  if (planItem.projectId !== project.id) {
    return {
      bridged: false,
      reason: "plan_item_mismatch",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  const candidate = buildDeltaFn(measurement, planItem);

  if (!candidate) {
    console.log(
      JSON.stringify({
        event: "accepted_measurement_delta_skipped",
        reason: "delta_ineligible",
        projectId: project.id,
        measurementId: measurement.id,
        enqueueReason: "review_accepted",
        timestamp: new Date().toISOString(),
      }),
    );
    return {
      bridged: false,
      reason: "delta_ineligible",
      delta: null,
      deltaCreated: false,
      trigger: null,
    };
  }

  const { created: deltaCreated, delta } = await createDeltaFn(candidate);

  console.log(
    JSON.stringify({
      event: deltaCreated
        ? "accepted_measurement_delta_created"
        : "accepted_measurement_delta_reused",
      projectId: project.id,
      measurementId: measurement.id,
      remoteDeltaId: delta.id,
      enqueueReason: "review_accepted",
      timestamp: new Date().toISOString(),
    }),
  );

  if (deltaCreated) {
    try {
      await projectDeltaCreatedActivity({
        delta,
        measurement,
        actorType: "system",
        projectOwnerUid: project.ownerUid,
      });
    } catch {
      // Activity projection is best-effort.
    }
  }

  const trigger = await triggerFieldVarianceForNewDelta(
    {
      ownerUid: project.ownerUid,
      projectId: project.id,
      delta,
      measurement,
    },
    deps,
  );

  return {
    bridged: true,
    reason: deltaCreated ? "delta_created" : "delta_reused",
    delta,
    deltaCreated,
    trigger,
  };
}
