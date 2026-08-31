import {
  getPlanItemCloudMappingsForProject,
  getRemotePlanItemId,
} from "../../store/planItemCloudMappings";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { setMeasurementCloudMapping } from "../../store/measurementCloudMappings";
import { clearMeasurementUploadPending } from "../../store/measurementUploadSyncState";
import { getMeasurementsForProject } from "../../store/measurements";
import type { MeasurementType } from "../../types/measurement";
import type { MeasurementReviewStatus } from "../../utils/measurementReview";
import { authenticatedFetch } from "./client";

export type BootstrapMeasurementRequest = {
  localMeasurementId: string;
  localPlanItemId: string;
  type: MeasurementType;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
};

export type RemoteMeasurement = {
  id: string;
  localMeasurementId: string;
  projectId: string;
  planItemId: string;
  type: MeasurementType;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
  /** Present on Phase 2I.1+ creates; optional for older records. */
  capturedByUid?: string;
  /** Contribution review (Phase 2J.1+). Absent on legacy → effective accepted. */
  reviewStatus?: MeasurementReviewStatus;
  reviewedByUid?: string;
  reviewedAt?: string;
  reviewNote?: string;
  capturedByProjectMemberId?: string;
  submittedAssignmentId?: string;
  submittedWorkPackageId?: string;
};

export type ReviewRemoteMeasurementInput = {
  status: "accepted" | "rejected";
  note?: string;
};

export type BootstrapRemoteMeasurementsResult = {
  created: number;
  existing: number;
  items: RemoteMeasurement[];
};

const BOOTSTRAP_LOCAL_PROJECT_ID = "project-001";

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isMeasurementReviewStatus(
  value: unknown,
): value is MeasurementReviewStatus {
  return (
    value === "pending" || value === "accepted" || value === "rejected"
  );
}

function isRemoteMeasurement(value: unknown): value is RemoteMeasurement {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    record.reviewStatus !== undefined &&
    !isMeasurementReviewStatus(record.reviewStatus)
  ) {
    return false;
  }

  return (
    typeof record.id === "string" &&
    typeof record.localMeasurementId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.planItemId === "string" &&
    typeof record.type === "string" &&
    typeof record.label === "string" &&
    typeof record.value === "number" &&
    typeof record.unit === "string" &&
    typeof record.createdAt === "string" &&
    isOptionalString(record.capturedByUid) &&
    isOptionalString(record.reviewedByUid) &&
    isOptionalString(record.reviewedAt) &&
    isOptionalString(record.reviewNote) &&
    isOptionalString(record.capturedByProjectMemberId) &&
    isOptionalString(record.submittedAssignmentId) &&
    isOptionalString(record.submittedWorkPackageId)
  );
}

function isBootstrapResult(
  value: unknown,
): value is BootstrapRemoteMeasurementsResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.created === "number" &&
    typeof record.existing === "number" &&
    Array.isArray(record.items) &&
    record.items.every(isRemoteMeasurement)
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
 * POST /api/projects/:remoteProjectId/measurements/bootstrap
 */
