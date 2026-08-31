import {
  candidateHasUnresolvedRequiredErrors,
  candidateIsPlanItemCompatible,
  isPlanImportCandidateReviewStatus,
  isPlanImportCandidateType,
  type PlanImportCandidate,
  type PlanImportCandidateReviewStatus,
  type PlanImportCandidateType,
} from "../domain/planImportCandidate.js";
import type { PlanImport } from "../domain/planImport.js";
import {
  deleteCandidateById,
  getCandidateById,
  getCandidatesForImport,
  setCandidate,
  setCandidatesSelected,
} from "../repositories/planImportCandidatesRepository.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";

export class PlanImportReviewError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PlanImportReviewError";
    this.statusCode = statusCode;
  }
}

export type PlanImportCandidatePatchInput = {
  selected?: boolean;
  label?: string;
  type?: PlanImportCandidateType;
  plannedValue?: number | null;
  unit?: string | null;
  description?: string | null;
  /** Client may request reviewed / needs_attention / unreviewed. */
  reviewStatus?: PlanImportCandidateReviewStatus;
  /** Optional optimistic concurrency token (ISO updatedAt). */
  expectedUpdatedAt?: string;
};

const LABEL_MAX = 200;
const UNIT_MAX = 40;
const DESCRIPTION_MAX = 1000;

