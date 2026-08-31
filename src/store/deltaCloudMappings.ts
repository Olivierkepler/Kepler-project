import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type DeltaCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localPlanItemId: string;
  remotePlanItemId: string;
  localMeasurementId: string;
  remoteMeasurementId: string;
  localDeltaId: string;
  remoteDeltaId: string;
};

function isDeltaCloudMapping(value: unknown): value is DeltaCloudMapping {
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
    record.remotePlanItemId.trim().length > 0 &&
    typeof record.localMeasurementId === "string" &&
    record.localMeasurementId.trim().length > 0 &&
    typeof record.remoteMeasurementId === "string" &&
    record.remoteMeasurementId.trim().length > 0 &&
    typeof record.localDeltaId === "string" &&
    record.localDeltaId.trim().length > 0 &&
    typeof record.remoteDeltaId === "string" &&
    record.remoteDeltaId.trim().length > 0
  );
}

async function readMappings(): Promise<DeltaCloudMapping[]> {
  const items = await readJsonArray<unknown>(STORAGE_KEYS.deltaCloudMappings);
  return items.filter(isDeltaCloudMapping);
}

export async function getDeltaCloudMappingsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<DeltaCloudMapping[]> {
  const mappings = await readMappings();
  return mappings.filter(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId,
  );
}

export async function getDeltaCloudMappingsForUser(
  ownerUid: string,
): Promise<DeltaCloudMapping[]> {
  const mappings = await readMappings();
  return mappings.filter((mapping) => mapping.ownerUid === ownerUid);
}

export async function getRemoteDeltaId(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<string | undefined> {
  const mapping = await getDeltaCloudMapping(
    ownerUid,
    localProjectId,
    localDeltaId,
  );
  return mapping?.remoteDeltaId;
}

/**
 * Reverse lookup by remote Delta id for the current owner.
 */
export async function getLocalDeltaIdForRemote(
  ownerUid: string,
  remoteDeltaId: string,
): Promise<{ localProjectId: string; localDeltaId: string } | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.remoteDeltaId === remoteDeltaId,
  );
  if (!match) {
    return undefined;
  }
  return {
    localProjectId: match.localProjectId,
    localDeltaId: match.localDeltaId,
  };
}

export async function getDeltaCloudMapping(
  ownerUid: string,
  localProjectId: string,
  localDeltaId: string,
): Promise<DeltaCloudMapping | undefined> {
  const mappings = await readMappings();
  return mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.localDeltaId === localDeltaId,
  );
}

export async function setDeltaCloudMapping(
  mapping: DeltaCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim() ||
    !mapping.localPlanItemId.trim() ||
    !mapping.remotePlanItemId.trim() ||
    !mapping.localMeasurementId.trim() ||
    !mapping.remoteMeasurementId.trim() ||
    !mapping.localDeltaId.trim() ||
    !mapping.remoteDeltaId.trim()
  ) {
    throw new Error("Invalid delta cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId &&
        existing.localDeltaId === mapping.localDeltaId
      ),
  );

  next.push({
    ownerUid: mapping.ownerUid,
    localProjectId: mapping.localProjectId,
    remoteProjectId: mapping.remoteProjectId,
    localPlanItemId: mapping.localPlanItemId,
    remotePlanItemId: mapping.remotePlanItemId,
    localMeasurementId: mapping.localMeasurementId,
    remoteMeasurementId: mapping.remoteMeasurementId,
    localDeltaId: mapping.localDeltaId,
    remoteDeltaId: mapping.remoteDeltaId,
  });

  await writeJsonArray(STORAGE_KEYS.deltaCloudMappings, next);
}
