import { uploadLocalFileToSignedUrl } from "../storage/uploadLocalFileToSignedUrl";

import { authenticatedFetch } from "./client";

export type RemotePlanImportStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "ready_for_approval"
  | "approved"
  | "failed";

export type RemotePlanImportFileUploadStatus =
  | "pending"
  | "uploaded"
  | "failed";

export type RemotePlanImportFile = {
  id: string;
  localFileId: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadStatus: RemotePlanImportFileUploadStatus;
};

export type RemotePlanImport = {
  id: string;
  projectId: string;
  ownerUid: string;
  createdByUid: string;
  localImportId: string;
  status: RemotePlanImportStatus;
  files: RemotePlanImportFile[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  approvedAt?: string;
  approvedByUid?: string;
  createdPlanItemIds?: string[];
  selectedCandidateCount?: number;
  createdPlanItemCount?: number;
};

export type CreateRemotePlanImportFileInput = {
  localFileId: string;
  name: string;
  mimeType: string;
  size: number;
};

export type CreateRemotePlanImportRequest = {
  localImportId: string;
  files: CreateRemotePlanImportFileInput[];
};

export type PlanImportUploadDescriptor = {
  fileId: string;
  localFileId: string;
  uploadUrl: string;
  storagePath: string;
  contentType: string;
  expiresAt: string;
};

export type CreateRemotePlanImportResponse = {
  import: RemotePlanImport;
  uploads: PlanImportUploadDescriptor[];
};

export type CommitRemotePlanImportResponse = {
  import: RemotePlanImport;
};

export type GetRemotePlanImportResponse = {
  import: RemotePlanImport;
};

function isRemotePlanImportFile(value: unknown): value is RemotePlanImportFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.localFileId === "string" &&
    typeof record.name === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.size === "number" &&
    typeof record.storagePath === "string" &&
    (record.uploadStatus === "pending" ||
      record.uploadStatus === "uploaded" ||
      record.uploadStatus === "failed")
  );
}

function isRemotePlanImport(value: unknown): value is RemotePlanImport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.ownerUid !== "string" ||
    typeof record.createdByUid !== "string" ||
    typeof record.localImportId !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !Array.isArray(record.files) ||
    (record.status !== "uploading" &&
      record.status !== "uploaded" &&
      record.status !== "processing" &&
      record.status !== "ready_for_review" &&
      record.status !== "ready_for_approval" &&
      record.status !== "approved" &&
      record.status !== "failed")
  ) {
    return false;
  }

  if (!record.files.every(isRemotePlanImportFile)) {
    return false;
  }

  if (
    record.errorMessage !== undefined &&
    typeof record.errorMessage !== "string"
  ) {
    return false;
  }

  return true;
}

function isUploadDescriptor(
  value: unknown,
): value is PlanImportUploadDescriptor {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.fileId === "string" &&
    typeof record.localFileId === "string" &&
    typeof record.uploadUrl === "string" &&
    typeof record.storagePath === "string" &&
    typeof record.contentType === "string" &&
    typeof record.expiresAt === "string"
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // fall through
  }

  return `Request failed (${response.status})`;
}

/**
 * Create (or idempotently resume) a remote PlanImport and receive signed PUTs.
 * Uses canonical remoteProjectId in the path (never local project id).
 */
export async function createRemotePlanImport(
  remoteProjectId: string,
  request: CreateRemotePlanImportRequest,
): Promise<CreateRemotePlanImportResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import create response");
  }

  const record = payload as Record<string, unknown>;

  if (!isRemotePlanImport(record.import) || !Array.isArray(record.uploads)) {
    throw new Error("Invalid plan import create response");
  }

  if (!record.uploads.every(isUploadDescriptor)) {
    throw new Error("Invalid plan import upload descriptors");
  }

  return {
    import: record.import,
    uploads: record.uploads,
  };
}

/**
 * PUT file bytes to a short-lived signed GCS URL.
 * Uses the shared Evidence-compatible FileSystem.uploadAsync helper.
 * Does not log the URL.
 */
export async function uploadPlanImportFile(
  uploadUrl: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  await uploadLocalFileToSignedUrl({
    uploadUrl,
    localUri,
    contentType,
  });
}

/**
 * Commit after all signed uploads succeed. Server verifies objects exist.
 */
export async function commitPlanImport(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<CommitRemotePlanImportResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/commit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import commit response");
  }

  const record = payload as Record<string, unknown>;

  if (!isRemotePlanImport(record.import)) {
    throw new Error("Invalid plan import commit response");
  }

  return { import: record.import };
}

export async function getRemotePlanImport(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<GetRemotePlanImportResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import get response");
  }

  const record = payload as Record<string, unknown>;

  if (!isRemotePlanImport(record.import)) {
    throw new Error("Invalid plan import get response");
  }

  return { import: record.import };
}

