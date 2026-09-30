import type { WorkPackage } from "../domain/workPackage.js";
import {
  commitWorkPackageImage,
  deleteWorkPackageImage,
  presentWorkPackage,
  requestWorkPackageImageUpload,
  WorkPackageImageError,
} from "../services/workPackageImageService.js";
import {
  buildWorkPackageImageObjectPath,
  WORK_PACKAGE_IMAGE_MAX_BYTES,
} from "../storage/workPackageImageStorage.js";
import {
  normalizeWorkPackageDocument,
  parseWorkPackageImageCommitBody,
  parseWorkPackageImageUploadUrlBody,
} from "../validation/workPackage.js";

const PROJECT_ID = "wp-image-project";
const PACKAGE_ID = "wp-image-package";
const OWNER_UID = "wp-image-owner";
const OBJECT_ID = "4a21ec72-c855-4d13-b0ca-2e43d38c6b43";
const CONTENT_TYPE = "image/jpeg";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function expectRejected(
  label: string,
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error(`${label}: expected rejection`);
}

function workPackage(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    id: PACKAGE_ID,
    projectId: PROJECT_ID,
    name: "Electrical",
    status: "draft",
    planItemIds: [],
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function makeDependencies(options: {
  metadata?: { size: number; contentType: string | null } | null;
  previousPath?: string | null;
} = {}) {
  const calls: { storedPath?: string | null; deleted: string[] } = { deleted: [] };
  let current = workPackage({ imageStoragePath: options.previousPath ?? null });
  const dependencies = {
    createObjectId: () => OBJECT_ID,
    createUploadUrl: async (input: { objectPath: string }) => {
      calls.storedPath = input.objectPath;
      return { uploadUrl: "https://upload.example/signed", expiresAt: "2026-10-01T00:00:00.000Z" };
    },
    getObjectMetadata: async () => options.metadata === undefined
      ? { size: 1024, contentType: CONTENT_TYPE }
      : options.metadata,
    createReadUrl: async () => "https://read.example/temporary",
    updateImageStoragePath: async (input: {
      projectId: string;
      workPackageId: string;
      imageStoragePath: string | null;
    }) => {
      if (input.projectId !== current.projectId || input.workPackageId !== current.id) {
        return undefined;
      }
      const previousImageStoragePath = current.imageStoragePath ?? null;
      current = { ...current, imageStoragePath: input.imageStoragePath };
      calls.storedPath = input.imageStoragePath;
      return { workPackage: current, previousImageStoragePath };
    },
    deleteObject: async (path: string) => { calls.deleted.push(path); },
  };
  return { calls, dependencies };
}

async function main(): Promise<void> {
  const legacy = normalizeWorkPackageDocument(workPackage());
  assert(legacy !== undefined, "Work Package without image remains valid");
  assert(
    normalizeWorkPackageDocument(workPackage({ imageStoragePath: null })) !== undefined,
    "Work Package accepts null image path",
  );
  assert(
    parseWorkPackageImageUploadUrlBody({ contentType: CONTENT_TYPE })?.contentType === CONTENT_TYPE,
    "supported MIME accepted",
  );
  assert(
    parseWorkPackageImageUploadUrlBody({ contentType: "text/plain" }) === null,
    "invalid MIME rejected",
  );
  assert(
    parseWorkPackageImageCommitBody({ objectId: "bad", contentType: CONTENT_TYPE }) === null,
    "invalid object ID rejected",
  );

  const uploadMock = makeDependencies();
  const upload = await requestWorkPackageImageUpload({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage(),
    contentType: CONTENT_TYPE,
  }, uploadMock.dependencies);
  assert(upload.uploadUrl.startsWith("https://"), "owner receives signed upload URL");
  assert(!("objectPath" in upload), "upload response does not expose object path");
  assert(
    uploadMock.calls.storedPath === buildWorkPackageImageObjectPath({
      projectId: PROJECT_ID,
      workPackageId: PACKAGE_ID,
      objectId: OBJECT_ID,
      contentType: CONTENT_TYPE,
    }),
    "private path is package scoped",
  );

  const unauthorized = await expectRejected("non-owner denied", () => requestWorkPackageImageUpload({
    uid: "member-user",
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage(),
    contentType: CONTENT_TYPE,
  }, makeDependencies().dependencies));
  assert(unauthorized instanceof WorkPackageImageError, "non-owner rejected");

  const mismatch = await expectRejected("wrong project/package denied", () => requestWorkPackageImageUpload({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: "other-project",
    workPackage: workPackage(),
    contentType: CONTENT_TYPE,
  }, makeDependencies().dependencies));
  assert(mismatch instanceof WorkPackageImageError, "mismatched project rejected");

  const invalidMime = await expectRejected("invalid MIME denied", () => requestWorkPackageImageUpload({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage(),
    contentType: "text/plain",
  }, makeDependencies().dependencies));
  assert(invalidMime instanceof WorkPackageImageError, "unsupported type rejected");

  const missingObject = await expectRejected("missing committed object denied", () => commitWorkPackageImage({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage(),
    objectId: OBJECT_ID,
    contentType: CONTENT_TYPE,
  }, makeDependencies({ metadata: null }).dependencies));
  assert(missingObject instanceof WorkPackageImageError, "missing object rejected");

  const oversizedMock = makeDependencies({
    metadata: { size: WORK_PACKAGE_IMAGE_MAX_BYTES + 1, contentType: CONTENT_TYPE },
  });
  const oversized = await expectRejected("oversized object denied", () => commitWorkPackageImage({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage(),
    objectId: OBJECT_ID,
    contentType: CONTENT_TYPE,
  }, oversizedMock.dependencies));
  assert(oversized instanceof WorkPackageImageError, "oversized object rejected");
  assert(
    oversizedMock.calls.deleted.length === 1,
    "oversized object is cleaned up",
  );

  const oldPath = "projects/wp-image-project/work-packages/wp-image-package/image/old.jpg";
  const commitMock = makeDependencies({ previousPath: oldPath });
  const committed = await commitWorkPackageImage({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage({ imageStoragePath: oldPath }),
    objectId: OBJECT_ID,
    contentType: CONTENT_TYPE,
  }, commitMock.dependencies);
  assert(committed.imageUrl === "https://read.example/temporary", "commit returns signed presentation URL");
  assert(!("imageStoragePath" in committed), "presentation omits private image path");
  assert(commitMock.calls.deleted.includes(oldPath), "replacement cleans prior object");

  const removed = await deleteWorkPackageImage({
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    workPackage: workPackage({ imageStoragePath: oldPath }),
  }, makeDependencies({ previousPath: oldPath }).dependencies);
  assert(!("imageUrl" in removed), "remove returns cube-fallback presentation");
  assert(!("imageStoragePath" in removed), "remove presentation omits private path");

  const presentedLegacy = await presentWorkPackage(workPackage());
  assert(!("imageUrl" in presentedLegacy), "no-image package keeps optional image absent");
  console.log("workPackageImageServiceTest: ok");
}

void main();
