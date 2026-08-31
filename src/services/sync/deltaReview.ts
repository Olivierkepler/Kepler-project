import {
  getRemoteDelta,
  patchRemoteDeltaDisposition,
} from "../api/deltas";
import {
  getDeltaCloudMapping,
  getDeltaCloudMappingsForUser,
} from "../../store/deltaCloudMappings";
import {
  clearDeltaReviewPending,
  getPendingDeltaReviewsForUser,
  isDeltaReviewPending,
  markDeltaReviewPending,
} from "../../store/deltaReviewSyncState";
import {
  applyRemoteDeltaDisposition,
  getDeltaById,
  updateDeltaDisposition,
} from "../../store/deltas";
import type { DeltaStatus } from "../../types/delta";

export type DispositionDeltaSyncResult = {
  localUpdated: boolean;
  cloudSynced: boolean;
  pending: boolean;
  reason?: "not-mapped" | "remote-failed" | "not-signed-in" | "missing-local";
};

export type RetryPendingDeltaReviewsResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

export type ReconcileMappedDeltaReviewsResult = {
  checked: number;
  updated: number;
  pendingCleared: number;
  failed: number;
};

export type DeltaReviewSyncCycleResult = {
  retry: RetryPendingDeltaReviewsResult;
  reconcile: ReconcileMappedDeltaReviewsResult;
};

const retryInFlightByUid = new Map<
  string,
  Promise<RetryPendingDeltaReviewsResult>
>();

const cycleInFlightByUid = new Map<
  string,
  Promise<DeltaReviewSyncCycleResult>
>();

/**
 * Local-first disposition change with durable pending cloud sync.
 * Never rolls back local disposition on cloud failure.
 */
export async function updateDeltaDispositionWithCloudSync(
  ownerUid: string | null | undefined,
  localProjectId: string,
  localDeltaId: string,
  status: DeltaStatus,
  dispositionReason: string,
): Promise<DispositionDeltaSyncResult> {
  if (!ownerUid || !ownerUid.trim()) {
    return {
      localUpdated: false,
      cloudSynced: false,
      pending: false,
      reason: "not-signed-in",
    };
  }

  const updated = await updateDeltaDisposition(
    ownerUid,
    localDeltaId,
    status,
    dispositionReason,
  );

  if (!updated) {
    return {
      localUpdated: false,
      cloudSynced: false,
      pending: false,
      reason: "missing-local",
    };
  }

  await markDeltaReviewPending(
    ownerUid,
    localProjectId,
    localDeltaId,
    updated.status,
    updated.dispositionReason,
  );

  const mapping = await getDeltaCloudMapping(
    ownerUid,
    localProjectId,
    localDeltaId,
  );

  if (!mapping) {
    return {
      localUpdated: true,
      cloudSynced: false,
      pending: true,
      reason: "not-mapped",
    };
  }

  try {
    const remote = await patchRemoteDeltaDisposition(
      mapping.remoteProjectId,
      mapping.remoteDeltaId,
      updated.status,
      updated.dispositionReason,
    );

    if (remote.status === updated.status) {
      await clearDeltaReviewPending(ownerUid, localProjectId, localDeltaId);
      return {
        localUpdated: true,
        cloudSynced: true,
        pending: false,
      };
    }

    await markDeltaReviewPending(
      ownerUid,
      localProjectId,
      localDeltaId,
      updated.status,
      updated.dispositionReason,
    );
    return {
      localUpdated: true,
      cloudSynced: false,
      pending: true,
      reason: "remote-failed",
    };
  } catch {
    await markDeltaReviewPending(
      ownerUid,
      localProjectId,
      localDeltaId,
      updated.status,
      updated.dispositionReason,
    );
    return {
      localUpdated: true,
      cloudSynced: false,
      pending: true,
      reason: "remote-failed",
    };
  }
}

/**
 * Legacy Accept path (open → accepted).
 */
export async function reviewDeltaWithCloudSync(
  ownerUid: string | null | undefined,
  localProjectId: string,
  localDeltaId: string,
): Promise<{
  localReviewed: boolean;
  cloudReviewed: boolean;
  pending: boolean;
  reason?: DispositionDeltaSyncResult["reason"] | "already-local";
}> {
  const existing = await getDeltaById(ownerUid ?? "", localDeltaId);

  if (existing?.status === "accepted") {
    return {
      localReviewed: false,
      cloudReviewed: false,
      pending: false,
      reason: "already-local",
    };
  }

  const result = await updateDeltaDispositionWithCloudSync(
    ownerUid,
    localProjectId,
    localDeltaId,
    "accepted",
    existing?.dispositionReason ?? "",
  );

  return {
    localReviewed: result.localUpdated,
    cloudReviewed: result.cloudSynced,
    pending: result.pending,
    reason: result.reason,
  };
}

