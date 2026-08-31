import {
  commitPlanImport,
  createRemotePlanImport,
  uploadPlanImportFile,
} from "../api/planImports";
import {
  getPlanImportById,
  updatePlanImport,
} from "../../store/planImports";
import { ensureRemoteProject } from "./projectBootstrap";

export type PlanImportUploadProgressPhase =
  | "preparing"
  | "uploading"
  | "finalizing"
  | "ready"
  | "failed";

export type PlanImportUploadProgress = {
  phase: PlanImportUploadProgressPhase;
  message: string;
  currentFileIndex?: number;
  totalFiles?: number;
};

export type SyncPlanImportToCloudResult = {
  synced: boolean;
  remoteImportId?: string;
  remoteProjectId?: string;
  reason?:
    | "missing-import"
    | "project-mismatch"
    | "missing-project-mapping"
    | "missing-file"
    | "remote-failed";
  errorMessage?: string;
};

function normalizeMimeType(mimeType?: string, name?: string): string {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (mime === "image/jpg") {
    return "image/jpeg";
  }
  if (
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/png"
  ) {
    return mime;
  }

  const lowerName = (name ?? "").toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerName.endsWith(".png")) {
    return "image/png";
  }
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return mime || "application/octet-stream";
}

function uriScheme(uri: string): string {
  const scheme = uri.split(":")[0]?.trim().toLowerCase();
  return scheme || "unknown";
}

function wrapPhaseError(phaseLabel: string, error: unknown): Error {
  const detail =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Unknown error";

  return new Error(`${phaseLabel}: ${detail}`);
}

/**
 * Upload a local PlanImport via:
 * ensureRemoteProject → createRemotePlanImport → signed PUT each file → commit.
 *
 * Uses canonical remote project identity from existing bootstrap/mapping.
 * Does not create PlanItems or call AI.
 */
