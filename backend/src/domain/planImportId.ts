/**
 * Builds a deterministic tenant-safe remote PlanImport document ID.
 * Format: `${remoteProjectId}_${localImportId}`
 */
export function createRemotePlanImportId(
  remoteProjectId: string,
  localImportId: string,
): string {
  const project = remoteProjectId.trim();
  const local = localImportId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!local) {
    throw new Error("localImportId is required");
  }

  if (local.includes("/")) {
    throw new Error("localImportId must not contain '/'");
  }

  return `${project}_${local}`;
}

/**
 * Builds a deterministic remote file id within an import.
 * Format: `${remoteImportId}_${localFileId}`
 */
export function createRemotePlanImportFileId(
  remoteImportId: string,
  localFileId: string,
): string {
  const importId = remoteImportId.trim();
  const local = localFileId.trim();

  if (!importId) {
    throw new Error("remoteImportId is required");
  }

  if (!local) {
    throw new Error("localFileId is required");
  }

  if (local.includes("/")) {
    throw new Error("localFileId must not contain '/'");
  }

  return `${importId}_${local}`;
}
