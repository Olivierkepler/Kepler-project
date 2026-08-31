import { setDeltaCloudMapping } from "../../store/deltaCloudMappings";
import { clearDeltaUploadPending } from "../../store/deltaUploadSyncState";
import { getDeltasForProject } from "../../store/deltas";
import {
  getMeasurementCloudMappingsForProject,
  getRemoteMeasurementId,
} from "../../store/measurementCloudMappings";
import {
  getPlanItemCloudMappingsForProject,
  getRemotePlanItemId,
} from "../../store/planItemCloudMappings";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import type { DeltaStatus } from "../../types/delta";
import { authenticatedFetch } from "./client";

export type BootstrapDeltaRequest = {
  localDeltaId: string;
  localPlanItemId: string;
  localMeasurementId: string;
  type: "length";
  plannedValue: number;
  actualValue: number;
  difference: number;
  percentDifference: number | null;
  unit: string;
  unitCost: number;
  costImpact: number;
  productionRatePerDay: number;
  scheduleImpactDays: number;
  laborHoursPerUnit: number;
  laborImpactHours: number;
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
};

export type RemoteDelta = {
  id: string;
  localDeltaId: string;
  projectId: string;
  planItemId: string;
  measurementId: string;
  type: "length";
  plannedValue: number;
  actualValue: number;
  difference: number;
  percentDifference: number | null;
  unit: string;
  unitCost: number;
  costImpact: number;
  productionRatePerDay: number;
  scheduleImpactDays: number;
  laborHoursPerUnit: number;
  laborImpactHours: number;
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
};

export type BootstrapRemoteDeltasResult = {
  created: number;
  existing: number;
  items: RemoteDelta[];
};

const BOOTSTRAP_LOCAL_PROJECT_ID = "project-001";

function normalizeRemoteStatus(value: unknown): DeltaStatus | null {
  if (value === "reviewed") {
    return "accepted";
  }

  if (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved"
  ) {
    return value;
  }

  return null;
}

function isRemoteDelta(value: unknown): value is RemoteDelta {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const percentOk =
    record.percentDifference === null ||
    typeof record.percentDifference === "number";
  const status = normalizeRemoteStatus(record.status);

  if (
    typeof record.id !== "string" ||
    typeof record.localDeltaId !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.planItemId !== "string" ||
    typeof record.measurementId !== "string" ||
    record.type !== "length" ||
    typeof record.plannedValue !== "number" ||
    typeof record.actualValue !== "number" ||
    typeof record.difference !== "number" ||
    !percentOk ||
    typeof record.unit !== "string" ||
    typeof record.unitCost !== "number" ||
    typeof record.costImpact !== "number" ||
    typeof record.productionRatePerDay !== "number" ||
    typeof record.scheduleImpactDays !== "number" ||
    typeof record.laborHoursPerUnit !== "number" ||
    typeof record.laborImpactHours !== "number" ||
    !status ||
    typeof record.createdAt !== "string"
  ) {
    return false;
  }

  const dispositionReason =
    typeof record.dispositionReason === "string"
      ? record.dispositionReason
      : "";
  const disposedAt =
    status === "open"
      ? null
      : typeof record.disposedAt === "string"
        ? record.disposedAt
        : null;

  (record as { status: DeltaStatus }).status = status;
  (record as { dispositionReason: string }).dispositionReason =
    dispositionReason;
  (record as { disposedAt: string | null }).disposedAt = disposedAt;

  return true;
}

function isBootstrapResult(
  value: unknown,
): value is BootstrapRemoteDeltasResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.created === "number" &&
    typeof record.existing === "number" &&
    Array.isArray(record.items) &&
    record.items.every(isRemoteDelta)
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
 * POST /api/projects/:remoteProjectId/deltas/bootstrap
 */
