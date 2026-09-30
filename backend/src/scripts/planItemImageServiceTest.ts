/** Plan Item image service contract tests with in-memory storage/repository. */

import type { PlanItem } from "../domain/planItem.js";
import {
  commitPlanItemImage,
  deletePlanItemImage,
  presentPlanItem,
  PlanItemImageError,
  requestPlanItemImageUpload,
} from "../services/planItemImageService.js";
import {
  buildPlanItemImageObjectPath,
  PLAN_ITEM_IMAGE_MAX_BYTES,
} from "../storage/planItemImageStorage.js";
import {
  parsePlanItemDocument,
  parsePlanItemImageCommitBody,
  parsePlanItemImageUploadUrlBody,
} from "../validation/planItem.js";

const PROJECT_ID = "owner_plan-image-test";
const ITEM_ID = `${PROJECT_ID}_plan-item-1`;
const OWNER_UID = "plan-image-owner";
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

function planItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: ITEM_ID,
    localPlanItemId: "plan-item-1",
    projectId: PROJECT_ID,
    type: "length",
    label: "Conference room wall",
    plannedValue: 10,
    unit: "ft",
    unitCost: 0,
    productionRatePerDay: 1,
    laborHoursPerUnit: 0,
    ...overrides,
  };
}

function ownerInput(overrides: Record<string, unknown> = {}) {
  return {
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    planItem: planItem(),
    ...overrides,
  };
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const calls: {
    requestedPath?: string;
    persistedPath?: string | null;
    previousPath: string | null;
    deletedPaths: string[];
    metadata: { size: number; contentType: string | null } | null;
  } = {
    previousPath:
      typeof overrides.previousPath === "string" ? overrides.previousPath : null,
    deletedPaths: [],
    metadata: { size: 1024, contentType: CONTENT_TYPE },
  };
  const dependencies = {
    createObjectId: () => OBJECT_ID,
    createUploadUrl: async (input: { objectPath: string; contentType: string }) => {
      calls.requestedPath = input.objectPath;
      return {
        uploadUrl: "https://uploads.example/signed-put",
        expiresAt: "2026-01-01T00:15:00.000Z",
      };
    },
    getObjectMetadata: async () => calls.metadata,
    createReadUrl: async () => "https://storage.example/signed-read",
    updateImageStoragePath: async (input: {
      projectId: string;
      planItemId: string;
      imageStoragePath: string | null;
    }) => {
      calls.persistedPath = input.imageStoragePath;
      return {
        planItem: planItem({ imageStoragePath: input.imageStoragePath }),
        previousImageStoragePath: calls.previousPath,
      };
    },
    deleteObject: async (objectPath: string) => {
      calls.deletedPaths.push(objectPath);
    },
    ...overrides,
  };
  return { calls, dependencies };
}

function validDocument(): Record<string, unknown> {
  return {
    ...planItem(),
    id: ITEM_ID,
  };
}

