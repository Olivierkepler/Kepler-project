import type { PendingPlanItemImageSync } from "./planItemImageSyncState";

export type PlanItemImageSyncResult = {
  synced: boolean;
  reason?: "missing-plan-item" | "project-mismatch" | "missing-local-image" | "missing-cloud-mapping" | "remote-failed";
};

export type PlanItemImageSyncDependencies = {
  getPlanItem: (ownerUid: string, localPlanItemId: string) => Promise<{
    id: string;
    projectId: string;
    imageUri?: string | null;
  } | undefined>;
  ensureRemotePlanItem: (ownerUid: string, localProjectId: string, localPlanItemId: string) => Promise<string | undefined>;
  getRemoteProjectId: (ownerUid: string, localProjectId: string) => Promise<string | undefined>;
  requestUploadUrl: (remoteProjectId: string, remotePlanItemId: string, contentType: string) => Promise<{
    uploadUrl: string;
    objectId: string;
    contentType: string;
  }>;
  uploadFile: (input: { uploadUrl: string; localUri: string; contentType: string }) => Promise<unknown>;
  commitImage: (input: { remoteProjectId: string; remotePlanItemId: string; objectId: string; contentType: string }) => Promise<unknown>;
  deleteImage: (remoteProjectId: string, remotePlanItemId: string) => Promise<unknown>;
  clearPending: (ownerUid: string, localProjectId: string, localPlanItemId: string, operationId?: string) => Promise<void>;
  touchPending: (pending: PendingPlanItemImageSync) => Promise<void>;
};

function imageContentTypeFromUri(uri: string): string | null {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "heic": return "image/heic";
    case "webp": return "image/webp";
    default: return null;
  }
}

/** Purely orchestrates one persisted operation; adapters perform storage/API I/O. */
export async function processPendingPlanItemImageSync(
  pending: PendingPlanItemImageSync,
  dependencies: PlanItemImageSyncDependencies,
): Promise<PlanItemImageSyncResult> {
  try {
    const item = await dependencies.getPlanItem(
      pending.ownerUid,
      pending.localPlanItemId,
    );
    if (!item) return { synced: false, reason: "missing-plan-item" };
    if (item.projectId !== pending.localProjectId) {
      return { synced: false, reason: "project-mismatch" };
    }
    if (pending.operation === "upload" && !item.imageUri?.trim()) {
      return { synced: false, reason: "missing-local-image" };
    }

    await dependencies.touchPending(pending);
    const remotePlanItemId = await dependencies.ensureRemotePlanItem(
      pending.ownerUid,
      pending.localProjectId,
      pending.localPlanItemId,
    );
    const remoteProjectId = await dependencies.getRemoteProjectId(
      pending.ownerUid,
      pending.localProjectId,
    );
    if (!remotePlanItemId || !remoteProjectId) {
      return { synced: false, reason: "missing-cloud-mapping" };
    }

    if (pending.operation === "remove") {
      await dependencies.deleteImage(remoteProjectId, remotePlanItemId);
    } else {
      const localUri = item.imageUri as string;
      const contentType = imageContentTypeFromUri(localUri);
      if (!contentType) return { synced: false, reason: "remote-failed" };
      const signed = await dependencies.requestUploadUrl(
        remoteProjectId,
        remotePlanItemId,
        contentType,
      );
      await dependencies.uploadFile({
        uploadUrl: signed.uploadUrl,
        localUri,
        contentType: signed.contentType,
      });
      await dependencies.commitImage({
        remoteProjectId,
        remotePlanItemId,
        objectId: signed.objectId,
        contentType: signed.contentType,
      });
    }

    await dependencies.clearPending(
      pending.ownerUid,
      pending.localProjectId,
      pending.localPlanItemId,
      pending.operationId,
    );
    return { synced: true };
  } catch {
    return { synced: false, reason: "remote-failed" };
  }
}
