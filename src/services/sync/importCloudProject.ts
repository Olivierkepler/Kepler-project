import type { RemotePlanItem } from "../api/planItems";
import type { RemoteProject } from "../api/projects";
import { setPlanItemCloudMapping } from "../../store/planItemCloudMappings";
import { setProjectCloudMapping } from "../../store/projectCloudMappings";
import { addPlanItemsIfAbsent } from "../../store/planItems";
import { addProjectIfAbsent, getProjectById } from "../../store/projects";
import type { PlanItem, PlanItemType } from "../../types/plan";
import type { Project, ProjectStatus } from "../../types/project";

export type ImportCloudProjectResult = {
  projectAdded: boolean;
  planItemsAdded: number;
  existingPlanItems: number;
  alreadyAvailable: boolean;
};

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "planning",
  "completed",
  "on-hold",
];

const PLAN_ITEM_TYPES: readonly PlanItemType[] = [
  "length",
  "area",
  "count",
  "volume",
];

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isPlanItemType(value: string): value is PlanItemType {
  return (PLAN_ITEM_TYPES as readonly string[]).includes(value);
}

function toLocalProject(remote: RemoteProject): Project | undefined {
  if (!remote.localProjectId.trim()) {
    return undefined;
  }

  if (!isProjectStatus(remote.status)) {
    return undefined;
  }

  return {
    id: remote.localProjectId,
    name: remote.name,
    location: remote.location,
    status: remote.status,
    progress: remote.progress,
    openDeltas: remote.openDeltas,
    assignedTasks: remote.assignedTasks,
  };
}

function toLocalPlanItem(
  remote: RemotePlanItem,
  localProjectId: string,
): PlanItem | undefined {
  if (!remote.localPlanItemId.trim()) {
    return undefined;
  }

  if (!isPlanItemType(remote.type)) {
    return undefined;
  }

  return {
    id: remote.localPlanItemId,
    projectId: localProjectId,
    type: remote.type,
    label: remote.label,
    plannedValue: remote.plannedValue,
    unit: remote.unit,
    unitCost: remote.unitCost,
    productionRatePerDay: remote.productionRatePerDay,
    laborHoursPerUnit: remote.laborHoursPerUnit,
  };
}

/**
 * Explicit import of a remote Project + PlanItems into local operational stores.
 * Uses local* IDs. Keeps existing local values. Repairs cloud mappings.
 */
export async function importCloudProjectToDevice(
  ownerUid: string,
  remoteProject: RemoteProject,
  remotePlanItems: RemotePlanItem[],
): Promise<ImportCloudProjectResult> {
  if (!ownerUid.trim()) {
    throw new Error("Your session could not be authenticated.");
  }

  const localProject = toLocalProject(remoteProject);

  if (!localProject) {
    throw new Error("This cloud project cannot be used on this device.");
  }

  const localPlanItems: PlanItem[] = [];

  for (const remote of remotePlanItems) {
    const converted = toLocalPlanItem(remote, localProject.id);

    if (!converted) {
      throw new Error("One or more planned quantities could not be imported.");
    }

    localPlanItems.push(converted);
  }

  const projectAdded = await addProjectIfAbsent(ownerUid, localProject);
  const planResult = await addPlanItemsIfAbsent(ownerUid, localPlanItems);

  await setProjectCloudMapping({
    ownerUid,
    localProjectId: localProject.id,
    remoteProjectId: remoteProject.id,
  });

  for (const remote of remotePlanItems) {
    await setPlanItemCloudMapping({
      ownerUid,
      localProjectId: localProject.id,
      remoteProjectId: remoteProject.id,
      localPlanItemId: remote.localPlanItemId,
      remotePlanItemId: remote.id,
    });
  }

  const available = await getProjectById(ownerUid, localProject.id);

  return {
    projectAdded,
    planItemsAdded: planResult.added,
    existingPlanItems: planResult.existing,
    alreadyAvailable: available != null && !projectAdded && planResult.added === 0,
  };
}
