import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type PlanItemCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localPlanItemId: string;
  remotePlanItemId: string;
};

function isPlanItemCloudMapping(
  value: unknown,
): value is PlanItemCloudMapping {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.remoteProjectId === "string" &&
    record.remoteProjectId.trim().length > 0 &&
    typeof record.localPlanItemId === "string" &&
    record.localPlanItemId.trim().length > 0 &&
    typeof record.remotePlanItemId === "string" &&
    record.remotePlanItemId.trim().length > 0
  );
}

async function readMappings(): Promise<PlanItemCloudMapping[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.planItemCloudMappings,
  );
  return items.filter(isPlanItemCloudMapping);
}

export async function getPlanItemCloudMappingsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<PlanItemCloudMapping[]> {
  const mappings = await readMappings();
  return mappings.filter(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId,
  );
}

export async function getRemotePlanItemId(
  ownerUid: string,
  localProjectId: string,
  localPlanItemId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.localPlanItemId === localPlanItemId,
  );
  return match?.remotePlanItemId;
}

export async function getLocalPlanItemIdForRemote(
  ownerUid: string,
  localProjectId: string,
  remotePlanItemId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.remotePlanItemId === remotePlanItemId,
  );
  return match?.localPlanItemId;
}

export async function setPlanItemCloudMapping(
  mapping: PlanItemCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim() ||
    !mapping.localPlanItemId.trim() ||
    !mapping.remotePlanItemId.trim()
  ) {
    throw new Error("Invalid plan item cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId &&
        existing.localPlanItemId === mapping.localPlanItemId
      ),
  );

  next.push({
    ownerUid: mapping.ownerUid,
    localProjectId: mapping.localProjectId,
    remoteProjectId: mapping.remoteProjectId,
    localPlanItemId: mapping.localPlanItemId,
    remotePlanItemId: mapping.remotePlanItemId,
  });

  await writeJsonArray(STORAGE_KEYS.planItemCloudMappings, next);
}
