import { File } from "expo-file-system";

import {
  getRemoteEvidenceForProject,
  getRemoteEvidenceReadUrl,
  type RemoteEvidence,
} from "../api/evidence";
import { downloadEvidencePhoto } from "../evidence/downloadPhoto";
import {
  addEvidence,
  getEvidenceById,
  repairEvidencePhotoUri,
} from "../../store/evidence";
import { setEvidenceCloudMapping } from "../../store/evidenceCloudMappings";
import { clearEvidenceUploadPending } from "../../store/evidenceUploadSyncState";
import {
  getPendingEvidenceDeletesForProject,
} from "../../store/evidenceDeleteSyncState";
import { getDeltaById } from "../../store/deltas";
import { getMeasurementById } from "../../store/measurements";
import { getProjectById } from "../../store/projects";
import type { Evidence } from "../../types/evidence";

export type ImportCloudEvidenceResult = {
  added: number;
  existing: number;
  failed: number;
  photosDownloaded: number;
};

type RestoreOutcome =
  | { kind: "added"; photoDownloaded: boolean }
  | { kind: "existing"; photoDownloaded: boolean }
  | { kind: "skipped" }
  | { kind: "failed" };

async function localPhotoFileMissing(photoUri: string | null): Promise<boolean> {
  if (!photoUri || photoUri.trim().length === 0) {
    return true;
  }

  try {
    const file = new File(photoUri);
    return !file.exists;
  } catch {
    return true;
  }
}

async function resolveLocalRelationship(
  ownerUid: string,
  localProjectId: string,
  remote: RemoteEvidence,
): Promise<{ measurementId: string | null; deltaId: string | null }> {
  let measurementId =
    remote.localMeasurementId && remote.localMeasurementId.trim().length > 0
      ? remote.localMeasurementId
      : null;
  let deltaId =
    remote.localDeltaId && remote.localDeltaId.trim().length > 0
      ? remote.localDeltaId
      : null;

  if (measurementId !== null && deltaId !== null) {
    return { measurementId: null, deltaId: null };
  }

  if (measurementId) {
    const measurement = await getMeasurementById(ownerUid, measurementId);

    if (!measurement || measurement.projectId !== localProjectId) {
      measurementId = null;
    }
  }

  if (deltaId) {
    const delta = await getDeltaById(ownerUid, deltaId);

    if (!delta || delta.projectId !== localProjectId) {
      deltaId = null;
    }
  }

  return { measurementId, deltaId };
}

async function restoreOneEvidence(
  ownerUid: string,
  localProjectId: string,
  remoteProjectId: string,
  remote: RemoteEvidence,
  pendingDeleteLocalIds: Set<string>,
): Promise<RestoreOutcome> {
  if (pendingDeleteLocalIds.has(remote.localEvidenceId)) {
    return { kind: "skipped" };
  }

  try {
    await setEvidenceCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId,
      localEvidenceId: remote.localEvidenceId,
      remoteEvidenceId: remote.id,
      objectPath: remote.objectPath,
    });

    await clearEvidenceUploadPending(
      ownerUid,
      localProjectId,
      remote.localEvidenceId,
    );

    const existing = await getEvidenceById(ownerUid, remote.localEvidenceId);

    if (existing) {
      if (
        existing.type === "photo" &&
        remote.type === "photo" &&
        (await localPhotoFileMissing(existing.photoUri))
      ) {
        const signed = await getRemoteEvidenceReadUrl(
          remoteProjectId,
          remote.id,
        );
        const photoUri = await downloadEvidencePhoto(
          ownerUid,
          remote.localEvidenceId,
          signed.readUrl,
          remote.contentType,
          remote.objectPath,
        );
        await repairEvidencePhotoUri(
          ownerUid,
          remote.localEvidenceId,
          photoUri,
        );
        return { kind: "existing", photoDownloaded: true };
      }

      return { kind: "existing", photoDownloaded: false };
    }

    if (remote.type === "note") {
      if (remote.note.trim().length === 0) {
        return { kind: "failed" };
      }

      const relationship = await resolveLocalRelationship(
        ownerUid,
        localProjectId,
        remote,
      );

      const evidence: Evidence = {
        id: remote.localEvidenceId,
        projectId: localProjectId,
        type: "note",
        note: remote.note,
        photoUri: null,
        createdAt: remote.createdAt,
        measurementId: relationship.measurementId,
        deltaId: relationship.deltaId,
      };

      await addEvidence(ownerUid, evidence);
      return { kind: "added", photoDownloaded: false };
    }

    if (!remote.objectPath) {
      return { kind: "failed" };
    }

    const signed = await getRemoteEvidenceReadUrl(remoteProjectId, remote.id);
    const photoUri = await downloadEvidencePhoto(
      ownerUid,
      remote.localEvidenceId,
      signed.readUrl,
      remote.contentType,
      remote.objectPath,
    );

    const relationship = await resolveLocalRelationship(
      ownerUid,
      localProjectId,
      remote,
    );

    const evidence: Evidence = {
      id: remote.localEvidenceId,
      projectId: localProjectId,
      type: "photo",
      note: remote.note,
      photoUri,
      createdAt: remote.createdAt,
      measurementId: relationship.measurementId,
      deltaId: relationship.deltaId,
    };

    await addEvidence(ownerUid, evidence);
    return { kind: "added", photoDownloaded: true };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Explicit restore of remote Evidence into the current owner's local namespace.
 * Local Evidence wins on ID collision. Signed URLs are transport-only.
 */
export async function importCloudEvidenceForProject(
  ownerUid: string,
  localProjectId: string,
  remoteProjectId: string,
): Promise<ImportCloudEvidenceResult> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !remoteProjectId.trim()
  ) {
    throw new Error("Unable to restore cloud evidence.");
  }

  const localProject = await getProjectById(ownerUid, localProjectId);

  if (!localProject) {
    throw new Error("Project not found.");
  }

  const remoteItems = await getRemoteEvidenceForProject(remoteProjectId);
  const pendingDeletes = await getPendingEvidenceDeletesForProject(
    ownerUid,
    localProjectId,
  );
  const pendingDeleteLocalIds = new Set(
    pendingDeletes.map((item) => item.localEvidenceId),
  );

  let added = 0;
  let existing = 0;
  let failed = 0;
  let photosDownloaded = 0;

  for (const remote of remoteItems) {
    const result = await restoreOneEvidence(
      ownerUid,
      localProjectId,
      remoteProjectId,
      remote,
      pendingDeleteLocalIds,
    );

    if (result.kind === "added") {
      added += 1;
      if (result.photoDownloaded) {
        photosDownloaded += 1;
      }
    } else if (result.kind === "existing") {
      existing += 1;
      if (result.photoDownloaded) {
        photosDownloaded += 1;
      }
    } else if (result.kind === "failed") {
      failed += 1;
    }
  }

  return {
    added,
    existing,
    failed,
    photosDownloaded,
  };
}
