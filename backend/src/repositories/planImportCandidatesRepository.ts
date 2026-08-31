import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  isPlanImportCandidateReviewStatus,
  isPlanImportCandidateType,
  type PlanImportCandidate,
  type PlanImportCandidateReviewStatus,
  type PlanImportCandidateType,
} from "../domain/planImportCandidate.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

/**
 * Normalizes Firestore candidate docs.
 * Backward compatible with 2P.3 docs missing review/original fields:
 * - reviewStatus defaults to "unreviewed"
 * - original* defaults from effective fields
 */
export function normalizePlanImportCandidateDocument(
  data: unknown,
): PlanImportCandidate | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.importId !== "string" ||
    typeof record.projectId !== "string" ||
    typeof record.label !== "string" ||
    !isPlanImportCandidateType(record.type) ||
    typeof record.sourceFileId !== "string" ||
    typeof record.confidence !== "number" ||
    !Number.isFinite(record.confidence) ||
    typeof record.selected !== "boolean" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }

  if (record.confidence < 0 || record.confidence > 1) {
    return undefined;
  }

  const reviewStatus: PlanImportCandidateReviewStatus =
    isPlanImportCandidateReviewStatus(record.reviewStatus)
      ? record.reviewStatus
      : "unreviewed";

  const originalLabel =
    typeof record.originalLabel === "string" && record.originalLabel.trim()
      ? record.originalLabel.trim()
      : record.label;

  const originalType: PlanImportCandidateType =
    isPlanImportCandidateType(record.originalType)
      ? record.originalType
      : record.type;

  const item: PlanImportCandidate = {
    id: record.id,
    importId: record.importId,
    projectId: record.projectId,
    label: record.label,
    type: record.type,
    sourceFileId: record.sourceFileId,
    confidence: record.confidence,
    selected: record.selected,
    reviewStatus,
    originalLabel,
    originalType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  const plannedValue = readOptionalNumber(record.plannedValue);
  if (plannedValue !== undefined) {
    item.plannedValue = plannedValue;
  }
  const unit = readOptionalString(record.unit);
  if (unit !== undefined) {
    item.unit = unit;
  }
  const description = readOptionalString(record.description);
  if (description !== undefined) {
    item.description = description;
  }
  if (
    typeof record.sourcePage === "number" &&
    Number.isInteger(record.sourcePage) &&
    record.sourcePage >= 1
  ) {
    item.sourcePage = record.sourcePage;
  }
  const sourceReference = readOptionalString(record.sourceReference);
  if (sourceReference !== undefined) {
    item.sourceReference = sourceReference;
  }
  const sourceExcerpt = readOptionalString(record.sourceExcerpt);
  if (sourceExcerpt !== undefined) {
    item.sourceExcerpt = sourceExcerpt;
  }

  const originalPlannedValue = readOptionalNumber(record.originalPlannedValue);
  if (originalPlannedValue !== undefined) {
    item.originalPlannedValue = originalPlannedValue;
  } else if (plannedValue !== undefined && record.originalPlannedValue === undefined) {
    // 2P.3 docs: mirror effective value as original.
    item.originalPlannedValue = plannedValue;
  }

  const originalUnit = readOptionalString(record.originalUnit);
  if (originalUnit !== undefined) {
    item.originalUnit = originalUnit;
  } else if (unit !== undefined && record.originalUnit === undefined) {
    item.originalUnit = unit;
  }

  const reviewedByUid = readOptionalString(record.reviewedByUid);
  if (reviewedByUid !== undefined) {
    item.reviewedByUid = reviewedByUid;
  }
  const reviewedAt = readOptionalString(record.reviewedAt);
  if (reviewedAt !== undefined) {
    item.reviewedAt = reviewedAt;
  }

  const createdPlanItemId = readOptionalString(record.createdPlanItemId);
  if (createdPlanItemId !== undefined) {
    item.createdPlanItemId = createdPlanItemId;
  }

  return item;
}

