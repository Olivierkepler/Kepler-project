import type { PlanItemProvenance } from "../domain/planItemProvenance.js";
import { getCandidateById } from "../repositories/planImportCandidatesRepository.js";
import { getPlanImportById } from "../repositories/planImportsRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";

export class PlanItemProvenanceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PlanItemProvenanceError";
    this.statusCode = statusCode;
  }
}

const MAX_EXCERPT_CHARS = 280;

function truncateExcerpt(value: string | undefined): string | null {
  if (!value || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length <= MAX_EXCERPT_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_EXCERPT_CHARS - 1).trimEnd()}…`;
}

/**
 * Resolve read-only provenance for a PlanItem.
 * Validates the PlanItem → PlanImport → Candidate chain for imported items.
 */
export async function getPlanItemProvenance(args: {
  projectId: string;
  planItemId: string;
}): Promise<PlanItemProvenance> {
  const planItem = await getPlanItemById(args.planItemId);

  if (!planItem || planItem.projectId !== args.projectId) {
    throw new PlanItemProvenanceError("Plan item not found", 404);
  }

  const origin = planItem.origin ?? "manual";

  if (origin !== "plan_import") {
    return {
      origin: "manual",
      planItemId: planItem.id,
    };
  }

  const importId = planItem.planImportId?.trim();
  const candidateId = planItem.planImportCandidateId?.trim();

  if (!importId || !candidateId) {
    throw new PlanItemProvenanceError(
      "Imported plan item is missing provenance links.",
      409,
    );
  }

  const planImport = await getPlanImportById(importId);
  if (!planImport || planImport.projectId !== args.projectId) {
    throw new PlanItemProvenanceError(
      "Plan import provenance could not be resolved.",
      409,
    );
  }

  const candidate = await getCandidateById(candidateId);
  if (!candidate) {
    throw new PlanItemProvenanceError(
      "Plan import candidate provenance could not be resolved.",
      409,
    );
  }

  if (candidate.importId !== importId) {
    throw new PlanItemProvenanceError(
      "Candidate does not belong to the linked import.",
      409,
    );
  }

  if (candidate.projectId !== args.projectId) {
    throw new PlanItemProvenanceError(
      "Candidate does not belong to this project.",
      409,
    );
  }

  if (
    candidate.createdPlanItemId &&
    candidate.createdPlanItemId !== planItem.id
  ) {
    throw new PlanItemProvenanceError(
      "Candidate conversion marker does not match this plan item.",
      409,
    );
  }

  const sourceFile = planImport.files.find(
    (file) => file.id === candidate.sourceFileId,
  );
  if (!sourceFile) {
    throw new PlanItemProvenanceError(
      "Source document metadata could not be resolved.",
      409,
    );
  }

  return {
    origin: "plan_import",
    planItemId: planItem.id,
    import: {
      id: planImport.id,
      approvedAt: planImport.approvedAt ?? null,
      approvedByUid: planImport.approvedByUid ?? null,
    },
    candidate: {
      id: candidate.id,
      confidence: candidate.confidence,
      original: {
        label: candidate.originalLabel,
        type: candidate.originalType,
        plannedValue:
          candidate.originalPlannedValue === undefined
            ? null
            : candidate.originalPlannedValue,
        unit: candidate.originalUnit ?? null,
      },
      reviewed: {
        label: candidate.label,
        type: candidate.type,
        plannedValue:
          candidate.plannedValue === undefined ? null : candidate.plannedValue,
        unit: candidate.unit ?? null,
      },
      reviewedAt: candidate.reviewedAt ?? null,
      reviewedByUid: candidate.reviewedByUid ?? null,
      source: {
        fileId: sourceFile.id,
        fileName: sourceFile.name,
        mimeType: sourceFile.mimeType || null,
        page: candidate.sourcePage ?? null,
        reference: candidate.sourceReference ?? null,
        excerpt: truncateExcerpt(candidate.sourceExcerpt),
      },
    },
  };
}
