/**
 * Plan Item chat reference authorization (Phase Chat 2A).
 *
 * Chat membership ≠ Plan assigned_scope. References must not broaden Plan access.
 */

import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { ChatMessageReference } from "../../domain/chatMessage.js";
import type { PlanItem } from "../../domain/planItem.js";
import { presentPlanItem } from "../planItemImageService.js";
import {
  getPlanItemById,
  getPlanItemsForProject,
} from "../../repositories/planItemsRepository.js";
import { getMeasurementsForProject } from "../../repositories/measurementsRepository.js";
import { listWorkPackagesForProject } from "../../repositories/workPackagesRepository.js";
import {
  assertProjectAccessContext,
  filterMeasurementsForAccess,
  filterPlanItemsForAccess,
  type ProjectAccessContext,
} from "../collaboration/projectAccessScope.js";

export type ChatPlanItemReferencePresentation = {
  planItemId: string;
  available: boolean;
  label: string | null;
  typeLabel: string | null;
  plannedValue: number | null;
  unit: string | null;
  workPackageName: string | null;
  statusLabel: string | null;
  latestFieldValue: number | null;
  variance: number | null;
  imageUrl?: string;
};

function typeLabelFor(type: PlanItem["type"]): string {
  switch (type) {
    case "length":
      return "LENGTH";
    case "area":
      return "AREA";
    case "count":
      return "COUNT";
    case "volume":
      return "VOLUME";
    default:
      return type;
  }
}

function unavailablePresentation(
  planItemId: string,
): ChatPlanItemReferencePresentation {
  return {
    planItemId,
    available: false,
    label: null,
    typeLabel: null,
    plannedValue: null,
    unit: null,
    workPackageName: null,
    statusLabel: null,
    latestFieldValue: null,
    variance: null,
  };
}

/**
 * Sender may attach a Plan Item reference only if they can read that Plan Item
 * under the existing project access model (full or assigned_scope).
 */
export async function assertPlanItemReferenceableByUser(input: {
  projectId: string;
  uid: string;
  reference: ChatMessageReference;
}): Promise<PlanItem> {
  if (input.reference.type !== "plan_item") {
    throw new ProjectAccessError("Plan Item not found", 404);
  }

  const access = await assertProjectAccessContext(
    input.projectId,
    input.uid,
  );

  const planItem = await getPlanItemById(input.reference.planItemId);
  if (!planItem || planItem.projectId !== access.project.id) {
    throw new ProjectAccessError("Plan Item not found", 404);
  }

  const visible = filterPlanItemsForAccess([planItem], access);
  if (visible.length === 0) {
    throw new ProjectAccessError("Plan Item not found", 404);
  }

  return planItem;
}

export async function resolveChatPlanItemPresentations(input: {
  projectId: string;
  uid: string;
  planItemIds: readonly string[];
}): Promise<Record<string, ChatPlanItemReferencePresentation>> {
  const uniqueIds = [
    ...new Set(
      input.planItemIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];

  if (uniqueIds.length === 0) {
    return {};
  }

  let access: ProjectAccessContext;
  try {
    access = await assertProjectAccessContext(input.projectId, input.uid);
  } catch {
    const denied: Record<string, ChatPlanItemReferencePresentation> = {};
    for (const id of uniqueIds) {
      denied[id] = unavailablePresentation(id);
    }
    return denied;
  }

  const [allPlanItems, workPackages, measurementsRaw] = await Promise.all([
    getPlanItemsForProject(access.project.id),
    listWorkPackagesForProject(access.project.id),
    getMeasurementsForProject(access.project.id),
  ]);
  const measurements = filterMeasurementsForAccess(measurementsRaw, access);
  const planItemById = new Map(allPlanItems.map((item) => [item.id, item]));

  const workPackageNameByPlanItemId = new Map<string, string>();
  for (const workPackage of workPackages) {
    if (workPackage.projectId !== access.project.id) {
      continue;
    }
    if (workPackage.status === "cancelled") {
      continue;
    }
    for (const planItemId of workPackage.planItemIds ?? []) {
      if (!workPackageNameByPlanItemId.has(planItemId)) {
        workPackageNameByPlanItemId.set(planItemId, workPackage.name);
      }
    }
  }

  const result: Record<string, ChatPlanItemReferencePresentation> = {};

  for (const planItemId of uniqueIds) {
    const planItem = planItemById.get(planItemId);
    if (!planItem || planItem.projectId !== access.project.id) {
      result[planItemId] = unavailablePresentation(planItemId);
      continue;
    }

    const visible = filterPlanItemsForAccess([planItem], access);
    if (visible.length === 0) {
      result[planItemId] = unavailablePresentation(planItemId);
      continue;
    }

    const scopedMeasurements = measurements
      .filter((item) => item.planItemId === planItemId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = scopedMeasurements[0] ?? null;

    const presentation = await presentPlanItem(planItem);
    result[planItemId] = {
      planItemId,
      available: true,
      label: planItem.label,
      typeLabel: typeLabelFor(planItem.type),
      plannedValue: planItem.plannedValue,
      unit: planItem.unit,
      workPackageName: workPackageNameByPlanItemId.get(planItemId) ?? null,
      statusLabel: latest ? "Measured" : "Awaiting field",
      latestFieldValue: latest ? latest.value : null,
      variance: latest ? latest.value - planItem.plannedValue : null,
      ...(presentation.imageUrl ? { imageUrl: presentation.imageUrl } : {}),
    };
  }

  return result;
}