export type RemotePlanImportCandidateType =
  | "length"
  | "count"
  | "area"
  | "volume"
  | "other";

export type RemotePlanImportCandidateReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "needs_attention";

export type RemotePlanImportCandidate = {
  id: string;
  importId: string;
  projectId: string;
  label: string;
  type: RemotePlanImportCandidateType;
  plannedValue: number | null;
  unit: string | null;
  description: string | null;
  sourceFileId: string;
  sourcePage: number | null;
  sourceReference: string | null;
  sourceExcerpt: string | null;
  confidence: number;
  selected: boolean;
  reviewStatus: RemotePlanImportCandidateReviewStatus;
  originalLabel: string;
  originalType: RemotePlanImportCandidateType;
  originalPlannedValue: number | null;
  originalUnit: string | null;
  reviewedByUid: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatchRemotePlanImportCandidateInput = {
  selected?: boolean;
  label?: string;
  type?: RemotePlanImportCandidateType;
  plannedValue?: number | null;
  unit?: string | null;
  description?: string | null;
  reviewStatus?: RemotePlanImportCandidateReviewStatus;
  expectedUpdatedAt?: string;
};

export type ProcessRemotePlanImportResponse = {
  import: RemotePlanImport;
  alreadyProcessing?: boolean;
  alreadyReady?: boolean;
};

export type GetRemotePlanImportCandidatesResponse = {
  candidates: RemotePlanImportCandidate[];
};

export type PatchRemotePlanImportCandidateResponse = {
  candidate: RemotePlanImportCandidate;
};

export type BatchSelectRemotePlanImportCandidatesResponse = {
  candidates: RemotePlanImportCandidate[];
};

export type MarkRemotePlanImportReadyForApprovalResponse = {
  import: RemotePlanImport;
  candidates: RemotePlanImportCandidate[];
};

function isRemotePlanImportCandidateType(
  value: unknown,
): value is RemotePlanImportCandidateType {
  return (
    value === "length" ||
    value === "count" ||
    value === "area" ||
    value === "volume" ||
    value === "other"
  );
}

function isRemotePlanImportCandidateReviewStatus(
  value: unknown,
): value is RemotePlanImportCandidateReviewStatus {
  return (
    value === "unreviewed" ||
    value === "reviewed" ||
    value === "needs_attention"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRemotePlanImportCandidate(
  value: unknown,
): value is RemotePlanImportCandidate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.importId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.label === "string" &&
    isRemotePlanImportCandidateType(record.type) &&
    isNullableNumber(record.plannedValue) &&
    isNullableString(record.unit) &&
    isNullableString(record.description) &&
    typeof record.sourceFileId === "string" &&
    isNullableNumber(record.sourcePage) &&
    isNullableString(record.sourceReference) &&
    isNullableString(record.sourceExcerpt) &&
    typeof record.confidence === "number" &&
    typeof record.selected === "boolean" &&
    isRemotePlanImportCandidateReviewStatus(record.reviewStatus) &&
    typeof record.originalLabel === "string" &&
    isRemotePlanImportCandidateType(record.originalType) &&
    isNullableNumber(record.originalPlannedValue) &&
    isNullableString(record.originalUnit) &&
    isNullableString(record.reviewedByUid) &&
    isNullableString(record.reviewedAt) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

/**
 * Start async document intelligence for an uploaded PlanImport.
 * Does not create PlanItems.
 */
export async function processRemotePlanImport(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<ProcessRemotePlanImportResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/process`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import process response");
  }

  const record = payload as Record<string, unknown>;
  if (!isRemotePlanImport(record.import)) {
    throw new Error("Invalid plan import process response");
  }

  return {
    import: record.import,
    alreadyProcessing: record.alreadyProcessing === true,
    alreadyReady: record.alreadyReady === true,
  };
}

export async function getRemotePlanImportCandidates(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<GetRemotePlanImportCandidatesResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/candidates`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import candidates response");
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.candidates)) {
    throw new Error("Invalid plan import candidates response");
  }

  if (!record.candidates.every(isRemotePlanImportCandidate)) {
    throw new Error("Invalid plan import candidate payload");
  }

  return { candidates: record.candidates };
}

/**
 * Patch a single candidate (review-safe fields only). Does not create PlanItems.
 */
export async function patchRemotePlanImportCandidate(
  remoteProjectId: string,
  remoteImportId: string,
  candidateId: string,
  patch: PatchRemotePlanImportCandidateInput,
): Promise<PatchRemotePlanImportCandidateResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/candidates/${encodeURIComponent(candidateId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import candidate patch response");
  }

  const record = payload as Record<string, unknown>;
  if (!isRemotePlanImportCandidate(record.candidate)) {
    throw new Error("Invalid plan import candidate patch response");
  }

  return { candidate: record.candidate };
}

/**
 * DELETE one generated plan-import candidate.
 * Does not delete PlanItems, the import, or source documents.
 *
 * DELETE /api/projects/:remoteProjectId/plan-imports/:remoteImportId/candidates/:candidateId
 */
export async function deleteRemotePlanImportCandidate(
  remoteProjectId: string,
  remoteImportId: string,
  candidateId: string,
): Promise<void> {
  const projectId = remoteProjectId.trim();
  const importId = remoteImportId.trim();
  const id = candidateId.trim();

  if (!projectId || !importId || !id) {
    throw new Error("Candidate not found.");
  }

  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/plan-imports/${encodeURIComponent(importId)}/candidates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

/**
 * Batch select/deselect candidates. Does not create PlanItems.
 */
export async function batchSelectRemotePlanImportCandidates(
  remoteProjectId: string,
  remoteImportId: string,
  candidateIds: string[],
  selected: boolean,
): Promise<BatchSelectRemotePlanImportCandidatesResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/candidates`,
    {
      method: "PATCH",
      body: JSON.stringify({ candidateIds, selected }),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import batch select response");
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.candidates)) {
    throw new Error("Invalid plan import batch select response");
  }

  if (!record.candidates.every(isRemotePlanImportCandidate)) {
    throw new Error("Invalid plan import batch select response");
  }

  return { candidates: record.candidates };
}

/**
 * Mark review complete → ready_for_approval. Does NOT create PlanItems.
 */
export async function markRemotePlanImportReadyForApproval(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<MarkRemotePlanImportReadyForApprovalResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/ready-for-approval`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import ready-for-approval response");
  }

  const record = payload as Record<string, unknown>;
  if (!isRemotePlanImport(record.import) || !Array.isArray(record.candidates)) {
    throw new Error("Invalid plan import ready-for-approval response");
  }

  if (!record.candidates.every(isRemotePlanImportCandidate)) {
    throw new Error("Invalid plan import ready-for-approval candidates");
  }

  return {
    import: record.import,
    candidates: record.candidates,
  };
}