function asOptionalTrimmedString(
  value: unknown,
  max: number,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new PlanImportReviewError(`${field} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PlanImportReviewError(`${field} cannot be empty`, 400);
  }
  if (trimmed.length > max) {
    throw new PlanImportReviewError(`${field} is too long`, 400);
  }
  return trimmed;
}

/**
 * Parses review-safe PATCH body. Rejects unknown / immutable fields.
 */
export function parsePlanImportCandidatePatchInput(
  body: unknown,
): PlanImportCandidatePatchInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlanImportReviewError("Invalid candidate update payload", 400);
  }

  const record = body as Record<string, unknown>;

  const forbidden = [
    "id",
    "importId",
    "projectId",
    "sourceFileId",
    "sourcePage",
    "sourceReference",
    "sourceExcerpt",
    "confidence",
    "originalLabel",
    "originalType",
    "originalPlannedValue",
    "originalUnit",
    "reviewedByUid",
    "reviewedAt",
    "createdAt",
    "ownerUid",
  ] as const;

  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new PlanImportReviewError(`${key} cannot be updated`, 400);
    }
  }

  const patch: PlanImportCandidatePatchInput = {};
  let hasField = false;

  if (Object.prototype.hasOwnProperty.call(record, "selected")) {
    if (typeof record.selected !== "boolean") {
      throw new PlanImportReviewError("selected must be a boolean", 400);
    }
    patch.selected = record.selected;
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "label")) {
    patch.label = asOptionalTrimmedString(record.label, LABEL_MAX, "label");
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "type")) {
    if (!isPlanImportCandidateType(record.type)) {
      throw new PlanImportReviewError("Invalid candidate type", 400);
    }
    patch.type = record.type;
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "plannedValue")) {
    if (record.plannedValue === null) {
      patch.plannedValue = null;
    } else if (
      typeof record.plannedValue === "number" &&
      Number.isFinite(record.plannedValue) &&
      record.plannedValue >= 0
    ) {
      patch.plannedValue = record.plannedValue;
    } else {
      throw new PlanImportReviewError(
        "plannedValue must be a finite number >= 0 or null",
        400,
      );
    }
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "unit")) {
    if (record.unit === null) {
      patch.unit = null;
    } else {
      patch.unit = asOptionalTrimmedString(record.unit, UNIT_MAX, "unit");
    }
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "description")) {
    if (record.description === null) {
      patch.description = null;
    } else {
      patch.description = asOptionalTrimmedString(
        record.description,
        DESCRIPTION_MAX,
        "description",
      );
    }
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "reviewStatus")) {
    if (!isPlanImportCandidateReviewStatus(record.reviewStatus)) {
      throw new PlanImportReviewError("Invalid reviewStatus", 400);
    }
    patch.reviewStatus = record.reviewStatus;
    hasField = true;
  }

  if (Object.prototype.hasOwnProperty.call(record, "expectedUpdatedAt")) {
    if (
      typeof record.expectedUpdatedAt !== "string" ||
      !record.expectedUpdatedAt.trim()
    ) {
      throw new PlanImportReviewError("expectedUpdatedAt must be a string", 400);
    }
    patch.expectedUpdatedAt = record.expectedUpdatedAt.trim();
  }

  if (!hasField) {
    throw new PlanImportReviewError("No updatable fields provided", 400);
  }

  return patch;
}

export type BatchSelectCandidatesInput = {
  candidateIds: string[];
  selected: boolean;
};

export function parseBatchSelectCandidatesInput(
  body: unknown,
): BatchSelectCandidatesInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlanImportReviewError("Invalid batch selection payload", 400);
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.candidateIds) || record.candidateIds.length === 0) {
    throw new PlanImportReviewError("candidateIds is required", 400);
  }

  if (record.candidateIds.length > 500) {
    throw new PlanImportReviewError("Too many candidateIds", 400);
  }

  const candidateIds: string[] = [];
  for (const id of record.candidateIds) {
    if (typeof id !== "string" || !id.trim()) {
      throw new PlanImportReviewError("candidateIds must be non-empty strings", 400);
    }
    candidateIds.push(id.trim());
  }

  if (typeof record.selected !== "boolean") {
    throw new PlanImportReviewError("selected must be a boolean", 400);
  }

  return { candidateIds, selected: record.selected };
}

async function requireImportForReview(args: {
  projectId: string;
  importId: string;
}): Promise<PlanImport> {
  const existing = await getPlanImportById(args.importId);
  if (!existing || existing.projectId !== args.projectId) {
    throw new PlanImportReviewError("Plan import not found", 404);
  }

  if (
    existing.status !== "ready_for_review" &&
    existing.status !== "ready_for_approval"
  ) {
    throw new PlanImportReviewError(
      "Plan import is not ready for candidate review.",
      409,
    );
  }

  return existing;
}

/**
 * Owner-authorized candidate update. Preserves original* extraction fields.
 * reviewedByUid / reviewedAt are server-derived when reviewStatus becomes reviewed.
 */
export async function updatePlanImportCandidate(args: {
  projectId: string;
  importId: string;
  candidateId: string;
  reviewerUid: string;
  patch: PlanImportCandidatePatchInput;
}): Promise<PlanImportCandidate> {
  await requireImportForReview({
    projectId: args.projectId,
    importId: args.importId,
  });

  const current = await getCandidateById(args.candidateId);
  if (
    !current ||
    current.importId !== args.importId ||
    current.projectId !== args.projectId
  ) {
    throw new PlanImportReviewError("Candidate not found", 404);
  }

  if (
    args.patch.expectedUpdatedAt &&
    current.updatedAt !== args.patch.expectedUpdatedAt
  ) {
    throw new PlanImportReviewError(
      "Candidate was updated elsewhere. Refresh and try again.",
      409,
    );
  }

  const nowIso = new Date().toISOString();
  const next: PlanImportCandidate = {
    ...current,
    updatedAt: nowIso,
  };

  if (args.patch.selected !== undefined) {
    next.selected = args.patch.selected;
  }
  if (args.patch.label !== undefined) {
    next.label = args.patch.label;
  }
  if (args.patch.type !== undefined) {
    next.type = args.patch.type;
  }
  if (args.patch.plannedValue !== undefined) {
    if (args.patch.plannedValue === null) {
      delete next.plannedValue;
    } else {
      next.plannedValue = args.patch.plannedValue;
    }
  }
  if (args.patch.unit !== undefined) {
    if (args.patch.unit === null) {
      delete next.unit;
    } else {
      next.unit = args.patch.unit;
    }
  }
  if (args.patch.description !== undefined) {
    if (args.patch.description === null) {
      delete next.description;
    } else {
      next.description = args.patch.description;
    }
  }

  // Human edits that change effective fields auto-mark reviewed.
  const contentEdited =
    args.patch.label !== undefined ||
    args.patch.type !== undefined ||
    args.patch.plannedValue !== undefined ||
    args.patch.unit !== undefined ||
    args.patch.description !== undefined;

  let reviewStatus = args.patch.reviewStatus;
  if (reviewStatus === undefined && contentEdited) {
    reviewStatus = "reviewed";
  }

  if (reviewStatus !== undefined) {
    next.reviewStatus = reviewStatus;
    if (reviewStatus === "reviewed") {
      next.reviewedByUid = args.reviewerUid;
      next.reviewedAt = nowIso;
    } else if (reviewStatus === "unreviewed") {
      delete next.reviewedByUid;
      delete next.reviewedAt;
    }
  }

  // Never mutate original extraction snapshot.
  next.originalLabel = current.originalLabel;
  next.originalType = current.originalType;
  if (current.originalPlannedValue !== undefined) {
    next.originalPlannedValue = current.originalPlannedValue;
  } else {
    delete next.originalPlannedValue;
  }
  if (current.originalUnit !== undefined) {
    next.originalUnit = current.originalUnit;
  } else {
    delete next.originalUnit;
  }

  await setCandidate(next);
  return next;
}

/**
 * Delete exactly one review candidate. Does not delete PlanItems or the import.
 * Reuses the same editable-state gate as candidate PATCH.
 */
export async function deletePlanImportCandidate(args: {
  projectId: string;
  importId: string;
  candidateId: string;
}): Promise<void> {
  await requireImportForReview({
    projectId: args.projectId,
    importId: args.importId,
  });

  const current = await getCandidateById(args.candidateId);
  if (
    !current ||
    current.importId !== args.importId ||
    current.projectId !== args.projectId
  ) {
    throw new PlanImportReviewError("Candidate not found", 404);
  }

  await deleteCandidateById(args.candidateId);
}

export async function batchSelectPlanImportCandidates(args: {
  projectId: string;
  importId: string;
  candidateIds: string[];
  selected: boolean;
}): Promise<PlanImportCandidate[]> {
  await requireImportForReview({
    projectId: args.projectId,
    importId: args.importId,
  });

  try {
    return await setCandidatesSelected({
      importId: args.importId,
      projectId: args.projectId,
      candidateIds: args.candidateIds,
      selected: args.selected,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("candidate_not_found:")) {
      throw new PlanImportReviewError("Candidate not found", 404);
    }
    if (message.startsWith("candidate_scope_mismatch:")) {
      throw new PlanImportReviewError(
        "Candidate does not belong to this import",
        403,
      );
    }
    if (message.startsWith("candidate_invalid:")) {
      throw new PlanImportReviewError("Candidate is invalid", 400);
    }
    throw error;
  }
}

/**
 * Deterministic readiness for continuing to approval (Phase 2P.4).
 * Does not create PlanItems.
 */
export function evaluatePlanImportApprovalReadiness(
  candidates: PlanImportCandidate[],
): {
  ready: boolean;
  reasons: string[];
  selectedCount: number;
  reviewedSelectedCount: number;
  unresolvedSelectedCount: number;
} {
  const selected = candidates.filter((c) => c.selected);
  const reasons: string[] = [];

  if (selected.length === 0) {
    reasons.push("Select at least one suggestion to continue.");
  }

  const unreviewedSelected = selected.filter(
    (c) => c.reviewStatus !== "reviewed",
  );
  if (unreviewedSelected.length > 0) {
    reasons.push(
      `${unreviewedSelected.length} selected suggestion${unreviewedSelected.length === 1 ? "" : "s"} still need review.`,
    );
  }

  const unresolved = selected.filter((c) =>
    candidateHasUnresolvedRequiredErrors(c),
  );
  if (unresolved.length > 0) {
    reasons.push(
      `${unresolved.length} selected suggestion${unresolved.length === 1 ? "" : "s"} have missing required fields.`,
    );
  }

  const incompatible = selected.filter((c) => !candidateIsPlanItemCompatible(c));
  if (incompatible.length > 0) {
    reasons.push(
      `${incompatible.length} selected suggestion${incompatible.length === 1 ? "" : "s"} cannot become Plan Items (type, quantity, or unit).`,
    );
  }

  return {
    ready: reasons.length === 0,
    reasons,
    selectedCount: selected.length,
    reviewedSelectedCount: selected.filter((c) => c.reviewStatus === "reviewed")
      .length,
    unresolvedSelectedCount: unresolved.length,
  };
}

/**
 * Transitions ready_for_review → ready_for_approval when selected candidates
 * are reviewed and valid. Idempotent if already ready_for_approval.
 * Never creates PlanItems or transitions to approved.
 */
export async function markPlanImportReadyForApproval(args: {
  projectId: string;
  importId: string;
}): Promise<{ import: PlanImport; candidates: PlanImportCandidate[] }> {
  const existing = await getPlanImportById(args.importId);
  if (!existing || existing.projectId !== args.projectId) {
    throw new PlanImportReviewError("Plan import not found", 404);
  }

  const candidates = await getCandidatesForImport(args.importId);

  if (existing.status === "ready_for_approval") {
    return { import: existing, candidates };
  }

  if (existing.status !== "ready_for_review") {
    throw new PlanImportReviewError(
      "Plan import must be ready for review before approval.",
      409,
    );
  }

  const readiness = evaluatePlanImportApprovalReadiness(candidates);
  if (!readiness.ready) {
    throw new PlanImportReviewError(
      readiness.reasons[0] ?? "Review is not complete.",
      409,
    );
  }

  const next: PlanImport = {
    ...existing,
    status: "ready_for_approval",
    updatedAt: new Date().toISOString(),
  };
  delete next.errorMessage;

  await setPlanImport(next);
  return { import: next, candidates };
}
