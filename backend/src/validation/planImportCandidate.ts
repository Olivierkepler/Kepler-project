import type {
  PlanImportCandidate,
  PlanImportCandidateType,
} from "../domain/planImportCandidate.js";
import { createPlanImportCandidateId } from "../domain/planImportCandidateId.js";

const CANDIDATE_TYPES: readonly PlanImportCandidateType[] = [
  "length",
  "count",
  "area",
  "volume",
  "other",
];

/** Raw model candidate before trusted ids are attached. */
export type PlanImportExtractionCandidateInput = {
  label: string;
  type: PlanImportCandidateType;
  plannedValue?: number | null;
  unit?: string | null;
  description?: string | null;
  sourceFileId: string;
  sourcePage?: number | null;
  sourceReference?: string | null;
  sourceExcerpt?: string | null;
  confidence: number;
};

export type PlanImportExtractionResultInput = {
  candidates: PlanImportExtractionCandidateInput[];
  warnings?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function asOptionalString(value: unknown, max: number): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > max) {
    return trimmed.slice(0, max);
  }
  return trimmed;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function asConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > 1) {
    return null;
  }
  return value;
}

function asCandidateType(value: unknown): PlanImportCandidateType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if ((CANDIDATE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as PlanImportCandidateType;
  }
  return null;
}

function asOptionalPage(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

/**
 * Parses and validates untrusted model JSON into extraction candidates.
 * Rejects malformed payloads. Does not invent quantities or sourceFileId.
 * sourceFileId must be in allowedFileIds (trusted import file ids).
 */
export function parsePlanImportExtractionResult(
  value: unknown,
  allowedFileIds: ReadonlySet<string>,
): PlanImportExtractionResultInput {
  if (!isRecord(value)) {
    throw new Error("malformed_extraction_result");
  }

  const candidatesRaw = value.candidates;
  if (!Array.isArray(candidatesRaw)) {
    throw new Error("malformed_extraction_result");
  }

  if (candidatesRaw.length > 200) {
    throw new Error("too_many_candidates");
  }

  const candidates: PlanImportExtractionCandidateInput[] = [];

  for (const raw of candidatesRaw) {
    if (!isRecord(raw)) {
      throw new Error("malformed_candidate");
    }

    const label = asNonEmptyString(raw.label, 200);
    const type = asCandidateType(raw.type);
    const sourceFileId = asNonEmptyString(raw.sourceFileId, 300);
    const confidence = asConfidence(raw.confidence);

    if (!label || !type || !sourceFileId || confidence === null) {
      throw new Error("malformed_candidate");
    }

    if (!allowedFileIds.has(sourceFileId)) {
      throw new Error("unknown_source_file_id");
    }

    const plannedValue = asOptionalNumber(raw.plannedValue);
    const unit = asOptionalString(raw.unit, 40);
    const description = asOptionalString(raw.description, 1000);
    const sourcePage = asOptionalPage(raw.sourcePage);
    const sourceReference = asOptionalString(raw.sourceReference, 200);
    const sourceExcerpt = asOptionalString(raw.sourceExcerpt, 500);

    const candidate: PlanImportExtractionCandidateInput = {
      label,
      type,
      sourceFileId,
      confidence,
    };

    if (plannedValue !== undefined) {
      candidate.plannedValue = plannedValue;
    }
    if (unit !== undefined) {
      candidate.unit = unit;
    }
    if (description !== undefined) {
      candidate.description = description;
    }
    if (sourcePage !== undefined) {
      candidate.sourcePage = sourcePage;
    }
    if (sourceReference !== undefined) {
      candidate.sourceReference = sourceReference;
    }
    if (sourceExcerpt !== undefined) {
      candidate.sourceExcerpt = sourceExcerpt;
    }

    candidates.push(candidate);
  }

  const warnings: string[] = [];
  if (Array.isArray(value.warnings)) {
    for (const warning of value.warnings.slice(0, 20)) {
      const text = asOptionalString(warning, 300);
      if (text) {
        warnings.push(text);
      }
    }
  }

  return { candidates, warnings };
}

/**
 * Builds persisted PlanImportCandidate records with deterministic ids.
 */
export function buildPlanImportCandidatesFromExtraction(args: {
  importId: string;
  projectId: string;
  extraction: PlanImportExtractionResultInput;
  nowIso?: string;
}): PlanImportCandidate[] {
  const now = args.nowIso ?? new Date().toISOString();

  return args.extraction.candidates.map((item, index) => {
    const label = item.label.trim();
    const type = item.type;
    const plannedValue =
      typeof item.plannedValue === "number" && Number.isFinite(item.plannedValue)
        ? item.plannedValue
        : undefined;
    const unit =
      typeof item.unit === "string" && item.unit.trim()
        ? item.unit.trim()
        : undefined;

    const candidate: PlanImportCandidate = {
      id: createPlanImportCandidateId(args.importId, index),
      importId: args.importId,
      projectId: args.projectId,
      label,
      type,
      sourceFileId: item.sourceFileId,
      confidence: item.confidence,
      selected: true,
      reviewStatus: "unreviewed",
      originalLabel: label,
      originalType: type,
      createdAt: now,
      updatedAt: now,
    };

    if (plannedValue !== undefined) {
      candidate.plannedValue = plannedValue;
      candidate.originalPlannedValue = plannedValue;
    }
    if (unit !== undefined) {
      candidate.unit = unit;
      candidate.originalUnit = unit;
    }
    if (typeof item.description === "string" && item.description.trim()) {
      candidate.description = item.description.trim();
    }
    if (
      typeof item.sourcePage === "number" &&
      Number.isInteger(item.sourcePage)
    ) {
      candidate.sourcePage = item.sourcePage;
    }
    if (
      typeof item.sourceReference === "string" &&
      item.sourceReference.trim()
    ) {
      candidate.sourceReference = item.sourceReference.trim();
    }
    if (typeof item.sourceExcerpt === "string" && item.sourceExcerpt.trim()) {
      candidate.sourceExcerpt = item.sourceExcerpt.trim();
    }

    return candidate;
  });
}

export function toPlanImportCandidateResponse(candidate: PlanImportCandidate) {
  return {
    id: candidate.id,
    importId: candidate.importId,
    projectId: candidate.projectId,
    label: candidate.label,
    type: candidate.type,
    plannedValue: candidate.plannedValue ?? null,
    unit: candidate.unit ?? null,
    description: candidate.description ?? null,
    sourceFileId: candidate.sourceFileId,
    sourcePage: candidate.sourcePage ?? null,
    sourceReference: candidate.sourceReference ?? null,
    sourceExcerpt: candidate.sourceExcerpt ?? null,
    confidence: candidate.confidence,
    selected: candidate.selected,
    reviewStatus: candidate.reviewStatus,
    originalLabel: candidate.originalLabel,
    originalType: candidate.originalType,
    originalPlannedValue: candidate.originalPlannedValue ?? null,
    originalUnit: candidate.originalUnit ?? null,
    reviewedByUid: candidate.reviewedByUid ?? null,
    reviewedAt: candidate.reviewedAt ?? null,
    createdPlanItemId: candidate.createdPlanItemId ?? null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}
