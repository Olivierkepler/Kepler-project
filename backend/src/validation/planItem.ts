import type { PlanItem, PlanItemType } from "../domain/planItem.js";
import {
  isAllowedPlanItemImageContentType,
  isPlanItemImageObjectId,
} from "../storage/planItemImageStorage.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
} from "./primitives.js";

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

/**
 * Parses create-only PlanItem payloads (POST /api/plan-items).
 * Requires localPlanItemId. Client may supply remote id + projectId.
 */
export function parsePlanItem(body: unknown): PlanItem | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.localPlanItemId) ||
    body.localPlanItemId.includes("/") ||
    !isNonEmptyString(body.projectId) ||
    !isPlanItemType(body.type) ||
    !isNonEmptyString(body.label) ||
    !isFiniteNumber(body.plannedValue) ||
    !isNonEmptyString(body.unit) ||
    !isFiniteNumber(body.unitCost) ||
    !isFiniteNumber(body.productionRatePerDay) ||
    !isFiniteNumber(body.laborHoursPerUnit)
  ) {
    return null;
  }

  return {
    id: body.id,
    localPlanItemId: body.localPlanItemId,
    projectId: body.projectId,
    type: body.type,
    label: body.label,
    plannedValue: body.plannedValue,
    unit: body.unit,
    unitCost: body.unitCost,
    productionRatePerDay: body.productionRatePerDay,
    laborHoursPerUnit: body.laborHoursPerUnit,
  };
}

/**
 * Normalizes a trusted Firestore PlanItem document. Legacy documents without
 * imageStoragePath remain valid; client create payloads cannot set this field.
 */
export function parsePlanItemDocument(body: unknown): PlanItem | null {
  if (!isRecord(body)) {
    return null;
  }

  const planItem = parsePlanItem(body);
  if (!planItem) {
    return null;
  }

  if (
    body.origin !== undefined &&
    body.origin !== "manual" &&
    body.origin !== "plan_import"
  ) {
    return null;
  }
  if (
    body.planImportId !== undefined &&
    typeof body.planImportId !== "string"
  ) {
    return null;
  }
  if (
    body.planImportCandidateId !== undefined &&
    typeof body.planImportCandidateId !== "string"
  ) {
    return null;
  }

  const imageStoragePath = body.imageStoragePath;
  if (
    imageStoragePath !== undefined &&
    imageStoragePath !== null &&
    !isNonEmptyString(imageStoragePath)
  ) {
    return null;
  }

  return {
    ...planItem,
    ...(body.origin !== undefined ? { origin: body.origin } : {}),
    ...(body.planImportId !== undefined
      ? { planImportId: body.planImportId }
      : {}),
    ...(body.planImportCandidateId !== undefined
      ? { planImportCandidateId: body.planImportCandidateId }
      : {}),
    ...(imageStoragePath !== undefined
      ? {
          imageStoragePath:
            imageStoragePath === null ? null : imageStoragePath.trim(),
        }
      : {}),
  };
}

export type PlanItemBootstrapItemInput = Omit<
  PlanItem,
  "id" | "projectId"
>;

/**
 * Parses one bootstrap item. No id / projectId from client.
 */
export function parsePlanItemBootstrapItem(
  body: unknown,
): PlanItemBootstrapItemInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.localPlanItemId) ||
    body.localPlanItemId.includes("/") ||
    !isPlanItemType(body.type) ||
    !isNonEmptyString(body.label) ||
    !isFiniteNumber(body.plannedValue) ||
    !isNonEmptyString(body.unit) ||
    !isFiniteNumber(body.unitCost) ||
    !isFiniteNumber(body.productionRatePerDay) ||
    !isFiniteNumber(body.laborHoursPerUnit)
  ) {
    return null;
  }

  return {
    localPlanItemId: body.localPlanItemId,
    type: body.type,
    label: body.label,
    plannedValue: body.plannedValue,
    unit: body.unit,
    unitCost: body.unitCost,
    productionRatePerDay: body.productionRatePerDay,
    laborHoursPerUnit: body.laborHoursPerUnit,
  };
}

export function parsePlanItemBootstrapBody(
  body: unknown,
): PlanItemBootstrapItemInput[] | null {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return null;
  }

  if (body.items.length === 0) {
    return null;
  }

  const items: PlanItemBootstrapItemInput[] = [];

  for (const entry of body.items) {
    const parsed = parsePlanItemBootstrapItem(entry);

    if (!parsed) {
      return null;
    }

    items.push(parsed);
  }

  return items;
}

export type PlanItemUpdateInput = {
  label?: string;
  plannedValue?: number;
  unitCost?: number;
  productionRatePerDay?: number;
  laborHoursPerUnit?: number;
};

/**
 * Parses narrow PlanItem PATCH body.
 * At least one editable field required.
 * Rejects type/unit/id/projectId/localPlanItemId mutation.
 */
export function parsePlanItemUpdateInput(
  body: unknown,
): PlanItemUpdateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const update: PlanItemUpdateInput = {};

  if ("label" in body) {
    if (!isNonEmptyString(body.label)) {
      return null;
    }
    update.label = body.label;
  }

  if ("plannedValue" in body) {
    if (!isFiniteNumber(body.plannedValue) || body.plannedValue < 0) {
      return null;
    }
    update.plannedValue = body.plannedValue;
  }

  if ("unitCost" in body) {
    if (!isFiniteNumber(body.unitCost) || body.unitCost < 0) {
      return null;
    }
    update.unitCost = body.unitCost;
  }

  if ("productionRatePerDay" in body) {
    if (
      !isFiniteNumber(body.productionRatePerDay) ||
      body.productionRatePerDay <= 0
    ) {
      return null;
    }
    update.productionRatePerDay = body.productionRatePerDay;
  }

  if ("laborHoursPerUnit" in body) {
    if (
      !isFiniteNumber(body.laborHoursPerUnit) ||
      body.laborHoursPerUnit < 0
    ) {
      return null;
    }
    update.laborHoursPerUnit = body.laborHoursPerUnit;
  }

  if (
    update.label === undefined &&
    update.plannedValue === undefined &&
    update.unitCost === undefined &&
    update.productionRatePerDay === undefined &&
    update.laborHoursPerUnit === undefined
  ) {
    return null;
  }

  return update;
}

export function parsePlanItemImageUploadUrlBody(
  body: unknown,
): { contentType: string } | null {
  if (!isRecord(body) || typeof body.contentType !== "string") {
    return null;
  }
  const contentType = body.contentType.trim().toLowerCase();
  return isAllowedPlanItemImageContentType(contentType)
    ? { contentType }
    : null;
}

export function parsePlanItemImageCommitBody(
  body: unknown,
): { objectId: string; contentType: string } | null {
  if (
    !isRecord(body) ||
    typeof body.objectId !== "string" ||
    typeof body.contentType !== "string"
  ) {
    return null;
  }
  const objectId = body.objectId.trim().toLowerCase();
  const contentType = body.contentType.trim().toLowerCase();
  if (
    !isPlanItemImageObjectId(objectId) ||
    !isAllowedPlanItemImageContentType(contentType)
  ) {
    return null;
  }
  return { objectId, contentType };
}
