import type { PlanItem, PlanItemType } from "../../types/plan";

export const PLAN_ITEM_CREATE_TYPES: readonly PlanItemType[] = [
  "length",
  "area",
  "count",
  "volume",
];

/**
 * Canonical units used by existing seed data (ft, ea) plus safe area/volume units.
 */
export function defaultUnitForPlanItemType(type: PlanItemType): string {
  switch (type) {
    case "length":
      return "ft";
    case "area":
      return "sq ft";
    case "count":
      return "ea";
    case "volume":
      return "cu ft";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function isPlanItemTypeValue(value: unknown): value is PlanItemType {
  return (
    typeof value === "string" &&
    (PLAN_ITEM_CREATE_TYPES as readonly string[]).includes(value)
  );
}

/** Matches MeasurementScreen eligibility without constructing a PlanItem. */
export function isCurrentlyMeasurablePlanItemType(
  type: PlanItemType,
  unit: string,
): boolean {
  return type === "length" && unit === "ft";
}

export type PlanItemCreateInput = {
  projectId: string;
  type: PlanItemType;
  label: string;
  plannedValue: number;
  unit: string;
  unitCost: number;
  productionRatePerDay: number;
  laborHoursPerUnit: number;
};

export type PlanItemCreateValidationResult =
  | { ok: true; value: PlanItemCreateInput }
  | { ok: false; error: string };

/**
 * Resolves create-form numeric fields before persistence.
 *
 * - unitCost / laborHoursPerUnit: blank → 0 (domain requires numbers; 0 means no impact)
 * - productionRatePerDay: REQUIRED and must be > 0
 *   (domain + Delta schedule impact require a positive rate; do NOT invent 1)
 */
export function resolvePlanItemCreateFormNumerics(input: {
  unitCostText: string;
  productionRateText: string;
  laborHoursText: string;
}):
  | {
      ok: true;
      unitCost: number;
      productionRatePerDay: number;
      laborHoursPerUnit: number;
    }
  | { ok: false; error: string } {
  const unitCostRaw = input.unitCostText.trim();
  const productionRateRaw = input.productionRateText.trim();
  const laborHoursRaw = input.laborHoursText.trim();

  let unitCost = 0;
  if (unitCostRaw) {
    const parsed = Number(unitCostRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: "Unit cost must be a number ≥ 0 when provided." };
    }
    unitCost = parsed;
  }

  if (!productionRateRaw) {
    return {
      ok: false,
      error: "Production rate per day is required and must be greater than 0.",
    };
  }

  const productionRatePerDay = Number(productionRateRaw);
  if (!Number.isFinite(productionRatePerDay) || productionRatePerDay <= 0) {
    return {
      ok: false,
      error: "Production rate per day must be a number greater than 0.",
    };
  }

  let laborHoursPerUnit = 0;
  if (laborHoursRaw) {
    const parsed = Number(laborHoursRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        ok: false,
        error: "Labor hours per unit must be a number ≥ 0 when provided.",
      };
    }
    laborHoursPerUnit = parsed;
  }

  return {
    ok: true,
    unitCost,
    productionRatePerDay,
    laborHoursPerUnit,
  };
}

/**
 * Validates create-form input. plannedValue must be finite and > 0.
 * unitCost / laborHoursPerUnit must be finite ≥ 0 (0 allowed).
 * productionRatePerDay must be finite and > 0 (required by domain / Delta).
 */
export function validatePlanItemCreateInput(
  input: PlanItemCreateInput,
): PlanItemCreateValidationResult {
  const projectId = input.projectId.trim();
  const label = input.label.trim();
  const unit = input.unit.trim();

  if (!projectId) {
    return { ok: false, error: "Project is required." };
  }

  if (!label) {
    return { ok: false, error: "Label is required." };
  }

  if (!isPlanItemTypeValue(input.type)) {
    return { ok: false, error: "Type must be length, area, count, or volume." };
  }

  if (!unit) {
    return { ok: false, error: "Unit is required." };
  }

  if (unit !== defaultUnitForPlanItemType(input.type)) {
    return {
      ok: false,
      error: `Unit must be ${defaultUnitForPlanItemType(input.type)} for ${input.type}.`,
    };
  }

  if (
    typeof input.plannedValue !== "number" ||
    !Number.isFinite(input.plannedValue) ||
    input.plannedValue <= 0
  ) {
    return {
      ok: false,
      error: "Planned quantity must be a number greater than 0.",
    };
  }

  if (
    typeof input.unitCost !== "number" ||
    !Number.isFinite(input.unitCost) ||
    input.unitCost < 0
  ) {
    return { ok: false, error: "Unit cost must be a number ≥ 0." };
  }

  if (
    typeof input.productionRatePerDay !== "number" ||
    !Number.isFinite(input.productionRatePerDay) ||
    input.productionRatePerDay <= 0
  ) {
    return {
      ok: false,
      error: "Production rate per day must be a number greater than 0.",
    };
  }

  if (
    typeof input.laborHoursPerUnit !== "number" ||
    !Number.isFinite(input.laborHoursPerUnit) ||
    input.laborHoursPerUnit < 0
  ) {
    return { ok: false, error: "Labor hours per unit must be a number ≥ 0." };
  }

  return {
    ok: true,
    value: {
      projectId,
      type: input.type,
      label,
      plannedValue: input.plannedValue,
      unit,
      unitCost: input.unitCost,
      productionRatePerDay: input.productionRatePerDay,
      laborHoursPerUnit: input.laborHoursPerUnit,
    },
  };
}

export function createLocalPlanItemId(): string {
  return `plan-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function buildPlanItem(
  id: string,
  input: PlanItemCreateInput,
): PlanItem {
  return {
    id,
    projectId: input.projectId,
    type: input.type,
    label: input.label,
    plannedValue: input.plannedValue,
    unit: input.unit,
    unitCost: input.unitCost,
    productionRatePerDay: input.productionRatePerDay,
    laborHoursPerUnit: input.laborHoursPerUnit,
  };
}
