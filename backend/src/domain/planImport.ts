/**
 * Backend PlanImport metadata (Phase 2P.2–2P.5).
 *
 * Document bytes live in private GCS at each file's storagePath.
 *
 * Status ownership is server-side:
 *   uploading → uploaded  (2P.2)
 *   uploaded → processing → ready_for_review  (2P.3)
 *   ready_for_review → ready_for_approval  (2P.4)
 *   ready_for_approval → approved  (2P.5, only after PlanItems persist)
 *
 * Candidates remain historical provenance after approval.
 */

export type PlanImportStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "ready_for_approval"
  | "approved"
  | "failed";

export type PlanImportFileUploadStatus = "pending" | "uploaded" | "failed";

export type PlanImportFile = {
  id: string;
  /** Client-stable file id used for idempotent create retries. */
  localFileId: string;
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadStatus: PlanImportFileUploadStatus;
};

export type PlanImport = {
  id: string;
  projectId: string;
  /** Project storage tenancy (Project.ownerUid). */
  ownerUid: string;
  /** Firebase UID of the authenticated creator. */
  createdByUid: string;
  /** Client-stable import id for idempotent create. */
  localImportId: string;
  status: PlanImportStatus;
  files: PlanImportFile[];
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;

  /** Server-derived approval receipt (Phase 2P.5). Set only after PlanItems persist. */
  approvedAt?: string;
  approvedByUid?: string;
  createdPlanItemIds?: string[];
  selectedCandidateCount?: number;
  createdPlanItemCount?: number;
};
