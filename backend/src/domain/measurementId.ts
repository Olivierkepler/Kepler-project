/**
 * Builds a deterministic tenant-safe remote Measurement document ID.
 * Format: `${remoteProjectId}_${localMeasurementId}`
 */
export function createRemoteMeasurementId(
  remoteProjectId: string,
  localMeasurementId: string,
): string {
  const project = remoteProjectId.trim();
  const local = localMeasurementId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!local) {
    throw new Error("localMeasurementId is required");
  }

  if (local.includes("/")) {
    throw new Error("localMeasurementId must not contain '/'");
  }

  return `${project}_${local}`;
}
