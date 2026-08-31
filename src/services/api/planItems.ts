import type { PlanItemType } from "../../types/plan";
import { getRemoteProjectId } from "../../store/projectCloudMappings";
import { getPlanItemsForProject } from "../../store/planItems";
import { setPlanItemCloudMapping } from "../../store/planItemCloudMappings";
import { authenticatedFetch } from "./client";

export type BootstrapPlanItemRequest = {
  localPlanItemId: string;
  type: PlanItemType;
  label: string;
  plannedValue: number;
  unit: string;
  unitCost: number;
  productionRatePerDay: number;
  laborHoursPerUnit: number;
};

export type RemotePlanItem = BootstrapPlanItemRequest & {
  id: string;
  projectId: string;
};

export type BootstrapRemotePlanItemsResult = {
  created: number;
  existing: number;
  items: RemotePlanItem[];
};

const BOOTSTRAP_LOCAL_PROJECT_ID = "project-001";

function isRemotePlanItem(value: unknown): value is RemotePlanItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.localPlanItemId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.type === "string" &&
    typeof record.label === "string" &&
    typeof record.plannedValue === "number" &&
    typeof record.unit === "string" &&
    typeof record.unitCost === "number" &&
    typeof record.productionRatePerDay === "number" &&
    typeof record.laborHoursPerUnit === "number"
  );
}

function isBootstrapResult(
  value: unknown,
): value is BootstrapRemotePlanItemsResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.created === "number" &&
    typeof record.existing === "number" &&
    Array.isArray(record.items) &&
    record.items.every(isRemotePlanItem)
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
 * POST /api/projects/:remoteProjectId/plan-items/bootstrap
 */
export async function bootstrapRemotePlanItems(
  remoteProjectId: string,
  items: BootstrapPlanItemRequest[],
): Promise<BootstrapRemotePlanItemsResult> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
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
    throw new Error("Invalid plan item payload.");
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

export type UpdateRemotePlanItemRequest = {
  label?: string;
  plannedValue?: number;
  unitCost?: number;
  productionRatePerDay?: number;
  laborHoursPerUnit?: number;
};

/**
 * PATCH /api/projects/:remoteProjectId/plan-items/:remotePlanItemId
 */
