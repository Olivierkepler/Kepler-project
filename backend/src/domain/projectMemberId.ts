/**
 * Builds a deterministic ProjectMember document ID.
 * Format: `${remoteProjectId}_${userId}`
 *
 * Enforces one membership document per user per remote project.
 */
export function createProjectMemberId(
  remoteProjectId: string,
  userId: string,
): string {
  const project = remoteProjectId.trim();
  const uid = userId.trim();

  if (!project) {
    throw new Error("remoteProjectId is required");
  }

  if (!uid) {
    throw new Error("userId is required");
  }

  if (project.includes("/")) {
    throw new Error("remoteProjectId must not contain '/'");
  }

  if (uid.includes("/")) {
    throw new Error("userId must not contain '/'");
  }

  return `${project}_${uid}`;
}
