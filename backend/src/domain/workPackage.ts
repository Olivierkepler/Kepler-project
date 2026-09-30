/**
 * Cloud WorkPackage (Phase 2C foundation).
 *
 * Semantically compatible with mobile src/types/workPackage.ts.
 * Timestamps follow backend ISO-string convention (Evidence, Delta, ProjectMember).
 *
 * - id: remote canonical Firestore document ID
 * - projectId: remote Project ID (not local project-001)
 * - planItemIds: remote PlanItem document IDs (PlanItem.id), never localPlanItemId
 *
 * Ownership / write auth is via projectId → Project.ownerUid.
 * Read auth follows membership-aware project read (Phase 1I).
 * Assignments are a later phase — do not add assignee fields here.
 */

export type WorkPackageStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type WorkPackage = {
  id: string;
  projectId: string;
  name: string;
  /** Optional scope notes; omitted when empty. */
  description?: string;
  status: WorkPackageStatus;
  /** Canonical cloud PlanItem ids (may be empty). */
  planItemIds: string[];
  /** Private Firebase Storage path; never include in API presentations. */
  imageStoragePath?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const WORK_PACKAGE_STATUSES: readonly WorkPackageStatus[] = [
  "draft",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
