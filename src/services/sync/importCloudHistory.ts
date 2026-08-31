import {
  getRemoteDeltasForProject,
  type RemoteDelta,
} from "../api/deltas";
import {
  getRemoteMeasurementsForProject,
  type RemoteMeasurement,
} from "../api/measurements";
import type { RemoteProject } from "../api/projects";
import { setDeltaCloudMapping } from "../../store/deltaCloudMappings";
import { clearDeltaReviewPending, isDeltaReviewPending } from "../../store/deltaReviewSyncState";
import { clearDeltaUploadPending } from "../../store/deltaUploadSyncState";
import {
  addDelta,
  applyRemoteDeltaDisposition,
  getDeltaById,
  getDeltaByMeasurementId,
} from "../../store/deltas";
import {
  getLocalMeasurementIdForRemote,
  setMeasurementCloudMapping,
} from "../../store/measurementCloudMappings";
import { clearMeasurementUploadPending } from "../../store/measurementUploadSyncState";
import {
  addMeasurement,
  getMeasurementById,
} from "../../store/measurements";
import {
  getLocalPlanItemIdForRemote,
  getPlanItemCloudMappingsForProject,
} from "../../store/planItemCloudMappings";
import { getPlanItemById } from "../../store/planItems";
import { getProjectById } from "../../store/projects";
import type { Delta } from "../../types/delta";
import type { Measurement } from "../../types/measurement";

export type ImportCloudProjectHistoryResult = {
  measurementsAdded: number;
  measurementsExisting: number;
  measurementsFailed: number;
  deltasAdded: number;
  deltasExisting: number;
  deltasFailed: number;
};

/**
 * Explicit restore of remote Measurement + Delta history into the
 * current owner's local operational namespace.
 * Does not create pending upload state. Local wins on ID collision.
 */
export async function importCloudProjectHistory(
  ownerUid: string,
  remoteProject: RemoteProject,
): Promise<ImportCloudProjectHistoryResult> {
  if (!ownerUid.trim()) {
    throw new Error("Your session could not be authenticated.");
  }

  const localProjectId = remoteProject.localProjectId.trim();

  if (!localProjectId) {
    throw new Error("This cloud project cannot be used on this device.");
  }

  const localProject = await getProjectById(ownerUid, localProjectId);

  if (!localProject) {
    throw new Error("Use this project on the device before restoring history.");
  }

  const planMappings = await getPlanItemCloudMappingsForProject(
    ownerUid,
    localProjectId,
  );

  if (planMappings.length === 0) {
    throw new Error(
      "Plan items must be available on this device before restoring history.",
    );
  }

  let measurementsAdded = 0;
  let measurementsExisting = 0;
  let measurementsFailed = 0;
  let deltasAdded = 0;
  let deltasExisting = 0;
  let deltasFailed = 0;

  let remoteMeasurements: RemoteMeasurement[];

  try {
    remoteMeasurements = await getRemoteMeasurementsForProject(
      remoteProject.id,
    );
  } catch {
    throw new Error("Unable to load cloud measurements.");
  }

  for (const remote of remoteMeasurements) {
    const imported = await importRemoteMeasurement(
      ownerUid,
      localProjectId,
      remoteProject.id,
      remote,
    );

    if (imported === "added") {
      measurementsAdded += 1;
    } else if (imported === "existing") {
      measurementsExisting += 1;
    } else {
      measurementsFailed += 1;
    }
  }

  let remoteDeltas: RemoteDelta[];

  try {
    remoteDeltas = await getRemoteDeltasForProject(remoteProject.id);
  } catch {
    throw new Error(
      "Measurements were restored where possible, but cloud deltas could not be loaded.",
    );
  }

  for (const remote of remoteDeltas) {
    const imported = await importRemoteDelta(
      ownerUid,
      localProjectId,
      remoteProject.id,
      remote,
    );

    if (imported === "added") {
      deltasAdded += 1;
    } else if (imported === "existing") {
      deltasExisting += 1;
    } else {
      deltasFailed += 1;
    }
  }

  return {
    measurementsAdded,
    measurementsExisting,
    measurementsFailed,
    deltasAdded,
    deltasExisting,
    deltasFailed,
  };
}

