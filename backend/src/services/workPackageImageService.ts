import type { WorkPackage } from "../domain/workPackage.js";
import {
  updateWorkPackageImageStoragePath,
  type WorkPackageImagePathUpdate,
} from "../repositories/workPackagesRepository.js";
import {
  buildWorkPackageImageObjectPath,
  createWorkPackageImageObjectId,
  createWorkPackageImageReadUrl,
  createWorkPackageImageUploadUrl,
  deleteWorkPackageImageObject,
  getWorkPackageImageObjectMetadata,
  isAllowedWorkPackageImageContentType,
  isWorkPackageImageObjectId,
  isWorkPackageImageObjectPathFor,
  WORK_PACKAGE_IMAGE_MAX_BYTES,
  type WorkPackageImageObjectMetadata,
} from "../storage/workPackageImageStorage.js";

export type WorkPackagePresentation = Omit<WorkPackage, "imageStoragePath"> & {
  imageUrl?: string;
};

export class WorkPackageImageError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404) {
    super(message);
    this.name = "WorkPackageImageError";
  }
}

type Dependencies = {
  createUploadUrl: typeof createWorkPackageImageUploadUrl;
  getObjectMetadata: typeof getWorkPackageImageObjectMetadata;
  createReadUrl: typeof createWorkPackageImageReadUrl;
  deleteObject: typeof deleteWorkPackageImageObject;
  updateImageStoragePath: typeof updateWorkPackageImageStoragePath;
  createObjectId: typeof createWorkPackageImageObjectId;
};

const defaults: Dependencies = {
  createUploadUrl: createWorkPackageImageUploadUrl,
  getObjectMetadata: getWorkPackageImageObjectMetadata,
  createReadUrl: createWorkPackageImageReadUrl,
  deleteObject: deleteWorkPackageImageObject,
  updateImageStoragePath: updateWorkPackageImageStoragePath,
  createObjectId: createWorkPackageImageObjectId,
};

export function assertWorkPackageImageEditor(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  workPackage: WorkPackage;
}): void {
  if (!input.uid.trim() || input.uid.trim() !== input.projectOwnerUid.trim()) {
    throw new WorkPackageImageError("Project not found", 404);
  }
  if (
    !input.projectId.trim() ||
    input.workPackage.projectId !== input.projectId.trim()
  ) {
    throw new WorkPackageImageError("Work package not found", 404);
  }
}

export async function presentWorkPackage(
  workPackage: WorkPackage,
  createReadUrl: typeof createWorkPackageImageReadUrl = createWorkPackageImageReadUrl,
): Promise<WorkPackagePresentation> {
  const { imageStoragePath, ...presentation } = workPackage;
  if (!imageStoragePath?.trim()) return presentation;
  try {
    return {
      ...presentation,
      imageUrl: await createReadUrl({
        objectPath: imageStoragePath,
        projectId: workPackage.projectId,
        workPackageId: workPackage.id,
      }),
    };
  } catch {
    return presentation;
  }
}

export async function presentWorkPackages(
  workPackages: readonly WorkPackage[],
  createReadUrl: typeof createWorkPackageImageReadUrl = createWorkPackageImageReadUrl,
): Promise<WorkPackagePresentation[]> {
  return Promise.all(workPackages.map((item) => presentWorkPackage(item, createReadUrl)));
}

export async function requestWorkPackageImageUpload(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  workPackage: WorkPackage;
  contentType: string;
}, dependencies = defaults): Promise<{
  uploadUrl: string;
  objectId: string;
  contentType: string;
  expiresAt: string;
}> {
  assertWorkPackageImageEditor(input);
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedWorkPackageImageContentType(contentType)) {
    throw new WorkPackageImageError("Unsupported image content type", 400);
  }
  const objectId = dependencies.createObjectId();
  const objectPath = buildWorkPackageImageObjectPath({
    projectId: input.projectId,
    workPackageId: input.workPackage.id,
    objectId,
    contentType,
  });
  const signed = await dependencies.createUploadUrl({ objectPath, contentType });
  return { uploadUrl: signed.uploadUrl, objectId, contentType, expiresAt: signed.expiresAt };
}

export async function commitWorkPackageImage(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  workPackage: WorkPackage;
  objectId: string;
  contentType: string;
}, dependencies = defaults): Promise<WorkPackagePresentation> {
  assertWorkPackageImageEditor(input);
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();
  if (!isWorkPackageImageObjectId(objectId) || !isAllowedWorkPackageImageContentType(contentType)) {
    throw new WorkPackageImageError("Invalid Work Package image upload", 400);
  }
  const objectPath = buildWorkPackageImageObjectPath({
    projectId: input.projectId,
    workPackageId: input.workPackage.id,
    objectId,
    contentType,
  });
  if (!isWorkPackageImageObjectPathFor({
    objectPath,
    projectId: input.projectId,
    workPackageId: input.workPackage.id,
    objectId,
    contentType,
  })) {
    throw new WorkPackageImageError("Invalid Work Package image path", 400);
  }
  const metadata: WorkPackageImageObjectMetadata | null = await dependencies.getObjectMetadata(objectPath);
  if (!metadata) throw new WorkPackageImageError("Work Package image upload was not found", 400);
  if (
    metadata.size <= 0 || metadata.size > WORK_PACKAGE_IMAGE_MAX_BYTES ||
    metadata.contentType?.trim().toLowerCase() !== contentType
  ) {
    await dependencies.deleteObject(objectPath).catch(() => undefined);
    throw new WorkPackageImageError("Work Package images must be supported images no larger than 5 MB", 400);
  }
  let updated: WorkPackageImagePathUpdate | undefined;
  try {
    updated = await dependencies.updateImageStoragePath({
      projectId: input.projectId,
      workPackageId: input.workPackage.id,
      imageStoragePath: objectPath,
    });
  } catch (error) {
    await dependencies.deleteObject(objectPath).catch(() => undefined);
    throw error;
  }
  if (!updated) {
    await dependencies.deleteObject(objectPath).catch(() => undefined);
    throw new WorkPackageImageError("Work package not found", 404);
  }
  await cleanupPreviousImage(updated, objectPath, dependencies);
  return presentWorkPackage(updated.workPackage, dependencies.createReadUrl);
}

export async function deleteWorkPackageImage(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  workPackage: WorkPackage;
}, dependencies = defaults): Promise<WorkPackagePresentation> {
  assertWorkPackageImageEditor(input);
  const updated = await dependencies.updateImageStoragePath({
    projectId: input.projectId,
    workPackageId: input.workPackage.id,
    imageStoragePath: null,
  });
  if (!updated) throw new WorkPackageImageError("Work package not found", 404);
  await cleanupPreviousImage(updated, null, dependencies);
  return presentWorkPackage(updated.workPackage, dependencies.createReadUrl);
}

async function cleanupPreviousImage(
  updated: WorkPackageImagePathUpdate,
  nextImageStoragePath: string | null,
  dependencies: Dependencies,
): Promise<void> {
  const previous = updated.previousImageStoragePath?.trim();
  if (previous && previous !== nextImageStoragePath) {
    await dependencies.deleteObject(previous).catch(() => undefined);
  }
}
