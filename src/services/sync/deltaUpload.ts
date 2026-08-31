import { bootstrapRemoteDeltas } from "../api/deltas";
import { getRemoteMeasurementId } from "../../store/measurementCloudMappings";
import { getRemotePlanItemId } from "../../store/planItemCloudMappings";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { setDeltaCloudMapping } from "../../store/deltaCloudMappings";
import {
  clearDeltaUploadPending,
  getPendingDeltaUploadsForUser,
  markDeltaUploadPending,
} from "../../store/deltaUploadSyncState";
import { getDeltaById } from "../../store/deltas";

export type SyncDeltaToCloudResult = {
  synced: boolean;
  reason?:
    | "missing-delta"
    | "project-mismatch"
    | "missing-project-mapping"
    | "missing-plan-mapping"
    | "missing-measurement-mapping"
    | "remote-failed";
};

export type RetryPendingDeltaUploadsResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const uploadInFlightByUid = new Map<
  string,
  Promise<RetryPendingDeltaUploadsResult>
>();

/**
 * Upload one local Delta via authenticated bootstrap.
 * Requires project + plan + measurement cloud mappings.
 */
export async function syncDeltaToCloud(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<SyncDeltaToCloudResult> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localDeltaId.trim()) {
    return { synced: false, reason: "remote-failed" };
  }

  await markDeltaUploadPending(ownerUid, localProjectId, localDeltaId);

  const delta = await getDeltaById(ownerUid, localDeltaId);

  if (!delta) {
    return { synced: false, reason: "missing-delta" };
  }

  if (delta.projectId !== localProjectId) {
    return { synced: false, reason: "project-mismatch" };
  }

  const remoteProjectId = await getRemoteProjectId(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return { synced: false, reason: "missing-project-mapping" };
  }

  const remotePlanItemId = await getRemotePlanItemId(
    ownerUid,
    localProjectId,
    delta.planItemId,
  );

  if (!remotePlanItemId) {
    return { synced: false, reason: "missing-plan-mapping" };
  }

  const remoteMeasurementId = await getRemoteMeasurementId(
    ownerUid,
    localProjectId,
    delta.measurementId,
  );

  if (!remoteMeasurementId) {
    return { synced: false, reason: "missing-measurement-mapping" };
  }

  try {
    const result = await bootstrapRemoteDeltas(remoteProjectId, [
      {
        localDeltaId: delta.id,
        localPlanItemId: delta.planItemId,
        localMeasurementId: delta.measurementId,
        type: "length",
        plannedValue: delta.plannedValue,
        actualValue: delta.actualValue,
        difference: delta.difference,
        percentDifference: delta.percentDifference,
        unit: delta.unit,
        unitCost: delta.unitCost,
        costImpact: delta.costImpact,
        productionRatePerDay: delta.productionRatePerDay,
        scheduleImpactDays: delta.scheduleImpactDays,
        laborHoursPerUnit: delta.laborHoursPerUnit,
        laborImpactHours: delta.laborImpactHours,
        status: delta.status,
        dispositionReason: delta.dispositionReason,
        disposedAt: delta.disposedAt,
        createdAt: delta.createdAt,
      },
    ]);

    const remote = result.items.find(
      (item) => item.localDeltaId === delta.id,
    );

    if (!remote) {
      await markDeltaUploadPending(ownerUid, localProjectId, localDeltaId);
      return { synced: false, reason: "remote-failed" };
    }

    await setDeltaCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId,
      localPlanItemId: delta.planItemId,
      remotePlanItemId: remote.planItemId,
      localMeasurementId: delta.measurementId,
      remoteMeasurementId: remote.measurementId,
      localDeltaId: delta.id,
      remoteDeltaId: remote.id,
    });

    await clearDeltaUploadPending(ownerUid, localProjectId, localDeltaId);
    return { synced: true };
  } catch {
    await markDeltaUploadPending(ownerUid, localProjectId, localDeltaId);
    return { synced: false, reason: "remote-failed" };
  }
}

async function runPendingDeltaUploadRetry(
  ownerUid: string,
): Promise<RetryPendingDeltaUploadsResult> {
  const pending = await getPendingDeltaUploadsForUser(ownerUid);
  let synced = 0;

  for (const item of pending) {
    const result = await syncDeltaToCloud(
      item.ownerUid,
      item.localProjectId,
      item.localDeltaId,
    );

    if (result.synced) {
      synced += 1;
    }
  }

  const remaining = (await getPendingDeltaUploadsForUser(ownerUid)).length;

  return {
    attempted: pending.length,
    synced,
    remaining,
  };
}

/**
 * Sequential retry of pending Delta creation uploads for one user.
 */
export async function retryPendingDeltaUploads(
  ownerUid: string,
): Promise<RetryPendingDeltaUploadsResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = uploadInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = runPendingDeltaUploadRetry(ownerUid).finally(() => {
    if (uploadInFlightByUid.get(ownerUid) === run) {
      uploadInFlightByUid.delete(ownerUid);
    }
  });

  uploadInFlightByUid.set(ownerUid, run);
  return run;
}
