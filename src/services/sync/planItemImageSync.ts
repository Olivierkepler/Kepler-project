import {
  commitRemotePlanItemImage,
  deleteRemotePlanItemImage,
  requestRemotePlanItemImageUploadUrl,
} from "../api/planItems";
import { getPlanItemById } from "../../store/planItems";
import {
  clearPlanItemImageSyncPending,
  getPendingPlanItemImageSyncsForUser,
  touchPlanItemImageSyncPending,
} from "../../store/planItemImageSyncState";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { ensureRemotePlanItem } from "./planItemBootstrap";
import { uploadLocalFileToSignedUrl } from "../storage/uploadLocalFileToSignedUrl";
import {
  processPendingPlanItemImageSync,
  type PlanItemImageSyncDependencies,
  type PlanItemImageSyncResult,
} from "../../utils/domain/planItemImageSync";

const defaultDependencies: PlanItemImageSyncDependencies = {
  getPlanItem: getPlanItemById,
  ensureRemotePlanItem,
  getRemoteProjectId,
  requestUploadUrl: requestRemotePlanItemImageUploadUrl,
  uploadFile: uploadLocalFileToSignedUrl,
  commitImage: commitRemotePlanItemImage,
  deleteImage: deleteRemotePlanItemImage,
  clearPending: clearPlanItemImageSyncPending,
  touchPending: touchPlanItemImageSyncPending,
};


export type { PlanItemImageSyncResult };

const retryInFlight = new Map<string, Promise<{ attempted: number; synced: number; remaining: number }>>();
const itemSyncInFlight = new Map<string, Promise<PlanItemImageSyncResult>>();

function itemSyncKey(ownerUid: string, localProjectId: string, localPlanItemId: string): string {
  return `${ownerUid}:${localProjectId}:${localPlanItemId}`;
}

async function processOnce(
  pending: Awaited<ReturnType<typeof getPendingPlanItemImageSyncsForUser>>[number],
): Promise<PlanItemImageSyncResult> {
  const key = itemSyncKey(pending.ownerUid, pending.localProjectId, pending.localPlanItemId);
  const existing = itemSyncInFlight.get(key);
  if (existing) return existing;
  const run = processPendingPlanItemImageSync(pending, defaultDependencies).finally(() => {
    if (itemSyncInFlight.get(key) === run) itemSyncInFlight.delete(key);
  });
  itemSyncInFlight.set(key, run);
  return run;
}

export async function syncPlanItemImageToCloud(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<PlanItemImageSyncResult> {
  const pending = (await getPendingPlanItemImageSyncsForUser(ownerUid)).find(
    (item) => item.localProjectId === localProjectId && item.localPlanItemId === localPlanItemId,
  );
  if (!pending) return { synced: true };
  return processOnce(pending);
}

export async function retryPendingPlanItemImageSyncs(
  ownerUid: string,
): Promise<{ attempted: number; synced: number; remaining: number }> {
  if (!ownerUid.trim()) return { attempted: 0, synced: 0, remaining: 0 };
  const active = retryInFlight.get(ownerUid);
  if (active) return active;

  const run = (async () => {
    const pending = await getPendingPlanItemImageSyncsForUser(ownerUid);
    let synced = 0;
    for (const operation of pending) {
      if ((await processOnce(operation)).synced) synced += 1;
    }
    const remaining = (await getPendingPlanItemImageSyncsForUser(ownerUid)).length;
    return { attempted: pending.length, synced, remaining };
  })().finally(() => {
    if (retryInFlight.get(ownerUid) === run) retryInFlight.delete(ownerUid);
  });
  retryInFlight.set(ownerUid, run);
  return run;
}
