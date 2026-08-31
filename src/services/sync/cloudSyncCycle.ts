import { runDeltaReviewSyncCycle } from "./deltaReview";
import { retryPendingDeltaUploads } from "./deltaUpload";
import { retryPendingEvidenceDeletes } from "./evidenceDelete";
import { retryPendingEvidenceUploads } from "./evidenceUpload";
import { retryPendingMeasurementUploads } from "./measurementUpload";
import { retryPendingPlanItemUpdates } from "./planItemUpdate";
import { retryPendingProjectUpdates } from "./projectUpdate";

export type CloudSyncCycleResult = {
  projectUpdates: Awaited<ReturnType<typeof retryPendingProjectUpdates>>;
  planItemUpdates: Awaited<ReturnType<typeof retryPendingPlanItemUpdates>>;
  evidenceDeletes: Awaited<ReturnType<typeof retryPendingEvidenceDeletes>>;
  evidenceUploads: Awaited<ReturnType<typeof retryPendingEvidenceUploads>>;
  measurements: Awaited<ReturnType<typeof retryPendingMeasurementUploads>>;
  deltaUploads: Awaited<ReturnType<typeof retryPendingDeltaUploads>>;
  deltaReviews: Awaited<ReturnType<typeof runDeltaReviewSyncCycle>>;
};

const cycleInFlightByUid = new Map<string, Promise<CloudSyncCycleResult>>();

/**
 * Authenticated cloud sync cycle (narrow, explicit dependency order):
 * 1) pending Project updates
 * 2) pending PlanItem updates
 * 3) pending Evidence deletes
 * 4) pending Evidence uploads
 * 5) pending Measurement uploads
 * 6) pending Delta creation uploads
 * 7) Delta disposition push + reconcile
 */
export async function runCloudSyncCycle(
  ownerUid: string,
): Promise<CloudSyncCycleResult> {
  if (!ownerUid.trim()) {
    return {
      projectUpdates: { attempted: 0, synced: 0, remaining: 0 },
      planItemUpdates: { attempted: 0, synced: 0, remaining: 0 },
      evidenceDeletes: { attempted: 0, synced: 0, remaining: 0 },
      evidenceUploads: { attempted: 0, synced: 0, remaining: 0 },
      measurements: { attempted: 0, synced: 0, remaining: 0 },
      deltaUploads: { attempted: 0, synced: 0, remaining: 0 },
      deltaReviews: {
        retry: { attempted: 0, synced: 0, remaining: 0 },
        reconcile: { checked: 0, updated: 0, pendingCleared: 0, failed: 0 },
      },
    };
  }

  const existing = cycleInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<CloudSyncCycleResult> => {
    const projectUpdates = await retryPendingProjectUpdates(ownerUid);
    const planItemUpdates = await retryPendingPlanItemUpdates(ownerUid);
    const evidenceDeletes = await retryPendingEvidenceDeletes(ownerUid);
    const evidenceUploads = await retryPendingEvidenceUploads(ownerUid);
    const measurements = await retryPendingMeasurementUploads(ownerUid);
    const deltaUploads = await retryPendingDeltaUploads(ownerUid);
    const deltaReviews = await runDeltaReviewSyncCycle(ownerUid);
    return {
      projectUpdates,
      planItemUpdates,
      evidenceDeletes,
      evidenceUploads,
      measurements,
      deltaUploads,
      deltaReviews,
    };
  })().finally(() => {
    if (cycleInFlightByUid.get(ownerUid) === run) {
      cycleInFlightByUid.delete(ownerUid);
    }
  });

  cycleInFlightByUid.set(ownerUid, run);
  return run;
}
