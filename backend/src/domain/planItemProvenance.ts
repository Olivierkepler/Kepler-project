/**
 * Read-only PlanItem provenance DTO (Phase 2P.6).
 * Server-derived. Never accepts client-authored provenance fields.
 */

import type { PlanItemOrigin } from "./planItem.js";
import type { PlanImportCandidateType } from "./planImportCandidate.js";

export type PlanItemProvenanceQuantity = {
  label: string;
  type: PlanImportCandidateType | string;
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
  origin: PlanItemOrigin;
  planItemId: string;
  import?: PlanItemProvenanceImport;
  candidate?: PlanItemProvenanceCandidate;
};
