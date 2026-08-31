import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type ProjectCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
};

function isProjectCloudMapping(value: unknown): value is ProjectCloudMapping {
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
    record.remoteProjectId.trim().length > 0
  );
}

async function readMappings(): Promise<ProjectCloudMapping[]> {
  const items = await readJsonArray<unknown>(STORAGE_KEYS.projectCloudMappings);
  return items.filter(isProjectCloudMapping);
}

export async function getProjectCloudMappingsForUser(
  ownerUid: string,
): Promise<ProjectCloudMapping[]> {
  const mappings = await readMappings();
  return mappings.filter((mapping) => mapping.ownerUid === ownerUid);
}

export async function getRemoteProjectId(
  ownerUid: string,
  localProjectId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId,
  );
  return match?.remoteProjectId;
}

/**
 * Reverse lookup: remote project id → local project id for the owner.
 */
export async function getLocalProjectIdForRemote(
  ownerUid: string,
  remoteProjectId: string,
): Promise<string | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.remoteProjectId === remoteProjectId,
  );
  return match?.localProjectId;
}

export async function setProjectCloudMapping(
  mapping: ProjectCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim()
  ) {
    throw new Error("Invalid project cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId
      ),
  );

  next.push({
    ownerUid: mapping.ownerUid,
    localProjectId: mapping.localProjectId,
    remoteProjectId: mapping.remoteProjectId,
  });

  await writeJsonArray(STORAGE_KEYS.projectCloudMappings, next);
}
