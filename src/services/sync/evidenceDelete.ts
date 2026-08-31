import { deleteRemoteEvidence } from "../api/evidence";
import { deleteAppOwnedEvidencePhoto } from "../evidence/deleteLocalPhoto";
import {
  deleteEvidence,
  getEvidenceById,
} from "../../store/evidence";
import {
  deleteEvidenceCloudMapping,
  getEvidenceCloudMapping,
} from "../../store/evidenceCloudMappings";
import {
  clearEvidenceDeletePending,
  getPendingEvidenceDeletesForUser,
  markEvidenceDeletePending,
} from "../../store/evidenceDeleteSyncState";
import { clearEvidenceUploadPending } from "../../store/evidenceUploadSyncState";

export type DeleteEvidenceLocalResult = {
  deleted: boolean;
  cloudPending: boolean;
  synced: boolean;
};

export type SyncEvidenceDeleteResult = {
  synced: boolean;
  reason?: "missing-pending" | "remote-failed";
};

export type RetryPendingEvidenceDeletesResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const deleteInFlightByUid = new Map<
  string,
  Promise<RetryPendingEvidenceDeletesResult>
>();

/**
 * Best-effort remote Evidence delete for one pending record.
 */
export async function syncEvidenceDeleteToCloud(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<SyncEvidenceDeleteResult> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localEvidenceId.trim()
  ) {
    return { synced: false, reason: "remote-failed" };
  }

  const pending = (await getPendingEvidenceDeletesForUser(ownerUid)).find(
    (item) =>
      item.localProjectId === localProjectId &&
      item.localEvidenceId === localEvidenceId,
  );

  if (!pending) {
    return { synced: false, reason: "missing-pending" };
  }

  await markEvidenceDeletePending(pending);

  try {
    await deleteRemoteEvidence(
      pending.remoteProjectId,
      pending.remoteEvidenceId,
    );
    await clearEvidenceDeletePending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: true };
  } catch {
    await markEvidenceDeletePending(pending);
    return { synced: false, reason: "remote-failed" };
  }
}

/**
 * Sequential retry of pending Evidence deletes for one authenticated owner.
 */
export async function retryPendingEvidenceDeletes(
  ownerUid: string,
): Promise<RetryPendingEvidenceDeletesResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = deleteInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<RetryPendingEvidenceDeletesResult> => {
    const pending = await getPendingEvidenceDeletesForUser(ownerUid);
    let synced = 0;

    for (const item of pending) {
      const result = await syncEvidenceDeleteToCloud(
        item.ownerUid,
        item.localProjectId,
        item.localEvidenceId,
      );

      if (result.synced) {
        synced += 1;
      }
    }

    const remaining = (await getPendingEvidenceDeletesForUser(ownerUid))
      .length;

    return {
      attempted: pending.length,
      synced,
      remaining,
    };
  })().finally(() => {
    if (deleteInFlightByUid.get(ownerUid) === run) {
      deleteInFlightByUid.delete(ownerUid);
    }
  });

  deleteInFlightByUid.set(ownerUid, run);
  return run;
}

/**
 * Local-first Evidence delete with durable cloud cleanup when mapped.
 * If pending-delete persistence fails for mapped Evidence, local delete aborts.
 */
export async function deleteEvidenceLocalFirst(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<DeleteEvidenceLocalResult> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localEvidenceId.trim()
  ) {
    return { deleted: false, cloudPending: false, synced: false };
  }

  const evidence = await getEvidenceById(ownerUid, localEvidenceId);

  if (!evidence || evidence.projectId !== localProjectId) {
    return { deleted: false, cloudPending: false, synced: false };
  }

  const mapping = await getEvidenceCloudMapping(
    ownerUid,
    localProjectId,
    localEvidenceId,
  );

  if (mapping) {
    try {
      await markEvidenceDeletePending({
        ownerUid,
        localProjectId,
        localEvidenceId,
        remoteProjectId: mapping.remoteProjectId,
        remoteEvidenceId: mapping.remoteEvidenceId,
      });
    } catch {
      // Without durable pending delete, do not remove local mapped Evidence.
      return { deleted: false, cloudPending: false, synced: false };
    }
  }

  await clearEvidenceUploadPending(
    ownerUid,
    localProjectId,
    localEvidenceId,
  );

  const removed = await deleteEvidence(ownerUid, localEvidenceId);

  if (!removed) {
    if (mapping) {
      await clearEvidenceDeletePending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
    }
    return { deleted: false, cloudPending: false, synced: false };
  }

  await deleteAppOwnedEvidencePhoto(ownerUid, evidence.photoUri);

  if (mapping) {
    await deleteEvidenceCloudMapping(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );

    // Caller kicks best-effort cloud delete so UI can refresh immediately.
    return {
      deleted: true,
      cloudPending: true,
      synced: false,
    };
  }

  return { deleted: true, cloudPending: false, synced: true };
}
