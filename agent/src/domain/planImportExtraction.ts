import { z, ZodError } from "zod";

export const PLAN_IMPORT_CANDIDATE_TYPES = [
  "length",
  "count",
  "area",
  "volume",
  "other",
] as const;

export type PlanImportCandidateType =
  (typeof PLAN_IMPORT_CANDIDATE_TYPES)[number];

const extractionCandidateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  type: z.enum(PLAN_IMPORT_CANDIDATE_TYPES),
  plannedValue: z.number().finite().nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  sourceFileId: z.string().trim().min(1).max(300),
  sourcePage: z.number().int().min(1).nullable().optional(),
  sourceReference: z.string().trim().min(1).max(200).nullable().optional(),
  sourceExcerpt: z.string().trim().min(1).max(500).nullable().optional(),
  confidence: z.number().min(0).max(1),
});

const extractionResultSchema = z.object({
  candidates: z.array(extractionCandidateSchema).max(200),
  warnings: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
});

export type PlanImportExtractionCandidate = z.infer<
  typeof extractionCandidateSchema
>;

export type PlanImportExtractionResult = z.infer<typeof extractionResultSchema>;

export type PersistedPlanImportCandidate = {
  id: string;
  importId: string;
  projectId: string;
  label: string;
  type: PlanImportCandidateType;
  plannedValue?: number;
  unit?: string;
  description?: string;
  sourceFileId: string;
  sourcePage?: number;
  sourceReference?: string;
  sourceExcerpt?: string;
  confidence: number;
  selected: boolean;
  reviewStatus: "unreviewed" | "reviewed" | "needs_attention";
  originalLabel: string;
  originalType: PlanImportCandidateType;
  originalPlannedValue?: number;
  originalUnit?: string;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("model_output_not_json");
  }
}

function unwrapExtractionEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (Array.isArray(value.candidates)) {
    return value;
  }
  for (const key of ["result", "data", "extraction", "output"] as const) {
    const inner = value[key];
    if (isRecord(inner) && Array.isArray(inner.candidates)) {
      return inner;
    }
  }
  return value;
}

/**
 * Validates untrusted model output. Rejects unknown sourceFileId values.
 */
export function parsePlanImportExtractionFromModel(
  value: unknown,
  allowedFileIds: ReadonlySet<string>,
): PlanImportExtractionResult {
  const raw = typeof value === "string" ? tryParseJsonObject(value) : value;
  const unwrapped = unwrapExtractionEnvelope(raw);

  let parsed: PlanImportExtractionResult;
  try {
    parsed = extractionResultSchema.parse(unwrapped);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error("malformed_extraction_result");
    }
    throw error;
  }

  for (const candidate of parsed.candidates) {
    if (!allowedFileIds.has(candidate.sourceFileId)) {
      throw new Error("unknown_source_file_id");
    }
  }

  return parsed;
}

export function buildPersistedCandidates(args: {
  importId: string;
  projectId: string;
  extraction: PlanImportExtractionResult;
  nowIso?: string;
}): PersistedPlanImportCandidate[] {
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

    const candidate: PersistedPlanImportCandidate = {
      id: `${args.importId}_c_${index}`,
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
    if (typeof item.sourcePage === "number") {
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
