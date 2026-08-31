import { updateRemoteProject } from "../api/projects";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getProjectById } from "../../store/projects";
import {
  clearProjectUpdatePending,
  getPendingProjectUpdatesForUser,
  markProjectUpdatePending,
} from "../../store/projectUpdateSyncState";

export type SyncProjectUpdateResult = {
  synced: boolean;
  reason?: "missing-project" | "missing-mapping" | "remote-failed";
};

export type RetryPendingProjectUpdatesResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const updateInFlightByUid = new Map<
  string,
  Promise<RetryPendingProjectUpdatesResult>
>();

/**
 * Best-effort remote Project update from latest local editable fields.
 * Requires an existing project cloud mapping.
 */
export async function syncProjectUpdateToCloud(
  ownerUid: string,
  localProjectId: string,
): Promise<SyncProjectUpdateResult> {
  if (!ownerUid.trim() || !localProjectId.trim()) {
    return { synced: false, reason: "remote-failed" };
  }

  await markProjectUpdatePending(ownerUid, localProjectId);

  const project = await getProjectById(ownerUid, localProjectId);

  if (!project) {
    return { synced: false, reason: "missing-project" };
  }

  const remoteProjectId = await getRemoteProjectId(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return { synced: false, reason: "missing-mapping" };
  }

  try {
    await updateRemoteProject(remoteProjectId, {
      name: project.name,
      location: project.location,
      status: project.status,
    });
    await clearProjectUpdatePending(ownerUid, localProjectId);
    return { synced: true };
  } catch {
    await markProjectUpdatePending(ownerUid, localProjectId);
    return { synced: false, reason: "remote-failed" };
  }
}

/**
 * Retry pending Project updates for one authenticated owner.
 */
export async function retryPendingProjectUpdates(
  ownerUid: string,
): Promise<RetryPendingProjectUpdatesResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = updateInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<RetryPendingProjectUpdatesResult> => {
    const pending = await getPendingProjectUpdatesForUser(ownerUid);
    let synced = 0;

    for (const item of pending) {
      const result = await syncProjectUpdateToCloud(
        item.ownerUid,
        item.localProjectId,
      );

      if (result.synced) {
        synced += 1;
      }
    }

    const remaining = (await getPendingProjectUpdatesForUser(ownerUid)).length;

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