export async function getCandidatesForImport(
  importId: string,
): Promise<PlanImportCandidate[]> {
  requireId(importId, "importId");

  const snapshot = await db
    .collection(COLLECTIONS.planImportCandidates)
    .where("importId", "==", importId)
    .get();

  return snapshot.docs
    .map((doc) => normalizePlanImportCandidateDocument(doc.data()))
    .filter((item): item is PlanImportCandidate => item != null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function getCandidateById(
  candidateId: string,
): Promise<PlanImportCandidate | undefined> {
  requireId(candidateId, "candidateId");

  const snapshot = await db
    .collection(COLLECTIONS.planImportCandidates)
    .doc(candidateId)
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizePlanImportCandidateDocument(snapshot.data());
}

/**
 * Deletes one candidate document by ID.
 * Returns false when already absent.
 */
export async function deleteCandidateById(
  candidateId: string,
): Promise<boolean> {
  requireId(candidateId, "candidateId");

  const ref = db
    .collection(COLLECTIONS.planImportCandidates)
    .doc(candidateId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return false;
  }

  await ref.delete();
  return true;
}

/**
 * Atomically replaces all candidates for an import (delete + set in one batch).
 * Idempotent for identical payloads on retry.
 */
export async function replaceCandidatesForImport(
  importId: string,
  projectId: string,
  candidates: PlanImportCandidate[],
): Promise<void> {
  requireId(importId, "importId");
  requireId(projectId, "projectId");

  for (const candidate of candidates) {
    if (candidate.importId !== importId || candidate.projectId !== projectId) {
      throw new Error("candidate_scope_mismatch");
    }
  }

  const existing = await db
    .collection(COLLECTIONS.planImportCandidates)
    .where("importId", "==", importId)
    .get();

  const batch = db.batch();

  for (const doc of existing.docs) {
    batch.delete(doc.ref);
  }

  for (const candidate of candidates) {
    const ref = db
      .collection(COLLECTIONS.planImportCandidates)
      .doc(candidate.id);
    batch.set(ref, candidate);
  }

  await batch.commit();
}

export async function setCandidate(
  candidate: PlanImportCandidate,
): Promise<void> {
  requireId(candidate.id, "id");
  await db
    .collection(COLLECTIONS.planImportCandidates)
    .doc(candidate.id)
    .set(candidate);
}

/**
 * Batch-update selected for candidates belonging to one import.
 * Foreign / missing IDs cause the whole operation to fail.
 */
export async function setCandidatesSelected(args: {
  importId: string;
  projectId: string;
  candidateIds: string[];
  selected: boolean;
}): Promise<PlanImportCandidate[]> {
  requireId(args.importId, "importId");
  requireId(args.projectId, "projectId");

  if (args.candidateIds.length === 0) {
    throw new Error("candidateIds is required");
  }

  const uniqueIds = [...new Set(args.candidateIds.map((id) => id.trim()))];
  const nowIso = new Date().toISOString();
  const updated: PlanImportCandidate[] = [];

  const batch = db.batch();

  for (const candidateId of uniqueIds) {
    const snapshot = await db
      .collection(COLLECTIONS.planImportCandidates)
      .doc(candidateId)
      .get();

    if (!snapshot.exists) {
      throw new Error(`candidate_not_found:${candidateId}`);
    }

    const current = normalizePlanImportCandidateDocument(snapshot.data());
    if (!current) {
      throw new Error(`candidate_invalid:${candidateId}`);
    }

    if (
      current.importId !== args.importId ||
      current.projectId !== args.projectId
    ) {
      throw new Error(`candidate_scope_mismatch:${candidateId}`);
    }

    const next: PlanImportCandidate = {
      ...current,
      selected: args.selected,
      updatedAt: nowIso,
    };
    batch.set(
      db.collection(COLLECTIONS.planImportCandidates).doc(candidateId),
      next,
    );
    updated.push(next);
  }

  await batch.commit();
  return updated.sort((a, b) => a.id.localeCompare(b.id));
}

export async function deleteCandidatesForImport(
  importId: string,
): Promise<number> {
  requireId(importId, "importId");

  const existing = await db
    .collection(COLLECTIONS.planImportCandidates)
    .where("importId", "==", importId)
    .get();

  if (existing.empty) {
    return 0;
  }

  const batch = db.batch();
  for (const doc of existing.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return existing.size;
}
