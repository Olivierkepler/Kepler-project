import { getProjectById } from "../../store/projects";

/**
 * Project collaboration storage context (Phase 1D).
 *
 * Distinguishes actor identity from the project's storage namespace.
 *
 * ## How ownership / storage works today
 *
 * Operational and collaboration stores partition by an AsyncStorage
 * namespace key of the form `@buildsigma/{domain}/{ownerUid}`. The
 * `ownerUid` parameter is a **storage partition**, not a field on
 * `Project`. Domain records (`Project`, `ProjectMember`,
 * `ProjectInvitation`) intentionally do not carry `ownerUid`.
 *
 * Today, project child screens resolve data by looking up
 * `projectId` under the **authenticated user's** namespace
 * (`user.uid`). That is correct for the original local owner who
 * created the project on this device.
 *
 * ## Architectural boundary
 *
 * Local-only storage has **no durable map** from `projectId` →
 * `storageOwnerUid` that a collaborator on another account (or
 * device) can resolve. A contractor whose uid differs from the
 * project's storage owner cannot discover the owner's namespace from
 * AsyncStorage alone.
 *
 * Until cloud discovery / an explicit namespace is supplied (future
 * phase), this resolver only succeeds when the project is found under
 * a **known** storage namespace:
 * - omitted `storageOwnerUid` → check the current user's namespace only
 * - provided `storageOwnerUid` → check that explicit namespace only
 *
 * It never invents a storage owner for arbitrary collaborator projects.
 */

export type ProjectCollaborationContext = {
  /** Authenticated user performing the action (actor identity). */
  currentUserId: string;
  /** Project being collaborated on. */
  projectId: string;
  /**
   * Owner-scoped storage namespace where this project's collaboration
   * records currently live. Not the current user unless they are that
   * storage owner.
   */
  storageOwnerUid: string;
};

export type ResolveProjectCollaborationContextInput = {
  currentUserId: string;
  projectId: string;
  /**
   * Explicit storage namespace when already known (e.g. future invitation
   * acceptance / cloud discovery payloads). When omitted, only the
   * current user's namespace is checked.
   */
  storageOwnerUid?: string;
};

/**
 * Resolve collaboration context for a project.
 *
 * Returns null when the project cannot be found under a known storage
 * namespace. Callers must not treat null as "use currentUserId anyway."
 */
export async function resolveProjectCollaborationContext(
  input: ResolveProjectCollaborationContextInput,
): Promise<ProjectCollaborationContext | null> {
  const currentUserId = input.currentUserId.trim();
  const projectId = input.projectId.trim();
  const explicitStorageOwner = input.storageOwnerUid?.trim();

  if (!currentUserId || !projectId) {
    return null;
  }

  // Never invent a namespace for unknown collaborator projects.
  const storageOwnerUid = explicitStorageOwner || currentUserId;

  if (!storageOwnerUid) {
    return null;
  }

  const found = await getProjectById(storageOwnerUid, projectId);

  if (!found) {
    return null;
  }

  return {
    currentUserId,
    projectId,
    storageOwnerUid,
  };
}
