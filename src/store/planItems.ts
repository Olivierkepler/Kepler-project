import { planItems as seedPlanItems } from "../data/planItems";
import type { PlanItem, PlanItemType } from "../types/plan";
import {
  buildPlanItem,
  createLocalPlanItemId,
  validatePlanItemCreateInput,
  type PlanItemCreateInput,
} from "../utils/domain/planItemCreate";
import {
  resolveScopedOperationalArray,
  scopedOperationalKey,
} from "./localDataScope";
import { writeJsonArray } from "./storage";

const PLAN_ITEM_TYPES: readonly PlanItemType[] = [
  "length",
  "area",
  "count",
  "volume",
];

function isPlanItemType(value: unknown): value is PlanItemType {
  return (
    typeof value === "string" &&
    (PLAN_ITEM_TYPES as readonly string[]).includes(value)
  );
}

function isPlanItem(value: unknown): value is PlanItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  const baseValid =
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.projectId === "string" &&
    record.projectId.trim().length > 0 &&
    isPlanItemType(record.type) &&
    typeof record.label === "string" &&
    typeof record.plannedValue === "number" &&
    typeof record.unit === "string" &&
    typeof record.unitCost === "number" &&
    typeof record.productionRatePerDay === "number" &&
    typeof record.laborHoursPerUnit === "number";

  if (!baseValid) {
    return false;
  }

  if (
    record.origin !== undefined &&
    record.origin !== "manual" &&
    record.origin !== "plan_import"
  ) {
    return false;
  }

  if (
    record.planImportId !== undefined &&
    typeof record.planImportId !== "string"
  ) {
    return false;
  }

  if (
    record.planImportCandidateId !== undefined &&
    typeof record.planImportCandidateId !== "string"
  ) {
    return false;
  }

  return true;
}

function copyPlanItem(item: PlanItem): PlanItem {
  return { ...item };
}

async function loadPlanItems(ownerUid: string): Promise<PlanItem[]> {
  const items = await resolveScopedOperationalArray(
    "planItems",
    ownerUid,
    () => seedPlanItems.map(copyPlanItem),
  );

  return items.filter(isPlanItem).map(copyPlanItem);
}

export async function getPlanItems(ownerUid: string): Promise<PlanItem[]> {
  return loadPlanItems(ownerUid);
}

export async function getPlanItemsForProject(
  ownerUid: string,
  projectId: string,
): Promise<PlanItem[]> {
  const items = await loadPlanItems(ownerUid);
  return items
    .filter((item) => item.projectId === projectId)
    .map(copyPlanItem);
}

export async function getPlanItemById(
  ownerUid: string,
  planItemId: string,
): Promise<PlanItem | undefined> {
  const items = await loadPlanItems(ownerUid);
  const found = items.find((item) => item.id === planItemId);
  return found ? copyPlanItem(found) : undefined;
}

export async function getLengthPlanItemsForProject(
  ownerUid: string,
  projectId: string,
): Promise<PlanItem[]> {
  const items = await getPlanItemsForProject(ownerUid, projectId);
  return items.filter((item) => item.type === "length" && item.unit === "ft");
}

/**
 * Adds PlanItems whose local ids are absent in this owner's namespace.
 * Does not overwrite existing local values.
 */
export async function addPlanItemsIfAbsent(
  ownerUid: string,
  items: PlanItem[],
): Promise<{ added: number; existing: number }> {
  const validItems = items.filter(isPlanItem).map(copyPlanItem);
  const current = await loadPlanItems(ownerUid);
  const existingIds = new Set(current.map((item) => item.id));

  const toAdd: PlanItem[] = [];
  let existing = 0;

  for (const item of validItems) {
    if (existingIds.has(item.id)) {
      existing += 1;
      continue;
    }

    existingIds.add(item.id);
    toAdd.push(item);
  }

  if (toAdd.length > 0) {
    await writeJsonArray(scopedOperationalKey("planItems", ownerUid), [
      ...current,
      ...toAdd,
    ]);
  }

  return { added: toAdd.length, existing };
}

