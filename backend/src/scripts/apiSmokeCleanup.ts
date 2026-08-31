import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";

const TEST_IDS = {
  project: "api-test-project",
  planItem: "api-test-plan-item",
  measurement: "api-test-measurement",
  delta: "api-test-delta",
} as const;

async function main(): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.deltas).doc(TEST_IDS.delta).delete(),
    db.collection(COLLECTIONS.measurements).doc(TEST_IDS.measurement).delete(),
    db.collection(COLLECTIONS.planItems).doc(TEST_IDS.planItem).delete(),
    db.collection(COLLECTIONS.projects).doc(TEST_IDS.project).delete(),
  ]);

  console.log("API smoke-test documents cleaned:");
  console.log(JSON.stringify(TEST_IDS, null, 2));
}

main().catch((error: unknown) => {
  console.error("API smoke cleanup failed:");
  console.error(error);
  process.exitCode = 1;
});
