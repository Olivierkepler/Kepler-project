export type DeltaStatus =
  | "open"
  | "accepted"
  | "rejected"
  | "resolved";

/**
 * Legacy Phase 33–34 status. Normalized to "accepted" on read.
 */
export type LegacyDeltaStatus = "reviewed";

/**
 * Backend Delta is ahead of the mobile Delta type.
 *
 * - id: remote canonical Firestore document ID (tenant-safe)
 * - localDeltaId: originating client/local ID
 * - projectId / planItemId / measurementId: remote IDs only
 *
 * status is the operational disposition (Phase 56).
 * Ownership is via projectId → Project.ownerUid.
 */
export type Delta = {
  id: string;
  localDeltaId: string;
  projectId: string;
  planItemId: string;
  measurementId: string;
  type: "length";
  plannedValue: number;
  actualValue: number;
  difference: number;
  percentDifference: number | null;
  unit: string;
  unitCost: number;
  costImpact: number;
  productionRatePerDay: number;
  scheduleImpactDays: number;
  laborHoursPerUnit: number;
  laborImpactHours: number;
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
};
