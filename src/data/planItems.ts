import type { PlanItem } from "../types/plan";

/**
 * Seed/default PlanItems for first-time local store initialization.
 * Operational reads use src/store/planItems.ts.
 */
export const planItems: PlanItem[] = [
  {
    id: "plan-001",
    projectId: "project-001",
    type: "length",
    label: "Main conduit run",
    plannedValue: 120,
    unit: "ft",
    unitCost: 4.5,
    productionRatePerDay: 40,
    laborHoursPerUnit: 0.15,
  },
  {
    id: "plan-002",
    projectId: "project-001",
    type: "length",
    label: "Conference room wall",
    plannedValue: 40,
    unit: "ft",
    unitCost: 12,
    productionRatePerDay: 20,
    laborHoursPerUnit: 0.3,
  },
  {
    id: "plan-003",
    projectId: "project-001",
    type: "count",
    label: "Receptacles",
    plannedValue: 8,
    unit: "ea",
    unitCost: 85,
    productionRatePerDay: 8,
    laborHoursPerUnit: 0.75,
  },
  {
    id: "plan-004",
    projectId: "project-002",
    type: "length",
    label: "Branch conduit",
    plannedValue: 180,
    unit: "ft",
    unitCost: 5.25,
    productionRatePerDay: 45,
    laborHoursPerUnit: 0.12,
  },
  {
    id: "plan-005",
    projectId: "project-002",
    type: "length",
    label: "Corridor wall",
    plannedValue: 65,
    unit: "ft",
    unitCost: 11.5,
    productionRatePerDay: 25,
    laborHoursPerUnit: 0.28,
  },
  {
    id: "plan-006",
    projectId: "project-002",
    type: "count",
    label: "Devices",
    plannedValue: 12,
    unit: "ea",
    unitCost: 95,
    productionRatePerDay: 10,
    laborHoursPerUnit: 0.8,
  },
];

/**
 * Seed-array helpers only. Operational code must use src/store/planItems.ts.
 */
export function getPlanItemsForProject(
  projectId: string,
): PlanItem[] {
  return planItems.filter((item) => item.projectId === projectId);
}

export function getPlanItemById(
  planItemId: string,
): PlanItem | undefined {
  return planItems.find((item) => item.id === planItemId);
}

export function getLengthPlanItemsForProject(
  projectId: string,
): PlanItem[] {
  return getPlanItemsForProject(projectId).filter(
    (item) => item.type === "length" && item.unit === "ft",
  );
}