async function importRemoteMeasurement(
  ownerUid: string,
  localProjectId: string,
  remoteProjectId: string,
  remote: RemoteMeasurement,
): Promise<"added" | "existing" | "failed"> {
  if (
    !remote.localMeasurementId.trim() ||
    remote.projectId !== remoteProjectId ||
    remote.type !== "length"
  ) {
    return "failed";
  }

  const localPlanItemId = await getLocalPlanItemIdForRemote(
    ownerUid,
    localProjectId,
    remote.planItemId,
  );

  if (!localPlanItemId) {
    return "failed";
  }

  const localPlanItem = await getPlanItemById(ownerUid, localPlanItemId);

  if (!localPlanItem || localPlanItem.projectId !== localProjectId) {
    return "failed";
  }

  const local: Measurement = {
    id: remote.localMeasurementId,
    projectId: localProjectId,
    planItemId: localPlanItemId,
    type: "length",
    label: remote.label,
    value: remote.value,
    unit: remote.unit,
    createdAt: remote.createdAt,
  };

  const existing = await getMeasurementById(ownerUid, local.id);
  let outcome: "added" | "existing" = "existing";

  if (!existing) {
    await addMeasurement(ownerUid, local);
    const after = await getMeasurementById(ownerUid, local.id);

    if (!after) {
      return "failed";
    }

    outcome = "added";
  }

  await setMeasurementCloudMapping({
    ownerUid,
    localProjectId,
    remoteProjectId,
    localPlanItemId,
    remotePlanItemId: remote.planItemId,
    localMeasurementId: remote.localMeasurementId,
    remoteMeasurementId: remote.id,
  });

  await clearMeasurementUploadPending(
    ownerUid,
    localProjectId,
    remote.localMeasurementId,
  );

  return outcome;
}

async function importRemoteDelta(
  ownerUid: string,
  localProjectId: string,
  remoteProjectId: string,
  remote: RemoteDelta,
): Promise<"added" | "existing" | "failed"> {
  if (
    !remote.localDeltaId.trim() ||
    remote.projectId !== remoteProjectId ||
    remote.type !== "length"
  ) {
    return "failed";
  }

  const localPlanItemId = await getLocalPlanItemIdForRemote(
    ownerUid,
    localProjectId,
    remote.planItemId,
  );

  if (!localPlanItemId) {
    return "failed";
  }

  const localPlanItem = await getPlanItemById(ownerUid, localPlanItemId);

  if (!localPlanItem || localPlanItem.projectId !== localProjectId) {
    return "failed";
  }

  let localMeasurementId = await getLocalMeasurementIdForRemote(
    ownerUid,
    localProjectId,
    remote.measurementId,
  );

  if (!localMeasurementId) {
    return "failed";
  }

  const localMeasurement = await getMeasurementById(
    ownerUid,
    localMeasurementId,
  );

  if (
    !localMeasurement ||
    localMeasurement.projectId !== localProjectId ||
    localMeasurement.planItemId !== localPlanItemId
  ) {
    return "failed";
  }

  const existingById = await getDeltaById(ownerUid, remote.localDeltaId);

  if (existingById) {
    const pending = await isDeltaReviewPending(
      ownerUid,
      localProjectId,
      remote.localDeltaId,
    );

    // Pending local disposition wins over cloud restore.
    if (!pending) {
      await applyRemoteDeltaDisposition(
        ownerUid,
        remote.localDeltaId,
        remote.status,
        remote.dispositionReason ?? "",
        remote.disposedAt ?? null,
      );
    }

    await repairDeltaMapping(
      ownerUid,
      localProjectId,
      remoteProjectId,
      localPlanItemId,
      remote.planItemId,
      localMeasurementId,
      remote.measurementId,
      remote.localDeltaId,
      remote.id,
    );

    if (
      !pending &&
      remote.status ===
        ((await getDeltaById(ownerUid, remote.localDeltaId))?.status ??
          remote.status)
    ) {
      await clearDeltaReviewPending(
        ownerUid,
        localProjectId,
        remote.localDeltaId,
      );
    }

    return "existing";
  }

  const existingByMeasurement = await getDeltaByMeasurementId(
    ownerUid,
    localMeasurementId,
  );

  if (
    existingByMeasurement &&
    existingByMeasurement.id !== remote.localDeltaId
  ) {
    return "failed";
  }

  const local: Delta = {
    id: remote.localDeltaId,
    projectId: localProjectId,
    planItemId: localPlanItemId,
    measurementId: localMeasurementId,
    type: "length",
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
    dispositionReason: remote.dispositionReason ?? "",
    disposedAt: remote.disposedAt ?? null,
    createdAt: remote.createdAt,
  };

  await addDelta(ownerUid, local);

  const after = await getDeltaById(ownerUid, remote.localDeltaId);

  if (!after) {
    return "failed";
  }

  await repairDeltaMapping(
    ownerUid,
    localProjectId,
    remoteProjectId,
    localPlanItemId,
    remote.planItemId,
    localMeasurementId,
    remote.measurementId,
    remote.localDeltaId,
    remote.id,
  );

  return "added";
}

async function repairDeltaMapping(
  ownerUid: string,
  localProjectId: string,
  remoteProjectId: string,
  localPlanItemId: string,
  remotePlanItemId: string,
  localMeasurementId: string,
  remoteMeasurementId: string,
  localDeltaId: string,
  remoteDeltaId: string,
): Promise<void> {
  await setDeltaCloudMapping({
    ownerUid,
    localProjectId,
    remoteProjectId,
    localPlanItemId,
    remotePlanItemId,
    localMeasurementId,
    remoteMeasurementId,
    localDeltaId,
    remoteDeltaId,
  });

  await clearDeltaUploadPending(ownerUid, localProjectId, localDeltaId);
}
