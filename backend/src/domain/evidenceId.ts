/**
 * Builds a deterministic tenant-safe remote Evidence document ID.
 * Format: `${remoteProjectId}_${localEvidenceId}`
 */
export function createRemoteEvidenceId(
  remoteProjectId: string,
  localEvidenceId: string,
): string {
  const project = remoteProjectId.trim();
  const local = localEvidenceId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!local) {
    throw new Error("localEvidenceId is required");
  }

  if (local.includes("/")) {
    throw new Error("localEvidenceId must not contain '/'");
  }

  return `${project}_${local}`;
}