export async function bootstrapRemoteDeltas(
  remoteProjectId: string,
  items: BootstrapDeltaRequest[],
): Promise<BootstrapRemoteDeltasResult> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/bootstrap`,
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
    throw new Error("Invalid delta payload.");
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
 * GET /api/projects/:remoteProjectId/deltas
 */
export async function getRemoteDeltas(
  remoteProjectId: string,
): Promise<RemoteDelta[]> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas`,
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

  if (!Array.isArray(payload) || !payload.every(isRemoteDelta)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/** Alias for read-only cloud Delta discovery by remote project id. */
export async function getRemoteDeltasForProject(
  remoteProjectId: string,
): Promise<RemoteDelta[]> {
  return getRemoteDeltas(remoteProjectId);
}

/**
 * GET /api/deltas/:remoteDeltaId
 * Owner-scoped remote Delta read (status included).
 */
export async function getRemoteDelta(
  remoteDeltaId: string,
): Promise<RemoteDelta> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/deltas/${encodeURIComponent(remoteDeltaId)}`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Delta not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteDelta(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * PATCH /api/projects/:remoteProjectId/deltas/:remoteDeltaId
 * Phase 56 disposition update. Server owns disposedAt.
 */
export async function patchRemoteDeltaDisposition(
  remoteProjectId: string,
  remoteDeltaId: string,
  status: DeltaStatus,
  dispositionReason: string,
): Promise<RemoteDelta> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status,
          dispositionReason,
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
    throw new Error("Delta not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid delta disposition payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteDelta(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * Legacy open → accepted via disposition PATCH.
 */
export async function markRemoteDeltaReviewed(
  remoteProjectId: string,
  remoteDeltaId: string,
): Promise<RemoteDelta> {
  return patchRemoteDeltaDisposition(
    remoteProjectId,
    remoteDeltaId,
    "accepted",
    "",
  );
}

export type BootstrapDemoDeltasResult = "created" | "exists";

/**
 * Controlled Delta bootstrap for Boston (project-001) only.
 * Requires project + plan-item + measurement cloud mappings.
 * Does not mutate local Deltas or review status.
 */
export async function bootstrapDemoDeltas(
  ownerUid: string,
): Promise<BootstrapDemoDeltasResult> {
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

  const measurementMappings = await getMeasurementCloudMappingsForProject(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (measurementMappings.length === 0) {
    throw new Error("Connect measurements to cloud first.");
  }

  const localDeltas = await getDeltasForProject(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (localDeltas.length === 0) {
    throw new Error("No local deltas to upload.");
  }

  const requestItems: BootstrapDeltaRequest[] = [];

  for (const delta of localDeltas) {
    const remotePlanItemId = await getRemotePlanItemId(
      ownerUid,
      BOOTSTRAP_LOCAL_PROJECT_ID,
      delta.planItemId,
    );
    const remoteMeasurementId = await getRemoteMeasurementId(
      ownerUid,
      BOOTSTRAP_LOCAL_PROJECT_ID,
      delta.measurementId,
    );

    if (!remotePlanItemId || !remoteMeasurementId) {
      throw new Error("One or more deltas are missing cloud mappings.");
    }

    requestItems.push({
      localDeltaId: delta.id,
      localPlanItemId: delta.planItemId,
      localMeasurementId: delta.measurementId,
      type: "length",
      plannedValue: delta.plannedValue,
      actualValue: delta.actualValue,
      difference: delta.difference,
      percentDifference: delta.percentDifference,
      unit: delta.unit,
      unitCost: delta.unitCost,
      costImpact: delta.costImpact,
      productionRatePerDay: delta.productionRatePerDay,
      scheduleImpactDays: delta.scheduleImpactDays,
      laborHoursPerUnit: delta.laborHoursPerUnit,
      laborImpactHours: delta.laborImpactHours,
      status: delta.status,
      dispositionReason: delta.dispositionReason,
      disposedAt: delta.disposedAt,
      createdAt: delta.createdAt,
    });
  }

  const result = await bootstrapRemoteDeltas(remoteProjectId, requestItems);

  for (const remote of result.items) {
    const local = localDeltas.find((item) => item.id === remote.localDeltaId);

    if (!local) {
      continue;
    }

    await setDeltaCloudMapping({
      ownerUid,
      localProjectId: BOOTSTRAP_LOCAL_PROJECT_ID,
      remoteProjectId,
      localPlanItemId: local.planItemId,
      remotePlanItemId: remote.planItemId,
      localMeasurementId: local.measurementId,
      remoteMeasurementId: remote.measurementId,
      localDeltaId: remote.localDeltaId,
      remoteDeltaId: remote.id,
    });

    await clearDeltaUploadPending(
      ownerUid,
      BOOTSTRAP_LOCAL_PROJECT_ID,
      remote.localDeltaId,
    );
  }

  return result.created > 0 ? "created" : "exists";
}
