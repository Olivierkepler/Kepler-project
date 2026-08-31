import { createRemoteProjectMemberId } from "../assignmentProgress";

/**
 * Resolve a selected member id (local or cloud) to the canonical cloud
 * ProjectMember.id for remoteProjectId.
 */
export function resolveCloudProjectMemberId(input: {
  selectedMemberId: string;
  remoteProjectId: string;
  /** Optional local/cloud member userId when selected id is a local member id. */
  memberUserId?: string | null;
}): string {
  const selected = input.selectedMemberId.trim();
  const remoteProjectId = input.remoteProjectId.trim();
  const prefix = `${remoteProjectId}_`;

  if (selected.startsWith(prefix)) {
    return selected;
  }

  const userId = input.memberUserId?.trim();
  if (userId) {
    return createRemoteProjectMemberId(remoteProjectId, userId);
  }

  return selected;
}
