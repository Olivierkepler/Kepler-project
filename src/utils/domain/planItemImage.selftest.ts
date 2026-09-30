import type { PlanItem } from "../../types/plan";
import { processPendingPlanItemImageSync } from "./planItemImageSync";
import {
  applyPlanItemImageUriUpdate,
  getPlanItemImageDisplaySource,
} from "./planItemImage";
import { copyLocalPlanItem, isPlanItem } from "./planItemRecord";
import {
  isPendingPlanItemImageSync,
  type PendingPlanItemImageSync,
} from "./planItemImageSyncState";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const baseItem: PlanItem = {
  id: "plan-1",
  projectId: "project-1",
  type: "length",
  label: "Conference room wall",
  plannedValue: 10,
  unit: "ft",
  unitCost: 0,
  productionRatePerDay: 1,
  laborHoursPerUnit: 0,
};

const pending: PendingPlanItemImageSync = {
  ownerUid: "owner-1",
  localProjectId: "project-1",
  localPlanItemId: "plan-1",
  operation: "upload",
  operationId: "op-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastAttemptAt: "2026-01-01T00:00:00.000Z",
};

function mockDependencies(overrides: Record<string, unknown> = {}) {
  const calls = { clearCount: 0, uploadCount: 0 };
  const dependencies = {
    getPlanItem: async () => ({ ...baseItem, imageUri: "file:///docs/plan-items/plan-1/image.jpg" }),
    ensureRemotePlanItem: async () => "remote-item-1",
    getRemoteProjectId: async () => "remote-project-1",
    requestUploadUrl: async () => ({ uploadUrl: "https://upload", objectId: "object-1", contentType: "image/jpeg" }),
    uploadFile: async () => { calls.uploadCount += 1; },
    commitImage: async () => undefined,
    deleteImage: async () => undefined,
    clearPending: async () => { calls.clearCount += 1; },
    touchPending: async () => undefined,
    ...overrides,
  };
  return { calls, dependencies };
}

async function main(): Promise<void> {
  assert(isPlanItem(baseItem), "legacy Plan Item without image remains valid");
  const imageUri = "file:///documents/buildsigma/plan-items/plan-1/image.jpg";
  const localWithImage = copyLocalPlanItem({ ...baseItem, imageUri });
  const restored = JSON.parse(JSON.stringify(localWithImage)) as PlanItem;
  assert(restored.imageUri === imageUri, "imageUri survives local JSON persistence");

  const added = applyPlanItemImageUriUpdate(baseItem, imageUri);
  const replaced = applyPlanItemImageUriUpdate(added, "file:///docs/new.png");
  const cleared = applyPlanItemImageUriUpdate(replaced, null);
  assert(added.imageUri === imageUri, "imageUri can be added");
  assert(replaced.imageUri === "file:///docs/new.png", "imageUri can be replaced");
  assert(cleared.imageUri === null, "imageUri can be cleared");

  for (const operation of ["upload", "remove"] as const) {
    const persisted = JSON.parse(JSON.stringify({ ...pending, operation }));
    assert(isPendingPlanItemImageSync(persisted), `${operation} queue survives persistence/restart shape`);
  }

  const successful = mockDependencies();
  const successResult = await processPendingPlanItemImageSync(pending, successful.dependencies);
  assert(successResult.synced, "successful upload operation completes");
  assert(successful.calls.uploadCount === 1, "successful upload uses supplied local image");
  assert(successful.calls.clearCount === 1, "successful upload clears pending state");

  const failed = mockDependencies({ uploadFile: async () => { throw new Error("offline"); } });
  const failedResult = await processPendingPlanItemImageSync(pending, failed.dependencies);
  assert(!failedResult.synced, "failed upload remains unsynced");
  assert(failed.calls.clearCount === 0, "failed upload retains pending state");

  const localOnly = copyLocalPlanItem({ ...baseItem, imageUri, imageUrl: "https://signed.example/temporary" });
  assert(!localOnly.imageUrl, "signed imageUrl is not stored with local Plan Item");
  assert(getPlanItemImageDisplaySource({ imageUri, imageUrl: "https://signed.example/x" })?.source === "local", "display prefers local imageUri");
  assert(getPlanItemImageDisplaySource({ imageUrl: "https://signed.example/x" })?.source === "remote", "display falls back to API imageUrl");
  assert(getPlanItemImageDisplaySource({ imageUri, imageUrl: "https://signed.example/x" }, imageUri)?.source === "remote", "failed local image falls back to remote URL");
  assert(getPlanItemImageDisplaySource({ imageUri, imageUrl: "https://signed.example/x" }, [imageUri, "https://signed.example/x"]) === null, "failed/missing images fall back to initials");

  const removeOperation = mockDependencies({
    getPlanItem: async () => ({ ...baseItem, imageUri: null }),
  });
  const removeResult = await processPendingPlanItemImageSync(
    { ...pending, operation: "remove" },
    removeOperation.dependencies,
  );
  assert(removeResult.synced && removeOperation.calls.clearCount === 1, "successful remove clears pending state");

  console.log("Plan Item image local/sync self-tests: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
