export type DeltaStatus =
  | "open"
  | "accepted"
  | "rejected"
  | "resolved";

export type Delta = {
  id: string;
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
  /** Operational disposition (Phase 56). Legacy "reviewed" normalizes to "accepted". */
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
  /**
   * Cloud/shared local Delta key (Phase shared evidence correlation).
   * Owner/local AsyncStorage records use `id` as the local key and omit this.
   */
  localDeltaId?: string;
};