/**
 * Local-first PlanItem create. Generates a local id, persists immediately,
 * and does not create Measurement/Delta/Evidence/AgentRun records.
 * Type and unit are set at creation and remain immutable afterward.
 */
export async function createPlanItem(
  ownerUid: string,
  input: PlanItemCreateInput,
): Promise<PlanItem> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid plan item create.");
  }

  const validated = validatePlanItemCreateInput(input);

  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const id = createLocalPlanItemId();

  if (id.includes("/")) {
    throw new Error("Invalid plan item id.");
  }

  const item = buildPlanItem(id, validated.value);
  const result = await addPlanItemsIfAbsent(ownerUid, [item]);

  if (result.added !== 1) {
    throw new Error("Plan item id already exists.");
  }

  return copyPlanItem(item);
}

export type PlanItemUpdate = {
  label?: string;
  plannedValue?: number;
  unitCost?: number;
  productionRatePerDay?: number;
  laborHoursPerUnit?: number;
};

function isValidPlanItemUpdate(update: PlanItemUpdate): boolean {
  if (update.label !== undefined) {
    if (typeof update.label !== "string" || update.label.trim().length === 0) {
      return false;
    }
  }

  if (update.plannedValue !== undefined) {
    if (
      typeof update.plannedValue !== "number" ||
      !Number.isFinite(update.plannedValue) ||
      update.plannedValue < 0
    ) {
      return false;
    }
  }

  if (update.unitCost !== undefined) {
    if (
      typeof update.unitCost !== "number" ||
      !Number.isFinite(update.unitCost) ||
      update.unitCost < 0
    ) {
      return false;
    }
  }

  if (update.productionRatePerDay !== undefined) {
    if (
      typeof update.productionRatePerDay !== "number" ||
      !Number.isFinite(update.productionRatePerDay) ||
      update.productionRatePerDay <= 0
    ) {
      return false;
    }
  }

  if (update.laborHoursPerUnit !== undefined) {
    if (
      typeof update.laborHoursPerUnit !== "number" ||
      !Number.isFinite(update.laborHoursPerUnit) ||
      update.laborHoursPerUnit < 0
    ) {
      return false;
    }
  }

  return (
    update.label !== undefined ||
    update.plannedValue !== undefined ||
    update.unitCost !== undefined ||
    update.productionRatePerDay !== undefined ||
    update.laborHoursPerUnit !== undefined
  );
}

/**
 * Narrow PlanItem field update. Does not allow id/projectId/type/unit mutation.
 */
export async function updatePlanItem(
  ownerUid: string,
  planItemId: string,
  update: PlanItemUpdate,
): Promise<PlanItem | undefined> {
  if (
    !ownerUid.trim() ||
    !planItemId.trim() ||
    !isValidPlanItemUpdate(update)
  ) {
    throw new Error("Invalid plan item update.");
  }

  const items = await loadPlanItems(ownerUid);
  const index = items.findIndex((item) => item.id === planItemId);

  if (index < 0) {
    return undefined;
  }

  const current = items[index];
  const nextItem: PlanItem = {
    ...current,
    ...(update.label !== undefined ? { label: update.label.trim() } : {}),
    ...(update.plannedValue !== undefined
      ? { plannedValue: update.plannedValue }
      : {}),
    ...(update.unitCost !== undefined ? { unitCost: update.unitCost } : {}),
    ...(update.productionRatePerDay !== undefined
      ? { productionRatePerDay: update.productionRatePerDay }
      : {}),
    ...(update.laborHoursPerUnit !== undefined
      ? { laborHoursPerUnit: update.laborHoursPerUnit }
      : {}),
  };

  const next = [...items];
  next[index] = copyPlanItem(nextItem);
  await writeJsonArray(scopedOperationalKey("planItems", ownerUid), next);
  return copyPlanItem(nextItem);
}
