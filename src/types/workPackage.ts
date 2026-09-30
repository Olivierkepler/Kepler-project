/**
 * Local WorkPackage domain foundation (Phase 2A).
 *
 * A WorkPackage is a construction scope within a Project.
 * It is NOT a ProjectMember, Assignment, or PlanItem.
 *
 * planItemIds references existing PlanItem ids (local) without moving
 * or duplicating PlanItem records. Assignments are a later phase —
 * do not add assignee fields here.
 *
 * Ownership partitioning remains storage-namespace scoped via store
 * `ownerUid` parameters — domain records stay free of ownerUid.
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
  /** Local PlanItem ids grouped into this scope (may be empty). */
  planItemIds: string[];
  /** Short-lived cloud presentation URL; never persisted in the local store. */
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};
