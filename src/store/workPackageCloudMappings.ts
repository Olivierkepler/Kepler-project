import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type WorkPackageCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localWorkPackageId: string;
  remoteWorkPackageId: string;
};

function isWorkPackageCloudMapping(
  value: unknown,
): value is WorkPackageCloudMapping {
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
    typeof record.localWorkPackageId === "string" &&
    record.localWorkPackageId.trim().length > 0 &&
    typeof record.remoteWorkPackageId === "string" &&
    record.remoteWorkPackageId.trim().length > 0
  );
}

async function readMappings(): Promise<WorkPackageCloudMapping[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.workPackageCloudMappings,
  );
  return items.filter(isWorkPackageCloudMapping);
}

export async function getRemoteWorkPackageId(
  ownerUid: string,
  localProjectId: string,
  localWorkPackageId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.localWorkPackageId === localWorkPackageId,
  );
  return match?.remoteWorkPackageId;
}

export async function setWorkPackageCloudMapping(
  mapping: WorkPackageCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim() ||
    !mapping.localWorkPackageId.trim() ||
    !mapping.remoteWorkPackageId.trim()
  ) {
    throw new Error("Invalid work package cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId &&
        existing.localWorkPackageId === mapping.localWorkPackageId
      ),
  );

  next.push({
    ownerUid: mapping.ownerUid,
    localProjectId: mapping.localProjectId,
    remoteProjectId: mapping.remoteProjectId,
    localWorkPackageId: mapping.localWorkPackageId,
    remoteWorkPackageId: mapping.remoteWorkPackageId,
  });

  await writeJsonArray(STORAGE_KEYS.workPackageCloudMappings, next);
}
