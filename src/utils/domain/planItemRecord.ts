import type { PlanItem, PlanItemType } from "../../types/plan";

const PLAN_ITEM_TYPES: readonly PlanItemType[] = ["length", "area", "count", "volume"];

function isPlanItemType(value: unknown): value is PlanItemType {
  return typeof value === "string" && (PLAN_ITEM_TYPES as readonly string[]).includes(value);
}

export function isPlanItem(value: unknown): value is PlanItem {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const baseValid =
    typeof record.id === "string" && record.id.trim().length > 0 &&
    typeof record.projectId === "string" && record.projectId.trim().length > 0 &&
    isPlanItemType(record.type) && typeof record.label === "string" &&
    typeof record.plannedValue === "number" && typeof record.unit === "string" &&
    typeof record.unitCost === "number" && typeof record.productionRatePerDay === "number" &&
    typeof record.laborHoursPerUnit === "number";
  if (!baseValid) return false;
  if (record.imageUri !== undefined && record.imageUri !== null && typeof record.imageUri !== "string") return false;
  if (record.origin !== undefined && record.origin !== "manual" && record.origin !== "plan_import") return false;
  if (record.planImportId !== undefined && typeof record.planImportId !== "string") return false;
  if (record.planImportCandidateId !== undefined && typeof record.planImportCandidateId !== "string") return false;
  return true;
}

/** Local persistence explicitly drops signed remote URLs, which expire. */
export function copyLocalPlanItem(item: PlanItem): PlanItem {
  const copy = { ...item };
  delete copy.imageUrl;
  return copy;
}
