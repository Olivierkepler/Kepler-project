/**
 * Minimal WorkPackage shape for agent provenance context (Phase 2L.1).
 * Matches backend WorkPackage fields needed for safe model context.
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
  description?: string;
  status: WorkPackageStatus;
  planItemIds: string[];
  createdAt: string;
  updatedAt: string;
};
