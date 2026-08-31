/**
 * Cloud WorkPackageAssignment API (Phase 2E reads + Phase 2G owner writes).
 *
 * Canonical remote Assignment records from Phase 2D.
 * Does NOT write AsyncStorage or mutate src/store/workPackageAssignments.ts.
 * Does NOT convert projectMemberId → userId.
 */

import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import { authenticatedFetch } from "./client";

const WORK_PACKAGE_ASSIGNMENT_STATUSES: readonly WorkPackageAssignmentStatus[] =
  [
    "assigned",
    "accepted",
    "in_progress",
    "ready_for_review",
    "completed",
    "cancelled",
  ];

/**
 * Cloud WorkPackageAssignment DTO from work-package-assignments routes.
 * IDs are canonical remote Firestore identities — not local AsyncStorage ids.
 */
export type RemoteWorkPackageAssignment = {
  id: string;
  projectId: string;
  workPackageId: string;
  /** Canonical cloud ProjectMember.id — not Firebase userId. */
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateRemoteWorkPackageAssignmentInput = {
  workPackageId: string;
  projectMemberId: string;
  status?: WorkPackageAssignmentStatus;
};

export type UpdateRemoteWorkPackageAssignmentInput = {
  status: WorkPackageAssignmentStatus;
  note?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWorkPackageAssignmentStatus(
  value: unknown,
): value is WorkPackageAssignmentStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_ASSIGNMENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Runtime parser for a single cloud Assignment response object.
 * Rejects invalid status / malformed fields. Preserves canonical IDs.
 * Does not map projectMemberId to userId.
 */
export function parseRemoteWorkPackageAssignment(
  value: unknown,
): RemoteWorkPackageAssignment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.workPackageId) ||
    !isNonEmptyString(record.projectMemberId) ||
    !isWorkPackageAssignmentStatus(record.status) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    workPackageId: record.workPackageId.trim(),
    projectMemberId: record.projectMemberId.trim(),
    status: record.status,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Unable to reach the authenticated API.");
  }
}

function mapAuthFetchError(error: unknown): never {
  if (error instanceof Error && error.message === "Not authenticated") {
    throw new Error("Your session could not be authenticated.");
  }

  throw new Error("Unable to reach the authenticated API.");
}

/**
 * GET /api/projects/:remoteProjectId/work-package-assignments
 * Reads by canonical remote project ID. No local-store side effects.
 * Does not filter to the current user's assignments.
 */
export async function getRemoteWorkPackageAssignmentsForProject(
  remoteProjectId: string,
): Promise<RemoteWorkPackageAssignment[]> {
  const projectId = remoteProjectId.trim();

  if (!projectId) {
    throw new Error("Project not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Project not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!Array.isArray(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const items: RemoteWorkPackageAssignment[] = [];

  for (const entry of payload) {
    const parsed = parseRemoteWorkPackageAssignment(entry);
    if (!parsed) {
      throw new Error("Unable to reach the authenticated API.");
    }
    items.push(parsed);
  }

  return items;
}

/**
 * GET /api/projects/:remoteProjectId/work-package-assignments/:assignmentId
 * No local-store side effects.
 */
export async function getRemoteWorkPackageAssignment(
  remoteProjectId: string,
  assignmentId: string,
): Promise<RemoteWorkPackageAssignment> {
  const projectId = remoteProjectId.trim();
  const id = assignmentId.trim();

  if (!projectId || !id) {
    throw new Error("Work package assignment not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Work package assignment not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackageAssignment(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * POST /api/projects/:remoteProjectId/work-package-assignments
 * Owner-only on the backend. Sends projectMemberId (not userId).
 */
export async function createRemoteWorkPackageAssignment(
  remoteProjectId: string,
  input: CreateRemoteWorkPackageAssignmentInput,
): Promise<RemoteWorkPackageAssignment> {
  const projectId = remoteProjectId.trim();
  const workPackageId = input.workPackageId.trim();
  const projectMemberId = input.projectMemberId.trim();

  if (!projectId) {
    throw new Error("Project not found.");
  }

  if (!workPackageId || !projectMemberId) {
    throw new Error("Invalid work package assignment payload.");
  }

  const body: Record<string, unknown> = {
    workPackageId,
    projectMemberId,
  };

  if (input.status !== undefined) {
    body.status = input.status;
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Project not found.");
  }

  if (response.status === 409) {
    throw new Error(
      "An active assignment already exists for this work package and member.",
    );
  }

  if (response.status === 400) {
    throw new Error("Invalid work package assignment payload.");
  }

  if (response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackageAssignment(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * PATCH /api/projects/:remoteProjectId/work-package-assignments/:assignmentId
 * Owner or assignment member (Phase 2K.1). Status + optional note.
 */
export async function updateRemoteWorkPackageAssignment(
  remoteProjectId: string,
  assignmentId: string,
  patch: UpdateRemoteWorkPackageAssignmentInput,
): Promise<RemoteWorkPackageAssignment> {
  const projectId = remoteProjectId.trim();
  const id = assignmentId.trim();

  if (!projectId || !id) {
    throw new Error("Work package assignment not found.");
  }

  if (!isWorkPackageAssignmentStatus(patch.status)) {
    throw new Error("Invalid work package assignment update payload.");
  }

  const body: UpdateRemoteWorkPackageAssignmentInput = {
    status: patch.status,
  };

  if (typeof patch.note === "string") {
    const trimmed = patch.note.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 2000) {
        throw new Error("Progress note is too long.");
      }
      body.note = trimmed;
    }
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Work package assignment not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid work package assignment update payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackageAssignment(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * DELETE /api/projects/:remoteProjectId/work-package-assignments/:assignmentId
 * Owner-only. Does not delete ProjectMember / WorkPackage / PlanItems.
 */
export async function deleteRemoteWorkPackageAssignment(
  remoteProjectId: string,
  assignmentId: string,
): Promise<void> {
  const projectId = remoteProjectId.trim();
  const id = assignmentId.trim();

  if (!projectId || !id) {
    throw new Error("Work package assignment not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Work package assignment not found.");
  }

  if (response.status !== 204 && !response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }
}
