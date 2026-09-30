/**
 * Owner Plan-vs-Reality reconciliation (Phase 2F-C).
 *
 * Server-authoritative: loads canonical Measurement + PlanItem, calculates
 * via buildDeltaFromMeasurement, persists via createDeltaIfAbsentForMeasurement.
 * Does not accept client arithmetic.
 */

import { ProjectAccessError } from "../auth/projectAccess.js";
import type { Delta } from "../domain/delta.js";
import {
  effectiveMeasurementReviewStatus,
  type Measurement,
} from "../domain/measurement.js";
import { getMeasurementById } from "../repositories/measurementsRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import { createDeltaIfAbsentForMeasurement } from "../repositories/deltasRepository.js";
import {
  buildDeltaFromMeasurement,
  createOwnerReconcileLocalDeltaId,
  type DeltaBuildIneligibleReason,
} from "./createDeltaFromMeasurement.js";
import {
  isCollaboratorFieldContribution,
} from "./acceptedMeasurementAgentBridge.js";
import { projectDeltaCreatedActivity } from "./activity/projectActivityProjections.js";
import {
  triggerFieldVarianceForNewDelta,
  type FieldVarianceTriggerDeps,
  type FieldVarianceTriggerResult,
} from "./fieldVarianceTrigger.js";

export type OwnerMeasurementReconcileOutcome =
  | "created"
  | "existing"
  | "no_delta";

export type OwnerMeasurementReconcileResult =
  | {
      outcome: "created" | "existing";
      measurementId: string;
      delta: Delta;
      trigger: FieldVarianceTriggerResult | null;
    }
  | {
      outcome: "no_delta";
      reason: "zero_difference";
      measurementId: string;
      delta: null;
      trigger: null;
    };

export class OwnerMeasurementReconcileError extends Error {
  readonly statusCode: 400 | 404;
  readonly code: string;

  constructor(
    message: string,
    statusCode: 400 | 404,
    code: string,
  ) {
    super(message);
    this.name = "OwnerMeasurementReconcileError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type ReconcileOwnerMeasurementDeps = FieldVarianceTriggerDeps & {
  getProjectByIdFn?: typeof getProjectById;
  getMeasurementByIdFn?: typeof getMeasurementById;
  getPlanItemByIdFn?: typeof getPlanItemById;
  createDeltaIfAbsentFn?: typeof createDeltaIfAbsentForMeasurement;
  buildDeltaFn?: typeof buildDeltaFromMeasurement;
};

function ineligibleMessage(reason: DeltaBuildIneligibleReason): string {
  switch (reason) {
    case "project_mismatch":
      return "Measurement and plan item are not eligible for variance analysis.";
    case "type_mismatch":
      return "Variance analysis requires matching length measurement and plan item.";
    case "unit_mismatch":
      return "Measurement and plan item units do not match.";
    case "invalid_unit_cost":
    case "invalid_production_rate":
    case "invalid_labor_rate":
    case "schedule_labor_unavailable":
      return "Variance could not be calculated from the current plan data.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/**
 * Reconciles an owner-captured accepted Measurement into a Delta.
 * Caller must already have established Project.ownerUid === ownerUid.
 */
export async function reconcileOwnerMeasurementToDelta(
  args: {
    projectId: string;
    measurementId: string;
    ownerUid: string;
  },
  deps: ReconcileOwnerMeasurementDeps = {},
): Promise<OwnerMeasurementReconcileResult> {
  const getProjectFn = deps.getProjectByIdFn ?? getProjectById;
  const getMeasurementFn = deps.getMeasurementByIdFn ?? getMeasurementById;
  const getPlanItemFn = deps.getPlanItemByIdFn ?? getPlanItemById;
  const createDeltaFn =
    deps.createDeltaIfAbsentFn ?? createDeltaIfAbsentForMeasurement;
  const buildDeltaFn = deps.buildDeltaFn ?? buildDeltaFromMeasurement;

  const projectId = args.projectId.trim();
  const measurementId = args.measurementId.trim();
  const ownerUid = args.ownerUid.trim();

  if (!projectId || !measurementId || !ownerUid) {
    throw new OwnerMeasurementReconcileError(
      "Project not found",
      404,
      "not_found",
    );
  }

  const project = await getProjectFn(projectId);

  if (!project || project.ownerUid !== ownerUid) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const measurement = await getMeasurementFn(measurementId);

  if (!measurement || measurement.projectId !== projectId) {
    throw new OwnerMeasurementReconcileError(
      "Measurement not found",
      404,
      "measurement_not_found",
    );
  }

  if (isCollaboratorFieldContribution(measurement)) {
    throw new OwnerMeasurementReconcileError(
      "Measurement not found",
      404,
      "collaborator_measurement",
    );
  }

  if (effectiveMeasurementReviewStatus(measurement) !== "accepted") {
    throw new OwnerMeasurementReconcileError(
      "Measurement not found",
      404,
      "measurement_not_accepted",
    );
  }

  const capturedByUid = measurement.capturedByUid?.trim() ?? "";
  if (!capturedByUid || capturedByUid !== ownerUid) {
    throw new OwnerMeasurementReconcileError(
      "Measurement not found",
      404,
      "not_owner_captured",
    );
  }

  const planItem = await getPlanItemFn(measurement.planItemId);

  if (!planItem || planItem.projectId !== projectId) {
    throw new OwnerMeasurementReconcileError(
      "Measurement not found",
      404,
      "plan_item_not_found",
    );
  }

  if (measurement.planItemId !== planItem.id) {
    throw new OwnerMeasurementReconcileError(
      "Measurement and plan item are not eligible for variance analysis.",
      400,
      "plan_item_mismatch",
    );
  }

  const localDeltaId = createOwnerReconcileLocalDeltaId(
    measurement.localMeasurementId,
  );
  const built = buildDeltaFn(measurement, planItem, localDeltaId);

  if (built.status === "no_delta") {
    return {
      outcome: "no_delta",
      reason: "zero_difference",
      measurementId: measurement.id,
      delta: null,
      trigger: null,
    };
  }

  if (built.status === "ineligible") {
    throw new OwnerMeasurementReconcileError(
      ineligibleMessage(built.reason),
      400,
      `delta_ineligible_${built.reason}`,
    );
  }

  const { created: deltaCreated, delta } = await createDeltaFn(built.delta);

  if (deltaCreated) {
    try {
      await projectDeltaCreatedActivity({
        delta,
        measurement,
        actorType: "human",
        actorUid: ownerUid,
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
    outcome: deltaCreated ? "created" : "existing",
    measurementId: measurement.id,
    delta,
    trigger,
  };
}

/** Exported for tests that need to assert against Measurement shape helpers. */
export type { Measurement };
