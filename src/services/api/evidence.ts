import { authenticatedFetch } from "./client";

export type EvidenceType = "photo" | "note";

export type CreateRemoteEvidenceRequest = {
  localEvidenceId: string;
  type: EvidenceType;
  note: string;
  createdAt: string;
  objectPath?: string | null;
  contentType?: string | null;
  localMeasurementId?: string | null;
  localDeltaId?: string | null;
};

export type RemoteEvidence = {
  id: string;
  projectId: string;
  localEvidenceId: string;
  type: EvidenceType;
  note: string;
  objectPath: string | null;
  contentType: string | null;
  createdAt: string;
  localMeasurementId: string | null;
  localDeltaId: string | null;
  ownerUid?: string;
  capturedByUid?: string;
};

export type EvidenceUploadUrlRequest = {
  localEvidenceId: string;
  contentType: string;
  /** Required for collaborator measurement-linked uploads (Phase 2I.1). */
  localMeasurementId?: string | null;
  /** Required for collaborator delta-linked uploads (evidence requests). */
  localDeltaId?: string | null;
};

export type EvidenceUploadUrlResponse = {
  remoteEvidenceId: string;
  localEvidenceId: string;
  uploadUrl: string;
  objectPath: string;
  contentType: string;
  expiresAt: string;
};

export type EvidenceReadUrlResponse = {
  remoteEvidenceId: string;
  readUrl: string;
  objectPath: string;
  expiresAt: string;
};

function isRemoteEvidence(value: unknown): value is RemoteEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  const localMeasurementId =
    record.localMeasurementId === undefined || record.localMeasurementId === null
      ? null
      : typeof record.localMeasurementId === "string"
        ? record.localMeasurementId
        : undefined;
  const localDeltaId =
    record.localDeltaId === undefined || record.localDeltaId === null
      ? null
      : typeof record.localDeltaId === "string"
        ? record.localDeltaId
        : undefined;

  if (localMeasurementId === undefined || localDeltaId === undefined) {
    return false;
  }

  if (localMeasurementId !== null && localDeltaId !== null) {
    return false;
  }

  if (
    typeof record.id !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.localEvidenceId !== "string" ||
    (record.type !== "photo" && record.type !== "note") ||
    typeof record.note !== "string" ||
    (record.objectPath !== null && typeof record.objectPath !== "string") ||
    (record.contentType !== null && typeof record.contentType !== "string") ||
    typeof record.createdAt !== "string" ||
    (record.ownerUid !== undefined && typeof record.ownerUid !== "string") ||
    (record.capturedByUid !== undefined &&
      typeof record.capturedByUid !== "string")
  ) {
    return false;
  }

  // Normalize onto the value for callers (missing → null).
  (record as { localMeasurementId: string | null }).localMeasurementId =
    localMeasurementId;
  (record as { localDeltaId: string | null }).localDeltaId = localDeltaId;

  return true;
}

function isUploadUrlResponse(
  value: unknown,
): value is EvidenceUploadUrlResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.remoteEvidenceId === "string" &&
    typeof record.localEvidenceId === "string" &&
    typeof record.uploadUrl === "string" &&
    typeof record.objectPath === "string" &&
    typeof record.contentType === "string" &&
    typeof record.expiresAt === "string"
  );
}

function isReadUrlResponse(value: unknown): value is EvidenceReadUrlResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.remoteEvidenceId === "string" &&
    typeof record.readUrl === "string" &&
    typeof record.objectPath === "string" &&
    typeof record.expiresAt === "string"
  );
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
 * POST /api/projects/:remoteProjectId/evidence/upload-url
 */
export async function requestEvidenceUploadUrl(
  remoteProjectId: string,
  request: EvidenceUploadUrlRequest,
): Promise<EvidenceUploadUrlResponse> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/upload-url`,
      {
        method: "POST",
        body: JSON.stringify({
          localEvidenceId: request.localEvidenceId,
          contentType: request.contentType,
          ...(request.localMeasurementId
            ? { localMeasurementId: request.localMeasurementId }
            : {}),
          ...(request.localDeltaId
            ? { localDeltaId: request.localDeltaId }
            : {}),
        }),
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
    throw new Error("Invalid evidence upload URL payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isUploadUrlResponse(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * POST /api/projects/:remoteProjectId/evidence
 */
export async function createRemoteEvidence(
  remoteProjectId: string,
  request: CreateRemoteEvidenceRequest,
): Promise<RemoteEvidence> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
      {
        method: "POST",
        body: JSON.stringify({
          localEvidenceId: request.localEvidenceId,
          type: request.type,
          note: request.note,
          createdAt: request.createdAt,
          localMeasurementId: request.localMeasurementId ?? null,
          localDeltaId: request.localDeltaId ?? null,
          ...(request.type === "photo"
            ? {
                objectPath: request.objectPath,
                contentType: request.contentType,
              }
            : {}),
        }),
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
    throw new Error("Invalid evidence payload.");
  }

  if (response.status !== 200 && response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteEvidence(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * GET /api/projects/:remoteProjectId/evidence
 */
export async function getRemoteEvidenceForProject(
  remoteProjectId: string,
): Promise<RemoteEvidence[]> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
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

  if (!Array.isArray(payload) || !payload.every(isRemoteEvidence)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * POST /api/projects/:remoteProjectId/evidence/:remoteEvidenceId/read-url
 */
export async function getRemoteEvidenceReadUrl(
  remoteProjectId: string,
  remoteEvidenceId: string,
): Promise<EvidenceReadUrlResponse> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteEvidenceId)}/read-url`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Evidence not found.");
  }

  if (response.status === 400) {
    throw new Error("Evidence does not have a readable photo object.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isReadUrlResponse(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * DELETE /api/projects/:remoteProjectId/evidence/:remoteEvidenceId
 */
export async function deleteRemoteEvidence(
  remoteProjectId: string,
  remoteEvidenceId: string,
): Promise<void> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteEvidenceId)}`,
      {
        method: "DELETE",
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Evidence not found.");
  }

  if (response.status !== 204 && response.status !== 200) {
    throw new Error("Unable to reach the authenticated API.");
  }
}
