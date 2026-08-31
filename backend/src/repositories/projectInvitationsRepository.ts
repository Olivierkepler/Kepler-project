import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { ProjectInvitation } from "../domain/projectInvitation.js";
import { createProjectInvitationId } from "../domain/projectInvitationId.js";
import type { ProjectMember } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import {
  isBlockingInvitationStatus,
  normalizeInvitationEmail,
  normalizeProjectInvitationDocument,
} from "../validation/projectInvitation.js";
import { normalizeProjectMemberDocument } from "../validation/projectMember.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function invitationsCollection() {
  return db.collection(COLLECTIONS.projectInvitations);
}

function membersCollection() {
  return db.collection(COLLECTIONS.projectMembers);
}

function sortInvitations(items: ProjectInvitation[]): ProjectInvitation[] {
  return [...items].sort((a, b) => {
    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export async function getProjectInvitationById(
  invitationId: string,
): Promise<ProjectInvitation | undefined> {
  requireId(invitationId, "invitationId");

  const snapshot = await invitationsCollection().doc(invitationId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeProjectInvitationDocument(snapshot.data());
}

export async function listProjectInvitationsForProject(
  projectId: string,
): Promise<ProjectInvitation[]> {
  requireId(projectId, "projectId");

  const snapshot = await invitationsCollection()
    .where("projectId", "==", projectId)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeProjectInvitationDocument(doc.data()))
    .filter((item): item is ProjectInvitation => item !== undefined);

  return sortInvitations(items);
}

/**
 * Finds a pending or accepted invitation for project + normalized email.
 * Filters blocking statuses in memory after projectId query (no composite index).
 */
export async function findActiveProjectInvitationByEmail(
  projectId: string,
  email: string,
): Promise<ProjectInvitation | undefined> {
  requireId(projectId, "projectId");

  const normalizedEmail = normalizeInvitationEmail(email);

  if (!normalizedEmail) {
    return undefined;
  }

  const items = await listProjectInvitationsForProject(projectId);

  return items.find(
    (item) =>
      item.email === normalizedEmail && isBlockingInvitationStatus(item.status),
  );
}

export async function listPendingProjectInvitationsForEmail(
  email: string,
): Promise<ProjectInvitation[]> {
  const normalizedEmail = normalizeInvitationEmail(email);

  if (!normalizedEmail) {
    return [];
  }

  const snapshot = await invitationsCollection()
    .where("email", "==", normalizedEmail)
    .get();

  const items = snapshot.docs
    .map((doc) => normalizeProjectInvitationDocument(doc.data()))
    .filter(
      (item): item is ProjectInvitation =>
        item !== undefined && item.status === "pending",
    );

  return sortInvitations(items);
}

export type AddProjectInvitationInput = {
  projectId: string;
  email: string;
  role: ProjectInvitation["role"];
  invitedBy: string;
};

export type AddProjectInvitationResult =
  | { created: true; invitation: ProjectInvitation }
  | { created: false; invitation: ProjectInvitation; reason: "duplicate" };

/**
 * Transactional create-if-absent for active (pending/accepted) project+email.
 */
export async function addProjectInvitationIfAbsent(
  input: AddProjectInvitationInput,
  nowIso: string = new Date().toISOString(),
): Promise<AddProjectInvitationResult> {
  const projectId = input.projectId.trim();
  const invitedBy = input.invitedBy.trim();
  const email = normalizeInvitationEmail(input.email);

  if (!projectId || !invitedBy || !email) {
    throw new Error("Invalid project invitation create.");
  }

  const invitationId = createProjectInvitationId();
  const candidate: ProjectInvitation = {
    id: invitationId,
    projectId,
    email,
    role: input.role,
    status: "pending",
    invitedBy,
    createdAt: nowIso,
    updatedAt: nowIso,
    acceptedByUserId: null,
  };

  const normalized = normalizeProjectInvitationDocument(candidate);

  if (!normalized) {
    throw new Error("Invalid project invitation.");
  }

  return db.runTransaction(async (tx) => {
    const projectInvitesSnap = await tx.get(
      invitationsCollection().where("projectId", "==", projectId),
    );

    for (const doc of projectInvitesSnap.docs) {
      const existing = normalizeProjectInvitationDocument(doc.data());

      if (
        existing &&
        existing.email === email &&
        isBlockingInvitationStatus(existing.status)
      ) {
        return {
          created: false as const,
          invitation: existing,
          reason: "duplicate" as const,
        };
      }
    }

    const ref = invitationsCollection().doc(normalized.id);
    tx.create(ref, normalized);
    return { created: true as const, invitation: normalized };
  });
}

export type AcceptProjectInvitationResult =
  | {
      ok: true;
      member: ProjectMember;
      invitation: ProjectInvitation;
      createdMember: boolean;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_pending"
        | "email_mismatch"
        | "membership_removed"
        | "membership_invited"
        | "membership_exists";
      invitation?: ProjectInvitation;
      member?: ProjectMember;
    };

/**
 * Transactional accept: create active member (if needed) + mark invitation accepted.
 * ACTIVE existing membership → idempotent accept (no role change).
 * REMOVED / INVITED membership → fail without mutation.
 */
export async function acceptProjectInvitation(
  input: {
    invitationId: string;
    acceptingUserId: string;
    acceptingUserEmail: string;
  },
  nowIso: string = new Date().toISOString(),
): Promise<AcceptProjectInvitationResult> {
  const invitationId = input.invitationId.trim();
  const acceptingUserId = input.acceptingUserId.trim();
  const acceptingUserEmail = normalizeInvitationEmail(input.acceptingUserEmail);

  if (!invitationId || !acceptingUserId || !acceptingUserEmail) {
    throw new Error("Invalid project invitation acceptance.");
  }

  const invitationRef = invitationsCollection().doc(invitationId);

  return db.runTransaction(async (tx) => {
    const invitationSnap = await tx.get(invitationRef);

    if (!invitationSnap.exists) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const invitation = normalizeProjectInvitationDocument(invitationSnap.data());

    if (!invitation) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (invitation.status !== "pending") {
      return {
        ok: false as const,
        reason: "not_pending" as const,
        invitation,
      };
    }

    if (acceptingUserEmail !== invitation.email) {
      return {
        ok: false as const,
        reason: "email_mismatch" as const,
        invitation,
      };
    }

    const memberId = createProjectMemberId(
      invitation.projectId,
      acceptingUserId,
    );
    const memberRef = membersCollection().doc(memberId);
    const memberSnap = await tx.get(memberRef);

    let member: ProjectMember;
    let createdMember = false;

    if (memberSnap.exists) {
      const existing = normalizeProjectMemberDocument(memberSnap.data());

      if (!existing) {
        return {
          ok: false as const,
          reason: "membership_exists" as const,
          invitation,
        };
      }

      if (existing.status === "removed") {
        return {
          ok: false as const,
          reason: "membership_removed" as const,
          invitation,
          member: existing,
        };
      }

      if (existing.status === "invited") {
        return {
          ok: false as const,
          reason: "membership_invited" as const,
          invitation,
          member: existing,
        };
      }

      if (existing.status !== "active") {
        return {
          ok: false as const,
          reason: "membership_exists" as const,
          invitation,
          member: existing,
        };
      }

      // Active membership already present — do not change role; complete invite.
      member = existing;
    } else {
      member = {
        id: memberId,
        projectId: invitation.projectId,
        userId: acceptingUserId,
        role: invitation.role,
        status: "active",
        invitedBy: invitation.invitedBy,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const normalizedMember = normalizeProjectMemberDocument(member);

      if (!normalizedMember) {
        throw new Error("Invalid project member for invitation acceptance.");
      }

      tx.create(memberRef, normalizedMember);
      member = normalizedMember;
      createdMember = true;
    }

    const accepted: ProjectInvitation = {
      ...invitation,
      status: "accepted",
      acceptedByUserId: acceptingUserId,
      updatedAt: nowIso,
    };

    const normalizedInvitation = normalizeProjectInvitationDocument(accepted);

    if (!normalizedInvitation) {
      throw new Error("Invalid accepted project invitation.");
    }

    tx.set(invitationRef, normalizedInvitation, { merge: false });

    return {
      ok: true as const,
      member,
      invitation: normalizedInvitation,
      createdMember,
    };
  });
}

export type DeclineProjectInvitationResult =
  | { ok: true; invitation: ProjectInvitation }
  | {
      ok: false;
      reason: "not_found" | "not_pending" | "email_mismatch";
      invitation?: ProjectInvitation;
    };

/**
 * Transactional decline: pending → declined. No ProjectMember created.
 */
export async function declineProjectInvitation(
  input: {
    invitationId: string;
    decliningUserEmail: string;
  },
  nowIso: string = new Date().toISOString(),
): Promise<DeclineProjectInvitationResult> {
  const invitationId = input.invitationId.trim();
  const decliningUserEmail = normalizeInvitationEmail(
    input.decliningUserEmail,
  );

  if (!invitationId || !decliningUserEmail) {
    throw new Error("Invalid project invitation decline.");
  }

  const invitationRef = invitationsCollection().doc(invitationId);

  return db.runTransaction(async (tx) => {
    const invitationSnap = await tx.get(invitationRef);

    if (!invitationSnap.exists) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const invitation = normalizeProjectInvitationDocument(invitationSnap.data());

    if (!invitation) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (invitation.status !== "pending") {
      return {
        ok: false as const,
        reason: "not_pending" as const,
        invitation,
      };
    }

    if (decliningUserEmail !== invitation.email) {
      return {
        ok: false as const,
        reason: "email_mismatch" as const,
        invitation,
      };
    }

    const declined: ProjectInvitation = {
      ...invitation,
      status: "declined",
      updatedAt: nowIso,
      acceptedByUserId: null,
    };

    const normalized = normalizeProjectInvitationDocument(declined);

    if (!normalized) {
      throw new Error("Invalid declined project invitation.");
    }

    tx.set(invitationRef, normalized, { merge: false });
    return { ok: true as const, invitation: normalized };
  });
}