async function main(): Promise<void> {
  const legacy = parsePlanItemDocument(validDocument());
  assert(legacy !== null, "legacy Plan Item without image remains valid");
  assert(
    parsePlanItemDocument({ ...validDocument(), imageStoragePath: null }) !== null,
    "Plan Item accepts null imageStoragePath",
  );
  assert(
    parsePlanItemImageUploadUrlBody({ contentType: CONTENT_TYPE })?.contentType === CONTENT_TYPE,
    "upload validator accepts supported image MIME",
  );
  assert(
    parsePlanItemImageUploadUrlBody({ contentType: "text/plain" }) === null,
    "upload validator rejects unsupported MIME",
  );
  assert(
    parsePlanItemImageCommitBody({ objectId: "invalid", contentType: CONTENT_TYPE }) === null,
    "commit validator rejects invalid object ID",
  );

  const uploadMock = makeDependencies();
  const upload = await requestPlanItemImageUpload(
    { ...ownerInput(), contentType: CONTENT_TYPE },
    uploadMock.dependencies,
  );
  assert(upload.uploadUrl.startsWith("https://"), "owner receives signed URL");
  assert(upload.objectId === OBJECT_ID, "upload returns opaque object ID");
  assert(!("objectPath" in upload), "upload response omits private path");
  assert(
    uploadMock.calls.requestedPath ===
      `projects/${PROJECT_ID}/plan-items/${ITEM_ID}/image/${OBJECT_ID}.jpg`,
    "object path is scoped to project and Plan Item",
  );

  for (const [label, uid, projectId, item] of [
    ["unauthorized project member", "project-member", PROJECT_ID, planItem()],
    ["unrelated user", "unrelated-user", PROJECT_ID, planItem()],
    ["invalid project/item pairing", OWNER_UID, "another-project", planItem()],
  ] as const) {
    const error = await expectRejected(label, () =>
      requestPlanItemImageUpload(
        {
          uid,
          projectOwnerUid: OWNER_UID,
          projectId,
          planItem: item,
          contentType: CONTENT_TYPE,
        },
        makeDependencies().dependencies,
      ),
    );
    assert(error instanceof PlanItemImageError, `${label} is rejected`);
  }

  await expectRejected("invalid MIME", () =>
    requestPlanItemImageUpload(
      { ...ownerInput(), contentType: "text/plain" },
      makeDependencies().dependencies,
    ),
  );

  const missing = makeDependencies({ getObjectMetadata: async () => null });
  await expectRejected("missing committed object", () =>
    commitPlanItemImage(
      { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
      missing.dependencies,
    ),
  );

  for (const [label, metadata] of [
    ["zero-byte object", { size: 0, contentType: CONTENT_TYPE }],
    ["oversized object", { size: PLAN_ITEM_IMAGE_MAX_BYTES + 1, contentType: CONTENT_TYPE }],
    ["content type mismatch", { size: 1024, contentType: "image/png" }],
  ] as const) {
    const invalid = makeDependencies({ getObjectMetadata: async () => metadata });
    await expectRejected(label, () =>
      commitPlanItemImage(
        { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
        invalid.dependencies,
      ),
    );
    assert(invalid.calls.persistedPath === undefined, `${label} is not persisted`);
  }

  const commitMock = makeDependencies();
  const committed = await commitPlanItemImage(
    { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
    commitMock.dependencies,
  );
  const expectedPath = buildPlanItemImageObjectPath({
    projectId: PROJECT_ID,
    planItemId: ITEM_ID,
    objectId: OBJECT_ID,
    contentType: CONTENT_TYPE,
  });
  assert(commitMock.calls.persistedPath === expectedPath, "commit stores private path");
  assert(committed.imageUrl === "https://storage.example/signed-read", "commit returns signed image URL");
  assert(!("imageStoragePath" in committed), "presentation omits private path");

  const replacementMock = makeDependencies({
    previousPath: "projects/old/plan-items/old/image/old.jpg",
  });
  await commitPlanItemImage(
    {
      ...ownerInput({ planItem: planItem({ imageStoragePath: "old-private-path" }) }),
      objectId: OBJECT_ID,
      contentType: CONTENT_TYPE,
    },
    replacementMock.dependencies,
  );
  assert(replacementMock.calls.persistedPath === expectedPath, "replacement stores new path");
  assert(
    replacementMock.calls.deletedPaths[0] === "projects/old/plan-items/old/image/old.jpg",
    "replacement best-effort deletes old object after update",
  );

  const deleteMock = makeDependencies({
    previousPath: "projects/old/plan-items/old/image/old.jpg",
  });
  const removed = await deletePlanItemImage(
    ownerInput({ planItem: planItem({ imageStoragePath: "old-private-path" }) }),
    deleteMock.dependencies,
  );
  assert(deleteMock.calls.persistedPath === null, "delete clears private path");
  assert(deleteMock.calls.deletedPaths.length === 1, "delete best-effort removes object");
  assert(!("imageUrl" in removed), "removed image omits imageUrl");

  const cleanupFailureMock = makeDependencies({
    previousPath: "projects/old/plan-items/old/image/old.jpg",
    deleteObject: async () => {
      throw new Error("storage cleanup unavailable");
    },
  });
  const removedDespiteCleanupFailure = await deletePlanItemImage(
    ownerInput({ planItem: planItem({ imageStoragePath: "old-private-path" }) }),
    cleanupFailureMock.dependencies,
  );
  assert(cleanupFailureMock.calls.persistedPath === null, "cleanup failure does not restore path");
  assert(!("imageUrl" in removedDespiteCleanupFailure), "cleanup failure leaves item image cleared");

  const noImage = await presentPlanItem(planItem());
  assert(!("imageUrl" in noImage), "no image preserves fallback presentation");
  assert(!("imageStoragePath" in noImage), "no-image output has no private field");

  console.log("plan item image service tests: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
