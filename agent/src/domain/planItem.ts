export type PlanItemType = "length" | "area" | "count" | "volume";

/**
 * Backend PlanItem is ahead of the mobile PlanItem type.
 *
 * - id: remote canonical Firestore document ID (tenant-safe)
 * - localPlanItemId: originating client/local ID (e.g. plan-001)
 * - projectId: remote Project ID (not the local project-001)
 *
 * Ownership is via projectId → Project.ownerUid.
 */
export type PlanItem = {
  id: string;
  localPlanItemId: string;
  projectId: string;
  type: PlanItemType;
  label: string;
  plannedValue: number;
  unit: string;
  unitCost: number;
  productionRatePerDay: number;
  laborHoursPerUnit: number;
};