export async function updateRemotePlanItem(
  remoteProjectId: string,
  remotePlanItemId: string,
  update: UpdateRemotePlanItemRequest,
): Promise<RemotePlanItem> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(update),
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Plan item not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid plan item update payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemotePlanItem(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * GET /api/projects/:remoteProjectId/plan-items
 * Reads by canonical remote project ID (not local projectId).
 */
export async function getRemotePlanItems(
  remoteProjectId: string,
): Promise<RemotePlanItem[]> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items`,
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

  if (!Array.isArray(payload) || !payload.every(isRemotePlanItem)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/** Alias for read-only cloud PlanItem discovery by remote project id. */
export async function getRemotePlanItemsForProject(
  remoteProjectId: string,
): Promise<RemotePlanItem[]> {
  return getRemotePlanItems(remoteProjectId);
}

export type BootstrapDemoPlanItemsResult = "created" | "exists";

/**
 * Controlled PlanItem bootstrap for Boston (project-001) only.
 * Requires an existing user-scoped project cloud mapping.
 */
export async function bootstrapDemoPlanItems(
  ownerUid: string,
): Promise<BootstrapDemoPlanItemsResult> {
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

  const localItems = await getPlanItemsForProject(
    ownerUid,
    BOOTSTRAP_LOCAL_PROJECT_ID,
  );

  if (localItems.length === 0) {
    throw new Error("Demo plan items are not available locally.");
  }

  const requestItems: BootstrapPlanItemRequest[] = localItems.map((item) => ({
    localPlanItemId: item.id,
    type: item.type,
    label: item.label,
    plannedValue: item.plannedValue,
    unit: item.unit,
    unitCost: item.unitCost,
    productionRatePerDay: item.productionRatePerDay,
    laborHoursPerUnit: item.laborHoursPerUnit,
  }));

  const result = await bootstrapRemotePlanItems(
    remoteProjectId,
    requestItems,
  );

  for (const remote of result.items) {
    await setPlanItemCloudMapping({
      ownerUid,
      localProjectId: BOOTSTRAP_LOCAL_PROJECT_ID,
      remoteProjectId,
      localPlanItemId: remote.localPlanItemId,
      remotePlanItemId: remote.id,
    });
  }

  return result.created > 0 ? "created" : "exists";
}

/* -------------------------------------------------------------------------- */
/* PlanItem provenance (Phase 2P.6) — read-only, lazy-loaded                  */
/* -------------------------------------------------------------------------- */

export type PlanItemProvenanceQuantity = {
  label: string;
  type: string;
  plannedValue: number | null;
  unit: string | null;
};

export type PlanItemProvenanceSource = {
  fileId: string;
  fileName: string;
  mimeType: string | null;
  page: number | null;
  reference: string | null;
  excerpt: string | null;
};

export type PlanItemProvenanceCandidate = {
  id: string;
  confidence: number;
  original: PlanItemProvenanceQuantity;
  reviewed: PlanItemProvenanceQuantity;
  reviewedAt: string | null;
  reviewedByUid: string | null;
  source: PlanItemProvenanceSource;
};

export type PlanItemProvenanceImport = {
  id: string;
  approvedAt: string | null;
  approvedByUid: string | null;
};

export type PlanItemProvenance = {
  origin: "manual" | "plan_import";
  planItemId: string;
  import?: PlanItemProvenanceImport;
  candidate?: PlanItemProvenanceCandidate;
};

function isProvenanceQuantity(
  value: unknown,
): value is PlanItemProvenanceQuantity {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.label === "string" &&
    typeof record.type === "string" &&
    (record.plannedValue === null || typeof record.plannedValue === "number") &&
    (record.unit === null || typeof record.unit === "string")
  );
}

function isPlanItemProvenance(value: unknown): value is PlanItemProvenance {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    (record.origin !== "manual" && record.origin !== "plan_import") ||
    typeof record.planItemId !== "string"
  ) {
    return false;
  }
  if (record.origin === "manual") {
    return true;
  }
  if (typeof record.import !== "object" || record.import === null) {
    return false;
  }
  if (typeof record.candidate !== "object" || record.candidate === null) {
    return false;
  }
  const importRecord = record.import as Record<string, unknown>;
  const candidate = record.candidate as Record<string, unknown>;
  if (
    typeof importRecord.id !== "string" ||
    (importRecord.approvedAt !== null &&
      typeof importRecord.approvedAt !== "string") ||
    (importRecord.approvedByUid !== null &&
      typeof importRecord.approvedByUid !== "string")
  ) {
    return false;
  }
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.confidence !== "number" ||
    !isProvenanceQuantity(candidate.original) ||
    !isProvenanceQuantity(candidate.reviewed) ||
    typeof candidate.source !== "object" ||
    candidate.source === null
  ) {
    return false;
  }
  const source = candidate.source as Record<string, unknown>;
  return (
    typeof source.fileId === "string" &&
    typeof source.fileName === "string" &&
    (source.mimeType === null || typeof source.mimeType === "string") &&
    (source.page === null || typeof source.page === "number") &&
    (source.reference === null || typeof source.reference === "string") &&
    (source.excerpt === null || typeof source.excerpt === "string")
  );
}

/**
 * GET /api/projects/:remoteProjectId/plan-items/:remotePlanItemId/provenance
 * Lazy-loaded read model. Does not mutate PlanItems.
 */
export async function getRemotePlanItemProvenance(
  remoteProjectId: string,
  remotePlanItemId: string,
): Promise<PlanItemProvenance> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}/provenance`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Plan item not found.");
  }

  if (response.status === 409) {
    throw new Error("Source details are unavailable for this plan item.");
  }

  if (!response.ok) {
    throw new Error("Unable to load source details.");
  }

  const payload = await parseJson(response);

  if (!isPlanItemProvenance(payload)) {
    throw new Error("Unable to load source details.");
  }

  return payload;
}
