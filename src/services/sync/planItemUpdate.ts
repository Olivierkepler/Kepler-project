import { updateRemotePlanItem } from "../api/planItems";
import { getRemotePlanItemId } from "../../store/planItemCloudMappings";
import { getPlanItemById } from "../../store/planItems";
import {
  clearPlanItemUpdatePending,
  getPendingPlanItemUpdatesForUser,
  markPlanItemUpdatePending,
} from "../../store/planItemUpdateSyncState";
import { getRemoteProjectId } from "../../store/projectCloudMappings";

export type SyncPlanItemUpdateResult = {
  synced: boolean;
  reason?:
    | "missing-plan-item"
    | "project-mismatch"
    | "missing-project-mapping"
    | "missing-plan-mapping"
    | "remote-failed";
};

export type RetryPendingPlanItemUpdatesResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const updateInFlightByUid = new Map<
  string,
  Promise<RetryPendingPlanItemUpdatesResult>
>();

/**
 * Best-effort remote PlanItem update from latest local editable fields.
 * Requires project + plan item cloud mappings.
 */
export async function syncPlanItemUpdateToCloud(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<SyncPlanItemUpdateResult> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localPlanItemId.trim()
  ) {
    return { synced: false, reason: "remote-failed" };
  }

  await markPlanItemUpdatePending(
    ownerUid,
    localProjectId,
    localPlanItemId,
  );

  const planItem = await getPlanItemById(ownerUid, localPlanItemId);

  if (!planItem) {
    return { synced: false, reason: "missing-plan-item" };
  }

  if (planItem.projectId !== localProjectId) {
    return { synced: false, reason: "project-mismatch" };
  }

  const remoteProjectId = await getRemoteProjectId(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return { synced: false, reason: "missing-project-mapping" };
  }

  const remotePlanItemId = await getRemotePlanItemId(
    ownerUid,
    localProjectId,
    localPlanItemId,
  );

  if (!remotePlanItemId) {
    return { synced: false, reason: "missing-plan-mapping" };
  }

  try {
    await updateRemotePlanItem(remoteProjectId, remotePlanItemId, {
      label: planItem.label,
      plannedValue: planItem.plannedValue,
      unitCost: planItem.unitCost,
      productionRatePerDay: planItem.productionRatePerDay,
      laborHoursPerUnit: planItem.laborHoursPerUnit,
    });
    await clearPlanItemUpdatePending(
      ownerUid,
      localProjectId,
      localPlanItemId,
    );
    return { synced: true };
  } catch {
    await markPlanItemUpdatePending(
      ownerUid,
      localProjectId,
      localPlanItemId,
    );
    return { synced: false, reason: "remote-failed" };
  }
}

/**
 * Retry pending PlanItem updates for one authenticated owner.
 */
export async function retryPendingPlanItemUpdates(
  ownerUid: string,
): Promise<RetryPendingPlanItemUpdatesResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = updateInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<RetryPendingPlanItemUpdatesResult> => {
    const pending = await getPendingPlanItemUpdatesForUser(ownerUid);
    let synced = 0;

    for (const item of pending) {
      const result = await syncPlanItemUpdateToCloud(
        item.ownerUid,
        item.localProjectId,
        item.localPlanItemId,
      );

      if (result.synced) {
        synced += 1;
      }
    }

    const remaining = (await getPendingPlanItemUpdatesForUser(ownerUid))
      .length;

    return {
      attempted: pending.length,
      synced,
      remaining,
    };
  })().finally(() => {
    if (updateInFlightByUid.get(ownerUid) === run) {
      updateInFlightByUid.delete(ownerUid);
    }
  });

  updateInFlightByUid.set(ownerUid, run);
  return run;
}
