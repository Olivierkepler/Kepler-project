/**
 * Plan Import domain (Phase 2P.1–2P.4).
 *
 * Phase 2P.6 will eventually establish:
 *   PlanImport
 *     → PlanImportCandidate
 *     → (approval)
 *   PlanItem
 * with provenance: sourceFileId, sourcePage, sourceReference, confidence.
 *
 * Phase 2P.4: human review of candidates → ready_for_approval.
 * No PlanItems are created in this phase.
 */

export type PlanImportStatus =
  | "draft"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "ready_for_approval"
  | "approved"
  | "failed";

export type PlanImportFileType = "pdf" | "image" | "other";

export type PlanImportFileUploadStatus =
  | "pending"
  | "uploaded"
  | "failed";

export type PlanImportFile = {
  id: string;
  name: string;
  mimeType?: string;
  uri: string;
  size?: number;
  type: PlanImportFileType;
  /** Remote file id once createRemotePlanImport succeeds. */
  remoteFileId?: string;
  /** Server-authored GCS object path. */
  storagePath?: string;
  uploadStatus?: PlanImportFileUploadStatus;
};

/**
 * Local Plan Import record.
 * projectId is the local project id. remoteProjectId / remoteImportId are
 * filled after cloud create (via ensureRemoteProject + API).
 */
export type PlanImport = {
  id: string;
  projectId: string;
  ownerUid: string;
  status: PlanImportStatus;
  files: PlanImportFile[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  remoteImportId?: string;
  remoteProjectId?: string;
};

export type PlanImportCandidateReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "needs_attention";

export type PlanImportCandidateType =
  | "length"
  | "count"
  | "area"
  | "volume"
  | "other";

/**
 * Proposed measurable plan suggestion from document intelligence.
 * UNTRUSTED until human approval in Phase 2P.5+. Never create PlanItems here.
 */
export type PlanImportCandidate = {
  id: string;
  importId: string;
  projectId?: string;
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
  selected: boolean;
  reviewStatus: PlanImportCandidateReviewStatus;
  originalLabel: string;
  originalType: PlanImportCandidateType;
  originalPlannedValue?: number | null;
  originalUnit?: string | null;
  reviewedByUid?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