export type RemotePlanItemSummary = {
  id: string;
  localPlanItemId: string;
  projectId: string;
  type: "length" | "area" | "count" | "volume";
  label: string;
  plannedValue: number;
  unit: string;
  unitCost: number;
  productionRatePerDay: number;
  laborHoursPerUnit: number;
  origin?: "manual" | "plan_import";
  planImportId?: string;
  planImportCandidateId?: string;
  /** Short-lived signed presentation URL. */
  imageUrl?: string;
};

export type ApproveRemotePlanImportResponse = {
  import: RemotePlanImport;
  createdPlanItemIds: string[];
  createdCount: number;
  alreadyApproved: boolean;
  planItems: RemotePlanItemSummary[];
};

function isRemotePlanItemSummary(value: unknown): value is RemotePlanItemSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.localPlanItemId === "string" &&
    typeof record.projectId === "string" &&
    (record.type === "length" ||
      record.type === "area" ||
      record.type === "count" ||
      record.type === "volume") &&
    typeof record.label === "string" &&
    typeof record.plannedValue === "number" &&
    typeof record.unit === "string" &&
    typeof record.unitCost === "number" &&
    typeof record.productionRatePerDay === "number" &&
    typeof record.laborHoursPerUnit === "number" &&
    (record.imageUrl === undefined || typeof record.imageUrl === "string")
  );
}

/**
 * Approve reviewed candidates into authoritative PlanItems (Phase 2P.5).
 * Server-owned conversion. Idempotent. Does not send candidate payloads.
 */
export async function approveRemotePlanImport(
  remoteProjectId: string,
  remoteImportId: string,
): Promise<ApproveRemotePlanImportResponse> {
  const response = await authenticatedFetch(
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-imports/${encodeURIComponent(remoteImportId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid plan import approve response");
  }

  const record = payload as Record<string, unknown>;
  if (!isRemotePlanImport(record.import)) {
    throw new Error("Invalid plan import approve response");
  }
  if (!Array.isArray(record.createdPlanItemIds)) {
    throw new Error("Invalid plan import approve response");
  }
  if (typeof record.createdCount !== "number") {
    throw new Error("Invalid plan import approve response");
  }
  if (!Array.isArray(record.planItems)) {
    throw new Error("Invalid plan import approve response");
  }
  if (!record.planItems.every(isRemotePlanItemSummary)) {
    throw new Error("Invalid plan import approve planItems");
  }

  return {
    import: record.import,
    createdPlanItemIds: record.createdPlanItemIds.filter(
      (id): id is string => typeof id === "string",
    ),
    createdCount: record.createdCount,
    alreadyApproved: record.alreadyApproved === true,
    planItems: record.planItems.map((item) => {
      const { imageUrl, ...presentation } = item;
      const normalizedImageUrl = imageUrl?.trim();
      return normalizedImageUrl
        ? { ...presentation, imageUrl: normalizedImageUrl }
        : presentation;
    }),
  };
}
