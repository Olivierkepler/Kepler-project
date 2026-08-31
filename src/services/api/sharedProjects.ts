import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { Project } from "../../types/project";
import {
  getRemoteDeltasForProject,
  type RemoteDelta,
} from "./deltas";
import {
  getRemoteEvidenceForProject,
  type RemoteEvidence,
} from "./evidence";
import {
  getRemoteMeasurementsForProject,
  type RemoteMeasurement,
} from "./measurements";
import {
  getRemotePlanItemsForProject,
  type RemotePlanItem,
} from "./planItems";
import { getRemoteProject, type RemoteProject } from "./projects";
import { mapRemoteEvidenceToDisplayEvidence } from "../../utils/domain/sharedEvidenceDisplay";

/**
 * Read-only shared project payload for ProjectScreen (Phase 1I.2).
 * Not persisted to AsyncStorage.
 */
export type SharedProjectSnapshot = {
  project: Project;
  planItems: PlanItem[];
  measurements: Measurement[];
  deltas: Delta[];
  evidence: Evidence[];
};

function toDisplayProject(remote: RemoteProject): Project {
  return {
    id: remote.id,
    name: remote.name,
    location: remote.location,
    status: remote.status,
    progress: remote.progress,
    openDeltas: remote.openDeltas,
    assignedTasks: remote.assignedTasks,
  };
}

function toDisplayPlanItem(remote: RemotePlanItem): PlanItem {
  return {
    id: remote.id,
    projectId: remote.projectId,
    type: remote.type,
    label: remote.label,
    plannedValue: remote.plannedValue,
    unit: remote.unit,
    unitCost: remote.unitCost,
    productionRatePerDay: remote.productionRatePerDay,
    laborHoursPerUnit: remote.laborHoursPerUnit,
  };
}

function toDisplayMeasurement(remote: RemoteMeasurement): Measurement {
  return {
    id: remote.id,
    projectId: remote.projectId,
    planItemId: remote.planItemId,
    type: remote.type,
    label: remote.label,
    value: remote.value,
    unit: remote.unit,
    createdAt: remote.createdAt,
    localMeasurementId: remote.localMeasurementId,
    reviewStatus: remote.reviewStatus,
    reviewNote: remote.reviewNote,
    reviewedAt: remote.reviewedAt,
    capturedByUid: remote.capturedByUid,
    capturedByProjectMemberId: remote.capturedByProjectMemberId,
    submittedAssignmentId: remote.submittedAssignmentId,
    submittedWorkPackageId: remote.submittedWorkPackageId,
  };
}

function toDisplayDelta(remote: RemoteDelta): Delta {
  return {
    id: remote.id,
    projectId: remote.projectId,
    planItemId: remote.planItemId,
    measurementId: remote.measurementId,
    type: remote.type,
    plannedValue: remote.plannedValue,
    actualValue: remote.actualValue,
    difference: remote.difference,
    percentDifference: remote.percentDifference,
    unit: remote.unit,
    unitCost: remote.unitCost,
    costImpact: remote.costImpact,
    productionRatePerDay: remote.productionRatePerDay,
    scheduleImpactDays: remote.scheduleImpactDays,
    laborHoursPerUnit: remote.laborHoursPerUnit,
    laborImpactHours: remote.laborImpactHours,
    status: remote.status,
    dispositionReason: remote.dispositionReason,
    disposedAt: remote.disposedAt,
    createdAt: remote.createdAt,
    localDeltaId: remote.localDeltaId,
  };
}

/**
 * Maps remote evidence list items into local Evidence shape for display
 * aggregates only. photoUri stays null (no offline photo cache).
 *
 * Relationship fields keep the API's authoritative local* keys
 * (`localMeasurementId` / `localDeltaId`). Shared Plan Item correlation
 * matches those against Measurement.localMeasurementId / Delta.localDeltaId
 * (and remote document ids) in getEvidenceRelatedToPlanItem.
 */
export function toDisplayEvidence(remote: RemoteEvidence): Evidence {
  return mapRemoteEvidenceToDisplayEvidence(remote);
}

export class SharedProjectUnavailableError extends Error {
  constructor(message = "This shared project is no longer available.") {
    super(message);
    this.name = "SharedProjectUnavailableError";
  }
}

/**
 * Loads a shared project snapshot via Phase 1I membership-aware READ APIs.
 * `remoteProjectId` must be the Firestore remote project document id.
 */
export async function loadSharedProjectSnapshot(
  remoteProjectId: string,
): Promise<SharedProjectSnapshot> {
  const id = remoteProjectId.trim();

  if (!id) {
    throw new SharedProjectUnavailableError();
  }

  let remoteProject: RemoteProject;

  try {
    remoteProject = await getRemoteProject(id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Project not found."
    ) {
      throw new SharedProjectUnavailableError();
    }

    throw error;
  }

  const [planItems, measurements, deltas, evidence] = await Promise.all([
    getRemotePlanItemsForProject(id),
    getRemoteMeasurementsForProject(id),
    getRemoteDeltasForProject(id),
    getRemoteEvidenceForProject(id),
  ]);

  return {
    project: toDisplayProject(remoteProject),
    planItems: planItems.map(toDisplayPlanItem),
    measurements: measurements.map(toDisplayMeasurement),
    deltas: deltas.map(toDisplayDelta),
    evidence: evidence.map(toDisplayEvidence),
  };
}
