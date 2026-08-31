import {
  addProjectMemberIfAbsent,
  createLocalProjectMemberId,
  findProjectMemberByUserId,
} from "../../store/projectMembers";
import {
  getProjectInvitationById,
  normalizeInvitationEmail,
  updateProjectInvitation,
} from "../../store/projectInvitations";
import type { ProjectInvitation } from "../../types/projectInvitation";
import type { ProjectMember } from "../../types/projectMember";

export type AcceptProjectInvitationInput = {
  /**
   * Storage-namespace owner where invitation / member records live.
   * Not the accepting user's id unless they happen to be that owner.
   */
  storageOwnerUid: string;
  invitationId: string;
  /** Authenticated user id — becomes ProjectMember.userId (never email). */
  acceptingUserId: string;
  /** Must match invitation.email after normalizeInvitationEmail. */
  acceptingUserEmail: string;
};

export type AcceptProjectInvitationResult =
  | {
      ok: true;
      member: ProjectMember;
      invitation: ProjectInvitation;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_pending"
        | "email_mismatch"
        | "membership_exists"
        | "member_create_failed"
        | "invitation_update_failed";
      /**
       * Present when membership was created but invitation status update
       * failed — recoverable local inconsistency.
       */
      member?: ProjectMember;
      invitation?: ProjectInvitation;
    };

/**
 * Accepts a pending ProjectInvitation and creates an active ProjectMember.
 *
 * Order (non-transactional local storage):
 * 1) validate invitation + email ownership
 * 2) create ProjectMember
 * 3) only then mark invitation accepted
 *
 * Does not grant plan-item assignments or other scope permissions.
 * Caller must supply the correct storageOwnerUid (project storage
 * namespace); this service does not discover it.
 */
export async function acceptProjectInvitation(
  input: AcceptProjectInvitationInput,
): Promise<AcceptProjectInvitationResult> {
  const storageOwnerUid = input.storageOwnerUid.trim();
  const invitationId = input.invitationId.trim();
  const acceptingUserId = input.acceptingUserId.trim();
  const acceptingUserEmail = normalizeInvitationEmail(
    input.acceptingUserEmail,
  );

  if (
    !storageOwnerUid ||
    !invitationId ||
    !acceptingUserId ||
    !acceptingUserEmail
  ) {
    throw new Error("Invalid project invitation acceptance.");
  }

  const invitation = await getProjectInvitationById(
    storageOwnerUid,
    invitationId,
  );

  if (!invitation) {
    return { ok: false, reason: "not_found" };
  }

  if (invitation.status !== "pending") {
    return {
      ok: false,
      reason: "not_pending",
      invitation,
    };
  }

  if (acceptingUserEmail !== invitation.email) {
    return {
      ok: false,
      reason: "email_mismatch",
      invitation,
    };
  }

  const existing = await findProjectMemberByUserId(
    storageOwnerUid,
    invitation.projectId,
    acceptingUserId,
  );

  if (existing) {
    // Conservative: do not create a duplicate, do not change role,
    // and do not auto-reactivate removed / invited memberships.
    return {
      ok: false,
      reason: "membership_exists",
      member: existing,
      invitation,
    };
  }

  const nowIso = new Date().toISOString();

  const member: ProjectMember = {
    id: createLocalProjectMemberId(),
    projectId: invitation.projectId,
    userId: acceptingUserId,
    role: invitation.role,
    status: "active",
    invitedBy: invitation.invitedBy,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let created: boolean;

  try {
    created = await addProjectMemberIfAbsent(storageOwnerUid, member);
  } catch {
    return { ok: false, reason: "member_create_failed", invitation };
  }

  if (!created) {
    return { ok: false, reason: "member_create_failed", invitation };
  }

  let updated: ProjectInvitation | undefined;

  try {
    updated = await updateProjectInvitation(
      storageOwnerUid,
      invitation.id,
      { status: "accepted" },
      nowIso,
    );
  } catch {
    return {
      ok: false,
      reason: "invitation_update_failed",
      member,
      invitation,
    };
  }

  if (!updated) {
    return {
      ok: false,
      reason: "invitation_update_failed",
      member,
      invitation,
    };
  }

  return {
    ok: true,
    member,
    invitation: updated,
  };
}
