/**
 * Cloud WorkPackage API (Phase 2E reads + Phase 2F owner writes).
 *
 * Returns / mutates canonical remote WorkPackage records from Phase 2C.
 * Does NOT write AsyncStorage or mutate src/store/workPackages.ts.
 * Assignment APIs are out of scope.
 */

import type { WorkPackageStatus } from "../../types/workPackage";
import { authenticatedFetch } from "./client";

const WORK_PACKAGE_STATUSES: readonly WorkPackageStatus[] = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

/**
 * Cloud WorkPackage DTO from work-packages routes.
 * IDs are canonical remote Firestore identities — not local AsyncStorage ids.
 */
export type RemoteWorkPackage = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: WorkPackageStatus;
  /** Canonical cloud PlanItem document ids. */
  planItemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateRemoteWorkPackageInput = {
  name: string;
  description?: string;
  status?: WorkPackageStatus;
  planItemIds?: string[];
};

export type UpdateRemoteWorkPackageInput = {
  name?: string;
  description?: string;
  status?: WorkPackageStatus;
  planItemIds?: string[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWorkPackageStatus(value: unknown): value is WorkPackageStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_STATUSES as readonly string[]).includes(value)
  );
}

function parsePlanItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];

  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return null;
    }
    ids.push(entry.trim());
  }

  return ids;
}

/**
 * Runtime parser for a single cloud WorkPackage response object.
 * Rejects invalid status / malformed fields. Preserves canonical IDs.
 */
export function parseRemoteWorkPackage(
  value: unknown,
): RemoteWorkPackage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const planItemIds = parsePlanItemIds(record.planItemIds);

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.name) ||
    !isWorkPackageStatus(record.status) ||
    planItemIds === null ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) {
    return null;
  }

  if (
    record.description !== undefined &&
    typeof record.description !== "string"
  ) {
    return null;
  }

  const description =
    typeof record.description === "string" &&
    record.description.trim().length > 0
      ? record.description
      : undefined;

  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    name: record.name.trim(),
    ...(description !== undefined ? { description } : {}),
    status: record.status,
    planItemIds,
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
 * GET /api/projects/:remoteProjectId/work-packages
 * Reads by canonical remote project ID. No local-store side effects.
 */
export async function getRemoteWorkPackagesForProject(
  remoteProjectId: string,
): Promise<RemoteWorkPackage[]> {
  const projectId = remoteProjectId.trim();

  if (!projectId) {
    throw new Error("Project not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-packages`,
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

  const items: RemoteWorkPackage[] = [];

  for (const entry of payload) {
    const parsed = parseRemoteWorkPackage(entry);
    if (!parsed) {
      throw new Error("Unable to reach the authenticated API.");
    }
    items.push(parsed);
  }

  return items;
}

/**
 * GET /api/projects/:remoteProjectId/work-packages/:workPackageId
 * No local-store side effects.
 */
export async function getRemoteWorkPackage(
  remoteProjectId: string,
  workPackageId: string,
): Promise<RemoteWorkPackage> {
  const projectId = remoteProjectId.trim();
  const id = workPackageId.trim();

  if (!projectId || !id) {
    throw new Error("Work package not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-packages/${encodeURIComponent(id)}`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Work package not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackage(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * POST /api/projects/:remoteProjectId/work-packages
 * Owner-only on the backend. Does not mutate local stores.
 */
export async function createRemoteWorkPackage(
  remoteProjectId: string,
  input: CreateRemoteWorkPackageInput,
): Promise<RemoteWorkPackage> {
  const projectId = remoteProjectId.trim();
  const name = input.name.trim();

  if (!projectId) {
    throw new Error("Project not found.");
  }

  if (!name) {
    throw new Error("Invalid work package payload.");
  }

  const body: Record<string, unknown> = { name };

  if (input.description !== undefined) {
    body.description = input.description;
  }

  if (input.status !== undefined) {
    body.status = input.status;
  }

  if (input.planItemIds !== undefined) {
    body.planItemIds = input.planItemIds;
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-packages`,
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

  if (response.status === 400) {
    throw new Error("Invalid work package payload.");
  }

  if (response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackage(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * PATCH /api/projects/:remoteProjectId/work-packages/:workPackageId
 * Owner-only on the backend. Does not mutate local stores.
 */
export async function updateRemoteWorkPackage(
  remoteProjectId: string,
  workPackageId: string,
  patch: UpdateRemoteWorkPackageInput,
): Promise<RemoteWorkPackage> {
  const projectId = remoteProjectId.trim();
  const id = workPackageId.trim();

  if (!projectId || !id) {
    throw new Error("Work package not found.");
  }

  if (
    patch.name === undefined &&
    patch.description === undefined &&
    patch.status === undefined &&
    patch.planItemIds === undefined
  ) {
    throw new Error("Invalid work package update payload.");
  }

  const body: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    body.name = patch.name;
  }

  if (patch.description !== undefined) {
    body.description = patch.description;
  }

  if (patch.status !== undefined) {
    body.status = patch.status;
  }

  if (patch.planItemIds !== undefined) {
    body.planItemIds = patch.planItemIds;
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-packages/${encodeURIComponent(id)}`,
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
    throw new Error("Work package not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid work package update payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);
  const parsed = parseRemoteWorkPackage(payload);

  if (!parsed) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return parsed;
}

/**
 * DELETE /api/projects/:remoteProjectId/work-packages/:workPackageId
 * Owner-only on the backend. Does not delete PlanItems or local stores.
 */
export async function deleteRemoteWorkPackage(
  remoteProjectId: string,
  workPackageId: string,
): Promise<void> {
  const projectId = remoteProjectId.trim();
  const id = workPackageId.trim();

  if (!projectId || !id) {
    throw new Error("Work package not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/work-packages/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Work package not found.");
  }

  if (response.status !== 204 && !response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }
}
