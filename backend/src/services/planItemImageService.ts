import type { PlanItem } from "../domain/planItem.js";
import {
  updatePlanItemImageStoragePath,
  type PlanItemImagePathUpdate,
} from "../repositories/planItemsRepository.js";
import {
  buildPlanItemImageObjectPath,
  createPlanItemImageObjectId,
  createPlanItemImageReadUrl,
  createPlanItemImageUploadUrl,
  deletePlanItemImageObject,
  getPlanItemImageObjectMetadata,
  isAllowedPlanItemImageContentType,
  isPlanItemImageObjectId,
  isPlanItemImageObjectPathFor,
  PLAN_ITEM_IMAGE_MAX_BYTES,
  type PlanItemImageObjectMetadata,
  type SignedPlanItemImageUpload,
} from "../storage/planItemImageStorage.js";

export type PlanItemPresentation = Omit<PlanItem, "imageStoragePath"> & {
  imageUrl?: string;
};

export class PlanItemImageError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404,
  ) {
    super(message);
    this.name = "PlanItemImageError";
  }
}

type PlanItemImageServiceDependencies = {
  createUploadUrl: typeof createPlanItemImageUploadUrl;
  getObjectMetadata: typeof getPlanItemImageObjectMetadata;
  createReadUrl: typeof createPlanItemImageReadUrl;
  deleteObject: typeof deletePlanItemImageObject;
  updateImageStoragePath: typeof updatePlanItemImageStoragePath;
  createObjectId: typeof createPlanItemImageObjectId;
};

const defaultDependencies: PlanItemImageServiceDependencies = {
  createUploadUrl: createPlanItemImageUploadUrl,
  getObjectMetadata: getPlanItemImageObjectMetadata,
  createReadUrl: createPlanItemImageReadUrl,
  deleteObject: deletePlanItemImageObject,
  updateImageStoragePath: updatePlanItemImageStoragePath,
  createObjectId: createPlanItemImageObjectId,
};

export function assertPlanItemImageEditor(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  planItem: PlanItem;
}): void {
  if (!input.uid.trim()) {
    throw new PlanItemImageError("Unauthorized", 404);
  }
  if (input.uid.trim() !== input.projectOwnerUid.trim()) {
    throw new PlanItemImageError("Project not found", 404);
  }
  if (
    !input.projectId.trim() ||
    input.planItem.projectId !== input.projectId.trim()
  ) {
    throw new PlanItemImageError("Plan item not found", 404);
  }
}

export async function presentPlanItem(
  planItem: PlanItem,
  createReadUrl: typeof createPlanItemImageReadUrl = createPlanItemImageReadUrl,
): Promise<PlanItemPresentation> {
  const { imageStoragePath, ...presentation } = planItem;
  if (!imageStoragePath?.trim()) {
    return presentation;
  }

  try {
    return {
      ...presentation,
      imageUrl: await createReadUrl({
        objectPath: imageStoragePath,
        projectId: planItem.projectId,
        planItemId: planItem.id,
      }),
    };
  } catch {
    return presentation;
  }
}

export async function presentPlanItems(
  planItems: readonly PlanItem[],
  createReadUrl: typeof createPlanItemImageReadUrl = createPlanItemImageReadUrl,
): Promise<PlanItemPresentation[]> {
  return Promise.all(
    planItems.map((planItem) => presentPlanItem(planItem, createReadUrl)),
  );
}

export async function requestPlanItemImageUpload(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  planItem: PlanItem;
  contentType: string;
}, dependencies = defaultDependencies): Promise<{
  uploadUrl: string;
  objectId: string;
  contentType: string;
  expiresAt: string;
}> {
  assertPlanItemImageEditor(input);
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedPlanItemImageContentType(contentType)) {
    throw new PlanItemImageError("Unsupported image content type", 400);
  }

  const objectId = dependencies.createObjectId();
  const objectPath = buildPlanItemImageObjectPath({
    projectId: input.projectId,
    planItemId: input.planItem.id,
    objectId,
    contentType,
  });
  const signed: SignedPlanItemImageUpload = await dependencies.createUploadUrl({
    objectPath,
    contentType,
  });

  return {
    uploadUrl: signed.uploadUrl,
    objectId,
    contentType,
    expiresAt: signed.expiresAt,
  };
}

export async function commitPlanItemImage(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  planItem: PlanItem;
  objectId: string;
  contentType: string;
}, dependencies = defaultDependencies): Promise<PlanItemPresentation> {
  assertPlanItemImageEditor(input);
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();
  if (
    !isPlanItemImageObjectId(objectId) ||
    !isAllowedPlanItemImageContentType(contentType)
  ) {
    throw new PlanItemImageError("Invalid Plan Item image upload", 400);
  }

  const objectPath = buildPlanItemImageObjectPath({
    projectId: input.projectId,
    planItemId: input.planItem.id,
    objectId,
    contentType,
  });
  if (
    !isPlanItemImageObjectPathFor({
      objectPath,
      projectId: input.projectId,
      planItemId: input.planItem.id,
      objectId,
      contentType,
    })
  ) {
    throw new PlanItemImageError("Invalid Plan Item image path", 400);
  }

  const metadata: PlanItemImageObjectMetadata | null =
    await dependencies.getObjectMetadata(objectPath);
  if (!metadata) {
    throw new PlanItemImageError("Plan Item image upload was not found", 400);
  }
  if (
    metadata.size <= 0 ||
    metadata.size > PLAN_ITEM_IMAGE_MAX_BYTES ||
    metadata.contentType?.trim().toLowerCase() !== contentType
  ) {
    throw new PlanItemImageError(
      "Plan Item image must be a supported image no larger than 5 MB",
      400,
    );
  }

  const updated = await dependencies.updateImageStoragePath({
    projectId: input.projectId,
    planItemId: input.planItem.id,
    imageStoragePath: objectPath,
  });
  if (!updated) {
    throw new PlanItemImageError("Plan item not found", 404);
  }

  await cleanupPreviousImage(updated, objectPath, dependencies);
  return presentPlanItem(updated.planItem, dependencies.createReadUrl);
}

export async function deletePlanItemImage(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  planItem: PlanItem;
}, dependencies = defaultDependencies): Promise<PlanItemPresentation> {
  assertPlanItemImageEditor(input);
  const updated = await dependencies.updateImageStoragePath({
    projectId: input.projectId,
    planItemId: input.planItem.id,
    imageStoragePath: null,
  });
  if (!updated) {
    throw new PlanItemImageError("Plan item not found", 404);
  }

  await cleanupPreviousImage(updated, null, dependencies);
  return presentPlanItem(updated.planItem, dependencies.createReadUrl);
}

async function cleanupPreviousImage(
  updated: PlanItemImagePathUpdate,
  nextImageStoragePath: string | null,
  dependencies: PlanItemImageServiceDependencies,
): Promise<void> {
  const previous = updated.previousImageStoragePath?.trim();
  if (previous && previous !== nextImageStoragePath) {
    await dependencies.deleteObject(previous).catch(() => undefined);
  }
}