async function runPendingDeltaReviewRetry(
  ownerUid: string,
): Promise<RetryPendingDeltaReviewsResult> {
  const pending = await getPendingDeltaReviewsForUser(ownerUid);
  let synced = 0;

  for (const item of pending) {
    const localDelta = await getDeltaById(ownerUid, item.localDeltaId);

    if (!localDelta) {
      await clearDeltaReviewPending(
        item.ownerUid,
        item.localProjectId,
        item.localDeltaId,
      );
      continue;
    }

    const mapping = await getDeltaCloudMapping(
      item.ownerUid,
      item.localProjectId,
      item.localDeltaId,
    );

    if (!mapping) {
      await markDeltaReviewPending(
        item.ownerUid,
        item.localProjectId,
        item.localDeltaId,
        localDelta.status,
        localDelta.dispositionReason,
      );
      continue;
    }

    try {
      const remote = await patchRemoteDeltaDisposition(
        mapping.remoteProjectId,
        mapping.remoteDeltaId,
        localDelta.status,
        localDelta.dispositionReason,
      );

      if (remote.status === localDelta.status) {
        await clearDeltaReviewPending(
          item.ownerUid,
          item.localProjectId,
          item.localDeltaId,
        );
        synced += 1;
      } else {
        await markDeltaReviewPending(
          item.ownerUid,
          item.localProjectId,
          item.localDeltaId,
          localDelta.status,
          localDelta.dispositionReason,
        );
      }
    } catch {
      await markDeltaReviewPending(
        item.ownerUid,
        item.localProjectId,
        item.localDeltaId,
        localDelta.status,
        localDelta.dispositionReason,
      );
    }
  }

  const remaining = (await getPendingDeltaReviewsForUser(ownerUid)).length;

  return {
    attempted: pending.length,
    synced,
    remaining,
  };
}

export async function retryPendingDeltaReviews(
  ownerUid: string,
): Promise<RetryPendingDeltaReviewsResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = retryInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = runPendingDeltaReviewRetry(ownerUid).finally(() => {
    if (retryInFlightByUid.get(ownerUid) === run) {
      retryInFlightByUid.delete(ownerUid);
    }
  });

  retryInFlightByUid.set(ownerUid, run);
  return run;
}

/**
 * Cloud→local reconciliation for disposition.
 * Pending local disposition always wins (no remote overwrite).
 * Without pending, remote disposition may update local.
 */
export async function reconcileMappedDeltaReviews(
  ownerUid: string,
): Promise<ReconcileMappedDeltaReviewsResult> {
  if (!ownerUid.trim()) {
    return { checked: 0, updated: 0, pendingCleared: 0, failed: 0 };
  }

  const mappings = await getDeltaCloudMappingsForUser(ownerUid);
  let checked = 0;
  let updated = 0;
  let pendingCleared = 0;
  let failed = 0;

  for (const mapping of mappings) {
    checked += 1;

    const localDelta = await getDeltaById(ownerUid, mapping.localDeltaId);

    if (!localDelta) {
      continue;
    }

    const pending = await isDeltaReviewPending(
      ownerUid,
      mapping.localProjectId,
      mapping.localDeltaId,
    );

    let remote;

    try {
      remote = await getRemoteDelta(mapping.remoteDeltaId);
    } catch {
      failed += 1;
      continue;
    }

    if (remote.projectId !== mapping.remoteProjectId) {
      failed += 1;
      continue;
    }

    if (pending) {
      if (
        remote.status === localDelta.status &&
        (remote.dispositionReason ?? "") === localDelta.dispositionReason
      ) {
        await clearDeltaReviewPending(
          ownerUid,
          mapping.localProjectId,
          mapping.localDeltaId,
        );
        pendingCleared += 1;
      }
      continue;
    }

    const didUpdate = await applyRemoteDeltaDisposition(
      ownerUid,
      mapping.localDeltaId,
      remote.status,
      remote.dispositionReason ?? "",
      remote.disposedAt ?? null,
    );

    if (didUpdate) {
      updated += 1;
    }
  }

  return { checked, updated, pendingCleared, failed };
}

export async function runDeltaReviewSyncCycle(
  ownerUid: string,
): Promise<DeltaReviewSyncCycleResult> {
  if (!ownerUid.trim()) {
    return {
      retry: { attempted: 0, synced: 0, remaining: 0 },
      reconcile: { checked: 0, updated: 0, pendingCleared: 0, failed: 0 },
    };
  }

  const existing = cycleInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<DeltaReviewSyncCycleResult> => {
    const retry = await retryPendingDeltaReviews(ownerUid);
    const reconcile = await reconcileMappedDeltaReviews(ownerUid);
    return { retry, reconcile };
  })().finally(() => {
    if (cycleInFlightByUid.get(ownerUid) === run) {
      cycleInFlightByUid.delete(ownerUid);
    }
  });

  cycleInFlightByUid.set(ownerUid, run);
  return run;
}
