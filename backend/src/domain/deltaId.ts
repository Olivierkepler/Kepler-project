/**
 * Builds a deterministic tenant-safe remote Delta document ID.
 * Format: `${remoteProjectId}_${localDeltaId}`
 */
export function createRemoteDeltaId(
  remoteProjectId: string,
  localDeltaId: string,
): string {
  const project = remoteProjectId.trim();
  const local = localDeltaId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!local) {
    throw new Error("localDeltaId is required");
  }

  if (local.includes("/")) {
    throw new Error("localDeltaId must not contain '/'");
  }

  return `${project}_${local}`;
}
