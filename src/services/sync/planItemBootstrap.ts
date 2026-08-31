import { bootstrapRemotePlanItems } from "../api/planItems";
import {
  getRemotePlanItemId,
  setPlanItemCloudMapping,
} from "../../store/planItemCloudMappings";
import { getPlanItemById } from "../../store/planItems";
import { ensureRemoteProject } from "./projectBootstrap";

const planItemEnsureInFlight = new Map<string, Promise<string | undefined>>();

function planItemEnsureKey(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): string {
  return `${ownerUid}:${localProjectId}:${localPlanItemId}`;
}

async function runEnsureRemotePlanItem(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<string | undefined> {
  const existing = await getRemotePlanItemId(
    ownerUid,
    localProjectId,
    localPlanItemId,
  );

  if (existing) {
    return existing;
  }

  const remoteProjectId = await ensureRemoteProject(ownerUid, localProjectId);

  if (!remoteProjectId) {
    return undefined;
  }

  const localPlanItem = await getPlanItemById(ownerUid, localPlanItemId);

  if (!localPlanItem || localPlanItem.projectId !== localProjectId) {
    return undefined;
  }

  try {
    const result = await bootstrapRemotePlanItems(remoteProjectId, [
      {
        localPlanItemId: localPlanItem.id,
        type: localPlanItem.type,
        label: localPlanItem.label,
        plannedValue: localPlanItem.plannedValue,
        unit: localPlanItem.unit,
        unitCost: localPlanItem.unitCost,
        productionRatePerDay: localPlanItem.productionRatePerDay,
        laborHoursPerUnit: localPlanItem.laborHoursPerUnit,
      },
    ]);

    const remote = result.items.find(
      (item) => item.localPlanItemId === localPlanItem.id,
    );

    if (!remote) {
      return undefined;
    }

    await setPlanItemCloudMapping({
      ownerUid,
      localProjectId,
      remoteProjectId,
      localPlanItemId: localPlanItem.id,
      remotePlanItemId: remote.id,
    });

    return remote.id;
  } catch {
    return undefined;
  }
}

/**
 * Ensure a remote PlanItem exists for the exact local PlanItem id.
 * Calls ensureRemoteProject first. Idempotent. Does not throw.
 */
export async function ensureRemotePlanItem(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<string | undefined> {
  if (
    !ownerUid.trim() ||
    !localProjectId.trim() ||
    !localPlanItemId.trim()
  ) {
    return undefined;
  }

  const key = planItemEnsureKey(ownerUid, localProjectId, localPlanItemId);
  const existing = planItemEnsureInFlight.get(key);

  if (existing) {
    return existing;
  }

  const run = runEnsureRemotePlanItem(
    ownerUid,
    localProjectId,
    localPlanItemId,
  ).finally(() => {
    if (planItemEnsureInFlight.get(key) === run) {
      planItemEnsureInFlight.delete(key);
    }
  });

  planItemEnsureInFlight.set(key, run);
  return run;
}
