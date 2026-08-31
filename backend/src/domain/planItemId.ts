/**
 * Builds a deterministic tenant-safe remote PlanItem document ID.
 * Format: `${remoteProjectId}_${localPlanItemId}`
 */
export function createRemotePlanItemId(
  remoteProjectId: string,
  localPlanItemId: string,
): string {
  const project = remoteProjectId.trim();
  const local = localPlanItemId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!local) {
    throw new Error("localPlanItemId is required");
  }

  if (local.includes("/")) {
    throw new Error("localPlanItemId must not contain '/'");
  }

  return `${project}_${local}`;
}
