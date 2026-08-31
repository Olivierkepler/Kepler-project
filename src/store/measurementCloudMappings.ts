import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type MeasurementCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localPlanItemId: string;
  remotePlanItemId: string;
  localMeasurementId: string;
  remoteMeasurementId: string;
};

function isMeasurementCloudMapping(
  value: unknown,
): value is MeasurementCloudMapping {
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
    record.remoteMeasurementId.trim().length > 0
  );
}

async function readMappings(): Promise<MeasurementCloudMapping[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.measurementCloudMappings,
  );
  return items.filter(isMeasurementCloudMapping);
}

export async function getMeasurementCloudMappingsForProject(
  ownerUid: string,
  localProjectId: string,
): Promise<MeasurementCloudMapping[]> {
  const mappings = await readMappings();
  return mappings.filter(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId,
  );
}

export async function getRemoteMeasurementId(
  ownerUid: string,
  localProjectId: string,
  localMeasurementId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.localMeasurementId === localMeasurementId,
  );
  return match?.remoteMeasurementId;
}

export async function getLocalMeasurementIdForRemote(
  ownerUid: string,
  localProjectId: string,
  remoteMeasurementId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.remoteMeasurementId === remoteMeasurementId,
  );
  return match?.localMeasurementId;
}

export async function setMeasurementCloudMapping(
  mapping: MeasurementCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim() ||
    !mapping.localPlanItemId.trim() ||
    !mapping.remotePlanItemId.trim() ||
    !mapping.localMeasurementId.trim() ||
    !mapping.remoteMeasurementId.trim()
  ) {
    throw new Error("Invalid measurement cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId &&
        existing.localMeasurementId === mapping.localMeasurementId
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
  });

  await writeJsonArray(STORAGE_KEYS.measurementCloudMappings, next);
}
