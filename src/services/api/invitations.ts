/**
 * Cloud ProjectInvitation API (Phase 2N.1) — mirrors backend Phase 1G contracts.
 */

import type { ProjectMember, ProjectMemberRole } from "../../types/projectMember";
import { authenticatedFetch } from "./client";

export type RemoteProjectInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type InvitableRemoteRole = Exclude<ProjectMemberRole, "owner">;

export type RemoteProjectInvitation = {
  id: string;
  /** Remote Firestore project document ID. */
  projectId: string;
  email: string;
  role: ProjectMemberRole;
  status: RemoteProjectInvitationStatus;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
  acceptedByUserId: string | null;
};

export type AcceptInvitationResult = {
  member: ProjectMember;
  invitation: RemoteProjectInvitation;
};

const INVITABLE_ROLES: readonly InvitableRemoteRole[] = [
  "project_admin",
  "contractor",
  "field_member",
  "viewer",
];

const INVITATION_STATUSES: readonly RemoteProjectInvitationStatus[] = [
  "pending",
  "accepted",
  "declined",
  "revoked",
];

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }
  return fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProjectMemberRole(value: unknown): value is ProjectMemberRole {
  return (
    value === "owner" ||
    value === "project_admin" ||
    value === "contractor" ||
    value === "field_member" ||
    value === "viewer"
  );
}

function isInvitableRole(value: unknown): value is InvitableRemoteRole {
  return (
    typeof value === "string" &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}

function parseRemoteInvitation(
  value: unknown,
): RemoteProjectInvitation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.email) ||
    !isProjectMemberRole(record.role) ||
    typeof record.status !== "string" ||
    !(INVITATION_STATUSES as readonly string[]).includes(record.status) ||
    !isNonEmptyString(record.invitedBy) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  let acceptedByUserId: string | null = null;
  if (record.acceptedByUserId === null || record.acceptedByUserId === undefined) {
    acceptedByUserId = null;
  } else if (isNonEmptyString(record.acceptedByUserId)) {
    acceptedByUserId = record.acceptedByUserId.trim();
  } else {
    return null;
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    email: record.email.trim().toLowerCase(),
    role: record.role,
    status: record.status as RemoteProjectInvitationStatus,
    invitedBy: record.invitedBy.trim(),
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
    acceptedByUserId,
  };
}

function parseProjectMember(value: unknown): ProjectMember | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.userId) ||
    !isProjectMemberRole(record.role) ||
    (record.status !== "invited" &&
      record.status !== "active" &&
      record.status !== "removed") ||
    !isNonEmptyString(record.invitedBy) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    userId: record.userId.trim(),
    role: record.role,
    status: record.status,
    invitedBy: record.invitedBy.trim(),
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

/**
 * POST /api/projects/:remoteProjectId/invitations
 * Body: { email, role } — owner-only on backend.
 */
export async function createProjectInvitation(
  remoteProjectId: string,
  input: { email: string; role: InvitableRemoteRole },
): Promise<RemoteProjectInvitation> {
  const projectId = remoteProjectId.trim();
  if (!projectId) {
    throw new Error("projectId is required");
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !isInvitableRole(input.role)) {
    throw new Error("Invalid invitation payload");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/invitations`,
    {
      method: "POST",
      body: JSON.stringify({ email, role: input.role }),
    },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Invitation could not be created."),
    );
  }

  const parsed = parseRemoteInvitation(body);
  if (!parsed) {
    throw new Error("Invitation could not be created.");
  }

  return parsed;
}

/**
 * GET /api/projects/:remoteProjectId/invitations — owner list.
 */
export async function listProjectInvitations(
  remoteProjectId: string,
): Promise<RemoteProjectInvitation[]> {
  const projectId = remoteProjectId.trim();
  if (!projectId) {
    throw new Error("projectId is required");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/invitations`,
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Invitations could not be loaded."),
    );
  }

  if (!Array.isArray(body)) {
    throw new Error("Invitations could not be loaded.");
  }

  const items: RemoteProjectInvitation[] = [];
  for (const entry of body) {
    const parsed = parseRemoteInvitation(entry);
    if (!parsed) {
      throw new Error("Invitations could not be loaded.");
    }
    items.push(parsed);
  }

  return items;
}

/**
 * GET /api/me/invitations — pending invitations for authenticated email.
 */
export async function getMyInvitations(): Promise<RemoteProjectInvitation[]> {
  const response = await authenticatedFetch("/api/me/invitations");
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Invitations could not be loaded."),
    );
  }

  if (!Array.isArray(body)) {
    throw new Error("Invitations could not be loaded.");
  }

  const items: RemoteProjectInvitation[] = [];
  for (const entry of body) {
    const parsed = parseRemoteInvitation(entry);
    if (!parsed) {
      throw new Error("Invitations could not be loaded.");
    }
    items.push(parsed);
  }

  return items;
}

/**
 * POST /api/invitations/:invitationId/accept
 */
export async function acceptInvitation(
  invitationId: string,
): Promise<AcceptInvitationResult> {
  const id = invitationId.trim();
  if (!id) {
    throw new Error("invitationId is required");
  }

  const response = await authenticatedFetch(
    `/api/invitations/${encodeURIComponent(id)}/accept`,
    { method: "POST" },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Invitation could not be accepted."),
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Invitation could not be accepted.");
  }

  const record = body as Record<string, unknown>;
  const member = parseProjectMember(record.member);
  const invitation = parseRemoteInvitation(record.invitation);

  if (!member || !invitation) {
    throw new Error("Invitation could not be accepted.");
  }

  return { member, invitation };
}

/**
 * POST /api/invitations/:invitationId/decline
 */
export async function declineInvitation(
  invitationId: string,
): Promise<RemoteProjectInvitation> {
  const id = invitationId.trim();
  if (!id) {
    throw new Error("invitationId is required");
  }

  const response = await authenticatedFetch(
    `/api/invitations/${encodeURIComponent(id)}/decline`,
    { method: "POST" },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Invitation could not be declined."),
    );
  }

  const parsed = parseRemoteInvitation(body);
  if (!parsed) {
    throw new Error("Invitation could not be declined.");
  }

  return parsed;
}
