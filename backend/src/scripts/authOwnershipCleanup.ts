import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";

const TEST_IDS = [
  "auth-test-project-a",
  "auth-test-project-b",
  "auth-test-plan-a",
  "auth-test-plan-b",
  "auth-test-measurement-a",
  "auth-test-delta-a",
  "api-test-project",
  "api-test-plan-item",
  "api-test-measurement",
  "api-test-delta",
] as const;

async function deleteIfExists(
  collectionName: string,
  id: string,
): Promise<void> {
  await db.collection(collectionName).doc(id).delete();
}

async function main(): Promise<void> {
  await Promise.all([
    ...TEST_IDS.map((id) => deleteIfExists(COLLECTIONS.projects, id)),
    ...TEST_IDS.map((id) => deleteIfExists(COLLECTIONS.planItems, id)),
    ...TEST_IDS.map((id) => deleteIfExists(COLLECTIONS.measurements, id)),
    ...TEST_IDS.map((id) => deleteIfExists(COLLECTIONS.deltas, id)),
  ]);

  console.log("Auth/API smoke-test documents cleaned.");
}

main().catch((error: unknown) => {
  console.error("Auth smoke cleanup failed:");
  console.error(error);
  process.exitCode = 1;
});
