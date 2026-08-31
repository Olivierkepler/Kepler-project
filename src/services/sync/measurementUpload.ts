import { bootstrapRemoteMeasurements } from "../api/measurements";
import { setMeasurementCloudMapping } from "../../store/measurementCloudMappings";
import {
  clearMeasurementUploadPending,
  getPendingMeasurementUploadsForUser,
  markMeasurementUploadPending,
} from "../../store/measurementUploadSyncState";
import { getMeasurementById } from "../../store/measurements";
import { ensureRemotePlanItem } from "./planItemBootstrap";
import { ensureRemoteProject } from "./projectBootstrap";

export type SyncMeasurementToCloudResult = {
  synced: boolean;
  reason?:
    | "missing-measurement"
    | "project-mismatch"
    | "missing-project-mapping"
    | "missing-plan-mapping"
    | "remote-failed";
};

export type RetryPendingMeasurementUploadsResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const uploadInFlightByUid = new Map<
  string,
  Promise<RetryPendingMeasurementUploadsResult>
>();

/**
 * Upload one local Measurement via authenticated bootstrap.
 * Ensures Project + referenced PlanItem cloud prerequisites first.
 * Leaves pending on missing prerequisites or remote failure.
 */
export async function syncMeasurementToCloud(
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): Promise<SyncMeasurementToCloudResult> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localMeasurementId.trim()) {
    return { synced: false, reason: "remote-failed" };
  }

  await markMeasurementUploadPending(
    ownerUid,
    localProjectId,
    localMeasurementId,
  );

  const measurement = await getMeasurementById(ownerUid, localMeasurementId);

  if (!measurement) {
    return { synced: false, reason: "missing-measurement" };
  }

  if (measurement.projectId !== localProjectId) {
    return { synced: false, reason: "project-mismatch" };
  }

  const remoteProjectId = await ensureRemoteProject(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return { synced: false, reason: "missing-project-mapping" };
  }

  const remotePlanItemId = await ensureRemotePlanItem(
    ownerUid,
    localProjectId,
    measurement.planItemId,
  );

  if (!remotePlanItemId) {
    return { synced: false, reason: "missing-plan-mapping" };
  }

  try {
    const result = await bootstrapRemoteMeasurements(remoteProjectId, [
      {
        localMeasurementId: measurement.id,
        localPlanItemId: measurement.planItemId,
        type: measurement.type,
        label: measurement.label,
        value: measurement.value,
        unit: measurement.unit,
        createdAt: measurement.createdAt,
      },
    ]);

    const remote = result.items.find(
      (item) => item.localMeasurementId === measurement.id,
    );

    if (!remote) {
      await markMeasurementUploadPending(
        ownerUid,
        localProjectId,
        localMeasurementId,
      );
      return { synced: false, reason: "remote-failed" };
    }

    await setMeasurementCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId,
      localPlanItemId: measurement.planItemId,
      remotePlanItemId: remote.planItemId,
      localMeasurementId: measurement.id,
      remoteMeasurementId: remote.id,
    });

    await clearMeasurementUploadPending(
      ownerUid,
      localProjectId,
      localMeasurementId,
    );

    return { synced: true };
  } catch {
    await markMeasurementUploadPending(
      ownerUid,
      localProjectId,
      localMeasurementId,
    );
    return { synced: false, reason: "remote-failed" };
  }
}

async function runPendingMeasurementUploadRetry(
  ownerUid: string,
): Promise<RetryPendingMeasurementUploadsResult> {
  const pending = await getPendingMeasurementUploadsForUser(ownerUid);
  let synced = 0;

  for (const item of pending) {
    const result = await syncMeasurementToCloud(
      item.ownerUid,
      item.localProjectId,
      item.localMeasurementId,
    );

    if (result.synced) {
      synced += 1;
    }
  }

  const remaining = (await getPendingMeasurementUploadsForUser(ownerUid))
    .length;

  return {
    attempted: pending.length,
    synced,
    remaining,
  };
}

/**
 * Sequential retry of pending Measurement uploads for one user.
 */
export async function retryPendingMeasurementUploads(
  ownerUid: string,
): Promise<RetryPendingMeasurementUploadsResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = uploadInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = runPendingMeasurementUploadRetry(ownerUid).finally(() => {
    if (uploadInFlightByUid.get(ownerUid) === run) {
      uploadInFlightByUid.delete(ownerUid);
    }
  });

  uploadInFlightByUid.set(ownerUid, run);
  return run;
}
