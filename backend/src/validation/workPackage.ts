import {
  WORK_PACKAGE_STATUSES,
  type WorkPackage,
  type WorkPackageStatus,
} from "../domain/workPackage.js";
import {
  isAllowedWorkPackageImageContentType,
  isWorkPackageImageObjectId,
} from "../storage/workPackageImageStorage.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function isWorkPackageStatus(
  value: unknown,
): value is WorkPackageStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Parses planItemIds: non-empty trimmed strings, no duplicates.
 * Empty array is valid.
 */
export function parsePlanItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return null;
    }

    const trimmed = entry.trim();

    if (seen.has(trimmed)) {
      return null;
    }

    seen.add(trimmed);
    ids.push(trimmed);
  }

  return ids;
}

export type WorkPackageCreateInput = {
  name: string;
  description?: string;
  status: WorkPackageStatus;
  planItemIds: string[];
};

export type WorkPackageUpdateInput = {
  name?: string;
  description?: string;
  status?: WorkPackageStatus;
  planItemIds?: string[];
};

/**
 * Create body: name required; description/status/planItemIds optional.
 * Ignores client id / projectId / createdAt / updatedAt.
 * Default status = draft. Default planItemIds = [].
 */
export function parseWorkPackageCreateInput(
  body: unknown,
): WorkPackageCreateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (!isNonEmptyString(body.name)) {
    return null;
  }

  let description: string | undefined;

  if ("description" in body) {
    if (typeof body.description !== "string") {
      return null;
    }
    const trimmed = body.description.trim();
    if (trimmed.length > 0) {
      description = body.description;
    }
  }

  let status: WorkPackageStatus = "draft";

  if ("status" in body) {
    if (!isWorkPackageStatus(body.status)) {
      return null;
    }
    status = body.status;
  }

  let planItemIds: string[] = [];

  if ("planItemIds" in body) {
    const parsed = parsePlanItemIds(body.planItemIds);
    if (parsed === null) {
      return null;
    }
    planItemIds = parsed;
  }

  return {
    name: body.name.trim(),
    ...(description !== undefined ? { description } : {}),
    status,
    planItemIds,
  };
}

/**
 * Narrow PATCH body. At least one editable field required.
 * Ignores id / projectId / createdAt / updatedAt.
 */
export function parseWorkPackageUpdateInput(
  body: unknown,
): WorkPackageUpdateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const update: WorkPackageUpdateInput = {};

  if ("name" in body) {
    if (!isNonEmptyString(body.name)) {
      return null;
    }
    update.name = body.name.trim();
  }

  if ("description" in body) {
    if (typeof body.description !== "string") {
      return null;
    }
    update.description = body.description;
  }

  if ("status" in body) {
    if (!isWorkPackageStatus(body.status)) {
      return null;
    }
    update.status = body.status;
  }

  if ("planItemIds" in body) {
    const parsed = parsePlanItemIds(body.planItemIds);
    if (parsed === null) {
      return null;
    }
    update.planItemIds = parsed;
  }

  if (
    update.name === undefined &&
    update.description === undefined &&
    update.status === undefined &&
    update.planItemIds === undefined
  ) {
    return null;
  }

  return update;
}

/**
 * Normalizes a Firestore WorkPackage document.
 * Invalid / incomplete docs are rejected (undefined).
 */
export function normalizeWorkPackageDocument(
  data: unknown,
): WorkPackage | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const planItemIds = parsePlanItemIds(data.planItemIds);

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.name) ||
    !isWorkPackageStatus(data.status) ||
    planItemIds === null ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) {
    return undefined;
  }

  if (
    data.description !== undefined &&
    typeof data.description !== "string"
  ) {
    return undefined;
  }

  const description =
    typeof data.description === "string" && data.description.trim().length > 0
      ? data.description
      : undefined;

  const imageStoragePath = data.imageStoragePath;
  if (
    imageStoragePath !== undefined &&
    imageStoragePath !== null &&
    !isNonEmptyString(imageStoragePath)
  ) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    name: data.name.trim(),
    ...(description !== undefined ? { description } : {}),
    status: data.status,
    planItemIds,
    ...(imageStoragePath !== undefined
      ? { imageStoragePath: imageStoragePath === null ? null : imageStoragePath.trim() }
      : {}),
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
  };
}

export function parseWorkPackageImageUploadUrlBody(
  body: unknown,
): { contentType: string } | null {
  if (!isRecord(body) || !isNonEmptyString(body.contentType)) return null;
  const contentType = body.contentType.trim().toLowerCase();
  return isAllowedWorkPackageImageContentType(contentType) ? { contentType } : null;
}

export function parseWorkPackageImageCommitBody(
  body: unknown,
): { objectId: string; contentType: string } | null {
  if (!isRecord(body) || !isNonEmptyString(body.objectId) || !isNonEmptyString(body.contentType)) {
    return null;
  }
  const objectId = body.objectId.trim().toLowerCase();
  const contentType = body.contentType.trim().toLowerCase();
  if (!isWorkPackageImageObjectId(objectId) || !isAllowedWorkPackageImageContentType(contentType)) {
    return null;
  }
  return { objectId, contentType };
}