export async function bootstrapRemoteMeasurements(
  remoteProjectId: string,
  items: BootstrapMeasurementRequest[],
): Promise<BootstrapRemoteMeasurementsResult> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/measurements/bootstrap`,
      {
        method: "POST",
        body: JSON.stringify({ items }),
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
    throw new Error("Invalid measurement payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isBootstrapResult(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * GET /api/projects/:remoteProjectId/measurements
 */
export async function getRemoteMeasurements(
  remoteProjectId: string,
): Promise<RemoteMeasurement[]> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/measurements`,
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

  if (!Array.isArray(payload) || !payload.every(isRemoteMeasurement)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/** Alias for read-only cloud Measurement discovery by remote project id. */
export async function getRemoteMeasurementsForProject(
  remoteProjectId: string,
): Promise<RemoteMeasurement[]> {
  return getRemoteMeasurements(remoteProjectId);
}

/**
 * GET /api/projects/:remoteProjectId/measurements?reviewStatus=pending
 * Owner-only pending contribution queue (Phase 2J.1 / 2J.2).
 */
export async function getPendingRemoteMeasurements(
  remoteProjectId: string,
): Promise<RemoteMeasurement[]> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/measurements?reviewStatus=pending`,
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
    throw new Error("Invalid reviewStatus filter.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!Array.isArray(payload) || !payload.every(isRemoteMeasurement)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * PATCH /api/projects/:remoteProjectId/measurements/:measurementId/review
 * Owner-only contribution review mutation (Phase 2J.1 / 2J.2).
 */
export async function reviewRemoteMeasurement(
  remoteProjectId: string,
  measurementId: string,
  input: ReviewRemoteMeasurementInput,
): Promise<RemoteMeasurement> {
  const projectId = remoteProjectId.trim();
  const remoteMeasurementId = measurementId.trim();

  if (!projectId || !remoteMeasurementId) {
    throw new Error("Invalid review payload.");
  }

  if (input.status !== "accepted" && input.status !== "rejected") {
    throw new Error("Invalid review payload.");
  }

  const body: ReviewRemoteMeasurementInput = {
    status: input.status,
  };

  if (typeof input.note === "string") {
    const trimmed = input.note.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 2000) {
        throw new Error("Review note is too long.");
      }
      body.note = trimmed;
    }
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/measurements/${encodeURIComponent(remoteMeasurementId)}/review`,
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
    throw new Error("Measurement not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid review payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteMeasurement(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

export type CreateSharedMeasurementInput = {
  localMeasurementId: string;
  planItemId: string;
  type: MeasurementType;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
};

/**
 * POST /api/measurements — cloud-direct shared field contribution (Phase 2I.2).
 * Does not write AsyncStorage. Does not send capturedByUid / ownerUid / role.
 * Server owns actor attribution and scope validation.
 */
export async function createSharedRemoteMeasurement(
  remoteProjectId: string,
  input: CreateSharedMeasurementInput,
): Promise<RemoteMeasurement> {
  const projectId = remoteProjectId.trim();
  const localMeasurementId = input.localMeasurementId.trim();

  if (!projectId || !localMeasurementId || localMeasurementId.includes("/")) {
    throw new Error("Invalid measurement payload.");
  }

  const remoteId = `${projectId}_${localMeasurementId}`;

  let response: Response;

  try {
    response = await authenticatedFetch("/api/measurements", {
      method: "POST",
      body: JSON.stringify({
        id: remoteId,
        localMeasurementId,
        projectId,
        planItemId: input.planItemId,
        type: input.type,
        label: input.label,
        value: input.value,
        unit: input.unit,
        createdAt: input.createdAt,
      }),
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error(
      "This work is no longer available for field contribution.",
    );
  }

  if (response.status === 400) {
    throw new Error("Invalid measurement payload.");
  }

  if (response.status === 409) {
    throw new Error("Measurement already exists.");
  }

  if (response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteMeasurement(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

export type BootstrapDemoMeasurementsResult = "created" | "exists";

/**
 * Controlled Measurement bootstrap for Boston (project-001) only.
 * Requires project + plan-item cloud mappings. Does not mutate local Measurements.
 */
export async function bootstrapDemoMeasurements(
  ownerUid: string,
): Promise<BootstrapDemoMeasurementsResult> {
  if (!ownerUid.trim()) {
    throw new Error("Your session could not be authenticated.");
  }

  const remoteProjectId = await getRemoteProjectId(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (!remoteProjectId) {
    throw new Error("Connect the project to cloud first.");
  }

  const planMappings = await getPlanItemCloudMappingsForProject(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (planMappings.length === 0) {
    throw new Error("Connect plan items to cloud first.");
  }

  const localMeasurements = await getMeasurementsForProject(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (localMeasurements.length === 0) {
    throw new Error("No local measurements to upload.");
  }

  const requestItems: BootstrapMeasurementRequest[] = [];

  for (const measurement of localMeasurements) {
    const remotePlanItemId = await getRemotePlanItemId(
      ownerUid,
      BOOTSTRAP_LOCAL_PROJECT_ID,
      measurement.planItemId,
    );

    if (!remotePlanItemId) {
      throw new Error(
        "One or more measurements are missing plan-item mappings.",
      );
    }

    requestItems.push({
      localMeasurementId: measurement.id,
      localPlanItemId: measurement.planItemId,
      type: measurement.type,
      label: measurement.label,
      value: measurement.value,
      unit: measurement.unit,
      createdAt: measurement.createdAt,
    });
  }

  const result = await bootstrapRemoteMeasurements(
    remoteProjectId,
    requestItems,
  );

  for (const remote of result.items) {
    const local = localMeasurements.find(
      (item) => item.id === remote.localMeasurementId,
    );

    if (!local) {
      continue;
    }

    await setMeasurementCloudMapping({
      ownerUid,
      localProjectId: BOOTSTRAP_LOCAL_PROJECT_ID,
      remoteProjectId,
      localPlanItemId: local.planItemId,
      remotePlanItemId: remote.planItemId,
      localMeasurementId: remote.localMeasurementId,
      remoteMeasurementId: remote.id,
    });

    await clearMeasurementUploadPending(
      ownerUid,
      BOOTSTRAP_LOCAL_PROJECT_ID,
      remote.localMeasurementId,
    );
  }

  return result.created > 0 ? "created" : "exists";
}
