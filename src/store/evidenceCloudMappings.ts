import {
  readJsonArray,
  STORAGE_KEYS,
  writeJsonArray,
} from "./storage";

export type EvidenceCloudMapping = {
  ownerUid: string;
  localProjectId: string;
  remoteProjectId: string;
  localEvidenceId: string;
  remoteEvidenceId: string;
  objectPath: string | null;
};

function isEvidenceCloudMapping(
  value: unknown,
): value is EvidenceCloudMapping {
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
    typeof record.localEvidenceId === "string" &&
    record.localEvidenceId.trim().length > 0 &&
    typeof record.remoteEvidenceId === "string" &&
    record.remoteEvidenceId.trim().length > 0 &&
    (record.objectPath === null || typeof record.objectPath === "string")
  );
}

async function readMappings(): Promise<EvidenceCloudMapping[]> {
  const items = await readJsonArray<unknown>(
    STORAGE_KEYS.evidenceCloudMappings,
  );
  return items.filter(isEvidenceCloudMapping);
}

export async function getEvidenceCloudMapping(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<EvidenceCloudMapping | undefined> {
  const mappings = await readMappings();
  const match = mappings.find(
    (mapping) =>
      mapping.ownerUid === ownerUid &&
      mapping.localProjectId === localProjectId &&
      mapping.localEvidenceId === localEvidenceId,
  );
  return match
    ? {
        ownerUid: match.ownerUid,
        localProjectId: match.localProjectId,
        remoteProjectId: match.remoteProjectId,
        localEvidenceId: match.localEvidenceId,
        remoteEvidenceId: match.remoteEvidenceId,
        objectPath: match.objectPath,
      }
    : undefined;
}

export async function getRemoteEvidenceId(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<string | undefined> {
  const match = await getEvidenceCloudMapping(
    ownerUid,
    localProjectId,
    localEvidenceId,
  );
  return match?.remoteEvidenceId;
}

export async function isEvidenceMapped(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<boolean> {
  const remoteId = await getRemoteEvidenceId(
    ownerUid,
    localProjectId,
    localEvidenceId,
  );
  return remoteId != null;
}

export async function setEvidenceCloudMapping(
  mapping: EvidenceCloudMapping,
): Promise<void> {
  if (
    !mapping.ownerUid.trim() ||
    !mapping.localProjectId.trim() ||
    !mapping.remoteProjectId.trim() ||
    !mapping.localEvidenceId.trim() ||
    !mapping.remoteEvidenceId.trim()
  ) {
    throw new Error("Invalid evidence cloud mapping.");
  }

  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === mapping.ownerUid &&
        existing.localProjectId === mapping.localProjectId &&
        existing.localEvidenceId === mapping.localEvidenceId
      ),
  );

  next.push({
    ownerUid: mapping.ownerUid,
    localProjectId: mapping.localProjectId,
    remoteProjectId: mapping.remoteProjectId,
    localEvidenceId: mapping.localEvidenceId,
    remoteEvidenceId: mapping.remoteEvidenceId,
    objectPath: mapping.objectPath,
  });

  await writeJsonArray(STORAGE_KEYS.evidenceCloudMappings, next);
}

export async function deleteEvidenceCloudMapping(
  ownerUid: string,
  localProjectId: string,
  localEvidenceId: string,
): Promise<void> {
  const mappings = await readMappings();
  const next = mappings.filter(
    (existing) =>
      !(
        existing.ownerUid === ownerUid &&
        existing.localProjectId === localProjectId &&
        existing.localEvidenceId === localEvidenceId
      ),
  );
  await writeJsonArray(STORAGE_KEYS.evidenceCloudMappings, next);
}
