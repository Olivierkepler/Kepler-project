export type PlanItemType =
  | "length"
  | "area"
  | "count"
  | "volume";

/** Provenance origin (Phase 2P.5+). Manual items omit or use "manual". */
export type PlanItemOrigin = "manual" | "plan_import";

export type PlanItem = {
  id: string;
  projectId: string;
  type: PlanItemType;
  label: string;
  plannedValue: number;
  unit: string;
  unitCost: number;
  productionRatePerDay: number;
  laborHoursPerUnit: number;

  /**
   * Provenance (Phase 2P.5 / 2P.6). Optional for backward compatibility.
   * Imported items set origin = "plan_import" with import/candidate ids.
   */
  origin?: PlanItemOrigin;
  planImportId?: string;
  planImportCandidateId?: string;
};
