/**
 * Builds a deterministic tenant-safe remote Project document ID.
 * Format: `${uid}_${localProjectId}`
 */
export function createRemoteProjectId(
  uid: string,
  localProjectId: string,
): string {
  const owner = uid.trim();
  const local = localProjectId.trim();

  if (!owner) {
    throw new Error("uid is required");
  }

  if (!local) {
    throw new Error("localProjectId is required");
  }

  if (local.includes("/")) {
    throw new Error("localProjectId must not contain '/'");
  }

  return `${owner}_${local}`;
}