export async function syncPlanImportToCloud(
  ownerUid: string,
  localProjectId: string,
  localImportId: string,
  onProgress?: (progress: PlanImportUploadProgress) => void,
): Promise<SyncPlanImportToCloudResult> {
  if (!ownerUid.trim() || !localProjectId.trim() || !localImportId.trim()) {
    return { synced: false, reason: "remote-failed" };
  }

  const report = (progress: PlanImportUploadProgress) => {
    onProgress?.(progress);
  };

  report({
    phase: "preparing",
    message: "Preparing upload",
  });

  const localImport = await getPlanImportById(ownerUid, localImportId);

  if (!localImport) {
    return { synced: false, reason: "missing-import" };
  }

  if (localImport.projectId !== localProjectId) {
    return { synced: false, reason: "project-mismatch" };
  }

  await updatePlanImport(ownerUid, localImportId, {
    status: "uploading",
    errorMessage: null,
  });

  let remoteProjectId: string | undefined;

  try {
    remoteProjectId = await ensureRemoteProject(ownerUid, localProjectId);

    if (!remoteProjectId) {
      const message =
        "Preparing remote import failed: Unable to resolve the cloud project. Check your connection and try again.";
      await updatePlanImport(ownerUid, localImportId, {
        status: "failed",
        errorMessage: message,
      });
      report({ phase: "failed", message });
      return {
        synced: false,
        reason: "missing-project-mapping",
        errorMessage: message,
      };
    }

    if (__DEV__) {
      console.log("[PlanImportUpload] remote project resolved");
    }

    for (const file of localImport.files) {
      if (!file.uri?.trim()) {
        throw new Error(`Missing local file for ${file.name}`);
      }
      if (file.size == null || !Number.isFinite(file.size) || file.size <= 0) {
        throw new Error(`Missing or invalid size for ${file.name}`);
      }
    }

    let created;
    try {
      created = await createRemotePlanImport(remoteProjectId, {
        localImportId: localImport.id,
        files: localImport.files.map((file) => ({
          localFileId: file.id,
          name: file.name,
          mimeType: normalizeMimeType(file.mimeType, file.name),
          size: file.size!,
        })),
      });
    } catch (error) {
      throw wrapPhaseError("Preparing remote import failed", error);
    }

    if (__DEV__) {
      console.log("[PlanImportUpload] remote import created");
    }

    const remoteImport = created.import;

    if (!remoteImport?.id?.trim()) {
      throw new Error(
        "Preparing remote import failed: Missing remote import id",
      );
    }

    if (!Array.isArray(created.uploads)) {
      throw new Error(
        "Preparing remote import failed: Missing upload descriptors",
      );
    }

    if (
      remoteImport.status !== "uploaded" &&
      created.uploads.length !== localImport.files.length
    ) {
      throw new Error(
        `Preparing remote import failed: Expected ${localImport.files.length} upload URL(s), got ${created.uploads.length}`,
      );
    }

    for (const upload of created.uploads) {
      if (
        !upload.fileId?.trim() ||
        !upload.localFileId?.trim() ||
        !upload.uploadUrl?.trim() ||
        !upload.storagePath?.trim() ||
        !upload.contentType?.trim()
      ) {
        throw new Error(
          "Preparing remote import failed: Incomplete upload descriptor",
        );
      }
    }

    const filesWithRemote = localImport.files.map((file) => {
      const remoteFile = remoteImport.files.find(
        (item) => item.localFileId === file.id,
      );
      return {
        ...file,
        remoteFileId: remoteFile?.id,
        storagePath: remoteFile?.storagePath,
        uploadStatus: remoteFile?.uploadStatus ?? "pending",
      };
    });

    await updatePlanImport(ownerUid, localImportId, {
      status: "uploading",
      remoteImportId: remoteImport.id,
      remoteProjectId,
      files: filesWithRemote,
      errorMessage: null,
    });

    if (remoteImport.status === "uploaded") {
      await updatePlanImport(ownerUid, localImportId, {
        status: "uploaded",
        files: filesWithRemote.map((file) => ({
          ...file,
          uploadStatus: "uploaded",
        })),
        errorMessage: null,
      });
      report({
        phase: "ready",
        message: "Ready",
        totalFiles: localImport.files.length,
      });
      return {
        synced: true,
        remoteImportId: remoteImport.id,
        remoteProjectId,
      };
    }

    const uploadsByLocalId = new Map(
      created.uploads.map((upload) => [upload.localFileId, upload]),
    );

    const totalFiles = localImport.files.length;

    for (let index = 0; index < localImport.files.length; index += 1) {
      const file = localImport.files[index]!;
      const upload = uploadsByLocalId.get(file.id);

      if (!upload) {
        throw new Error(
          `Preparing remote import failed: Missing upload URL for ${file.name}`,
        );
      }

      report({
        phase: "uploading",
        message: `Uploading ${index + 1} of ${totalFiles}`,
        currentFileIndex: index + 1,
        totalFiles,
      });

      if (__DEV__) {
        console.log("[PlanImportUpload] uploading file", {
          fileName: file.name,
          mimeType: upload.contentType,
          size: file.size,
          uriScheme: uriScheme(file.uri),
        });
      }

      try {
        await uploadPlanImportFile(
          upload.uploadUrl,
          file.uri,
          upload.contentType,
        );
      } catch (error) {
        throw wrapPhaseError(`Uploading ${file.name} failed`, error);
      }

      if (__DEV__) {
        console.log("[PlanImportUpload] PUT complete");
      }
    }

    report({
      phase: "finalizing",
      message: "Finalizing",
      totalFiles,
    });

    if (__DEV__) {
      console.log("[PlanImportUpload] committing import");
    }

    let committed;
    try {
      committed = await commitPlanImport(remoteProjectId, remoteImport.id);
    } catch (error) {
      throw wrapPhaseError("Finalizing import failed", error);
    }

    const committedFiles = localImport.files.map((file) => {
      const remoteFile = committed.import.files.find(
        (item) => item.localFileId === file.id,
      );
      return {
        ...file,
        remoteFileId: remoteFile?.id ?? file.remoteFileId,
        storagePath: remoteFile?.storagePath ?? file.storagePath,
        uploadStatus: remoteFile?.uploadStatus ?? "uploaded",
      };
    });

    await updatePlanImport(ownerUid, localImportId, {
      status: "uploaded",
      remoteImportId: committed.import.id,
      remoteProjectId,
      files: committedFiles,
      errorMessage: null,
    });

    report({
      phase: "ready",
      message: "Ready",
      totalFiles,
    });

    if (__DEV__) {
      console.log("[PlanImportUpload] import uploaded");
    }

    return {
      synced: true,
      remoteImportId: committed.import.id,
      remoteProjectId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to upload documents. Please try again.";

    if (__DEV__) {
      console.log("[PlanImportUpload] failed", { message });
    }

    await updatePlanImport(ownerUid, localImportId, {
      status: "failed",
      errorMessage: message,
    });

    report({ phase: "failed", message });

    return {
      synced: false,
      reason: message.includes("Missing local file")
        ? "missing-file"
        : "remote-failed",
      errorMessage: message,
      remoteProjectId: remoteProjectId,
    };
  }
}
