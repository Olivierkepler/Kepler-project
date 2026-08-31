import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

import {
  createRemoteEvidence,
  requestEvidenceUploadUrl,
} from "../api/evidence";
import { setEvidenceCloudMapping } from "../../store/evidenceCloudMappings";
import {
  clearEvidenceUploadPending,
  getPendingEvidenceUploadsForUser,
  markEvidenceUploadPending,
} from "../../store/evidenceUploadSyncState";
import { isEvidenceDeletePending } from "../../store/evidenceDeleteSyncState";
import { getEvidenceById } from "../../store/evidence";
import { ensureRemoteProject } from "./projectBootstrap";

export type SyncEvidenceToCloudResult = {
  synced: boolean;
  reason?:
    | "missing-evidence"
    | "project-mismatch"
    | "missing-project-mapping"
    | "missing-photo"
    | "remote-failed";
};

export type RetryPendingEvidenceUploadsResult = {
  attempted: number;
  synced: number;
  remaining: number;
};

const uploadInFlightByUid = new Map<
  string,
  Promise<RetryPendingEvidenceUploadsResult>
>();

function contentTypeFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/**
 * Upload one local Evidence record via signed Storage PUT + metadata POST.
 * Ensures remote Project prerequisite. Never deletes local Evidence/photo.
 */
export async function syncEvidenceToCloud(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<SyncEvidenceToCloudResult> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localEvidenceId.trim()
  ) {
    return { synced: false, reason: "remote-failed" };
  }

  if (
    await isEvidenceDeletePending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    )
  ) {
    await clearEvidenceUploadPending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: false, reason: "missing-evidence" };
  }

  await markEvidenceUploadPending(
    ownerUid,
    localProjectId,
    localEvidenceId,
  );

  const evidence = await getEvidenceById(ownerUid, localEvidenceId);

  if (!evidence) {
    await clearEvidenceUploadPending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: false, reason: "missing-evidence" };
  }

  if (evidence.projectId !== localProjectId) {
    await clearEvidenceUploadPending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: false, reason: "project-mismatch" };
  }

  const remoteProjectId = await ensureRemoteProject(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return { synced: false, reason: "missing-project-mapping" };
  }

  try {
    // Abort before any remote write if Evidence was deleted mid-flight.
    if (
      (await isEvidenceDeletePending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      )) ||
      !(await getEvidenceById(ownerUid, localEvidenceId))
    ) {
      await clearEvidenceUploadPending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
      return { synced: false, reason: "missing-evidence" };
    }

    if (evidence.type === "note") {
      const remote = await createRemoteEvidence(remoteProjectId, {
        localEvidenceId: evidence.id,
        type: "note",
        note: evidence.note,
        createdAt: evidence.createdAt,
        localMeasurementId: evidence.measurementId,
        localDeltaId: evidence.deltaId,
      });

      if (
        (await isEvidenceDeletePending(
          ownerUid,
          localProjectId,
          localEvidenceId,
        )) ||
        !(await getEvidenceById(ownerUid, localEvidenceId))
      ) {
        await clearEvidenceUploadPending(
          ownerUid,
          localProjectId,
          localEvidenceId,
        );
        return { synced: false, reason: "missing-evidence" };
      }

      await setEvidenceCloudMapping({
        ownerUid,
        localProjectId,
        remoteProjectId,
        localEvidenceId: evidence.id,
        remoteEvidenceId: remote.id,
        objectPath: null,
      });
      await clearEvidenceUploadPending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
      return { synced: true };
    }

    if (!evidence.photoUri || evidence.photoUri.trim().length === 0) {
      return { synced: false, reason: "missing-photo" };
    }

    const photoFile = new File(evidence.photoUri);

    if (!photoFile.exists) {
      return { synced: false, reason: "missing-photo" };
    }

    const contentType = contentTypeFromUri(evidence.photoUri);
    const signed = await requestEvidenceUploadUrl(remoteProjectId, {
      localEvidenceId: evidence.id,
      contentType,
    });

    const uploadResult = await FileSystem.uploadAsync(
      signed.uploadUrl,
      evidence.photoUri,
      {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": signed.contentType,
        },
      },
    );

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      await markEvidenceUploadPending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
      return { synced: false, reason: "remote-failed" };
    }

    if (
      (await isEvidenceDeletePending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      )) ||
      !(await getEvidenceById(ownerUid, localEvidenceId))
    ) {
      await clearEvidenceUploadPending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
      return { synced: false, reason: "missing-evidence" };
    }

    const remote = await createRemoteEvidence(remoteProjectId, {
      localEvidenceId: evidence.id,
      type: "photo",
      note: evidence.note,
      createdAt: evidence.createdAt,
      objectPath: signed.objectPath,
      contentType: signed.contentType,
      localMeasurementId: evidence.measurementId,
      localDeltaId: evidence.deltaId,
    });

    if (
      (await isEvidenceDeletePending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      )) ||
      !(await getEvidenceById(ownerUid, localEvidenceId))
    ) {
      await clearEvidenceUploadPending(
        ownerUid,
        localProjectId,
        localEvidenceId,
      );
      return { synced: false, reason: "missing-evidence" };
    }

    await setEvidenceCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId,
      localEvidenceId: evidence.id,
      remoteEvidenceId: remote.id,
      objectPath: remote.objectPath,
    });
    await clearEvidenceUploadPending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: true };
  } catch {
    await markEvidenceUploadPending(
      ownerUid,
      localProjectId,
      localEvidenceId,
    );
    return { synced: false, reason: "remote-failed" };
  }
}

/**
 * Sequential retry of pending Evidence uploads for one authenticated owner.
 */
export async function retryPendingEvidenceUploads(
  ownerUid: string,
): Promise<RetryPendingEvidenceUploadsResult> {
  if (!ownerUid.trim()) {
    return { attempted: 0, synced: 0, remaining: 0 };
  }

  const existing = uploadInFlightByUid.get(ownerUid);

  if (existing) {
    return existing;
  }

  const run = (async (): Promise<RetryPendingEvidenceUploadsResult> => {
    const pending = await getPendingEvidenceUploadsForUser(ownerUid);
    let synced = 0;

    for (const item of pending) {
      const result = await syncEvidenceToCloud(
        item.ownerUid,
        item.localProjectId,
        item.localEvidenceId,
      );

      if (result.synced) {
        synced += 1;
      }
    }

    const remaining = (await getPendingEvidenceUploadsForUser(ownerUid))
      .length;

    return {
      attempted: pending.length,
      synced,
      remaining,
    };
  })().finally(() => {
    if (uploadInFlightByUid.get(ownerUid) === run) {
      uploadInFlightByUid.delete(ownerUid);
    }
  });

  uploadInFlightByUid.set(ownerUid, run);
  return run;
}
