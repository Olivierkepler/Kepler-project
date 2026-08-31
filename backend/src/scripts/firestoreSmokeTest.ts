import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Project } from "../domain/project.js";
import {
  getProjectById,
  setProject,
} from "../repositories/projectsRepository.js";

const SMOKE_PROJECT_ID = "buildsigma-smoke-test";

async function main(): Promise<void> {
  const smokeProject: Project = {
    id: SMOKE_PROJECT_ID,
    localProjectId: "smoke-local",
    name: "BUILDSIGMA Smoke Test",
    location: "us-east1",
    status: "planning",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: "buildsigma-smoke-owner",
  };

  console.log("Writing smoke-test project...");
  await setProject(smokeProject);

  console.log("Reading smoke-test project...");
  const loaded = await getProjectById(SMOKE_PROJECT_ID);

  if (!loaded) {
    throw new Error("Smoke test failed: project not found after write");
  }

  if (loaded.id !== smokeProject.id || loaded.name !== smokeProject.name) {
    throw new Error("Smoke test failed: project fields did not match");
  }

  console.log("Smoke-test project verified:");
  console.log(JSON.stringify(loaded, null, 2));

  console.log("Cleaning up smoke-test document...");
  await db.collection(COLLECTIONS.projects).doc(SMOKE_PROJECT_ID).delete();

  const afterDelete = await getProjectById(SMOKE_PROJECT_ID);
  if (afterDelete) {
    throw new Error("Smoke test cleanup failed: document still exists");
  }

  console.log("Firestore smoke test passed.");
}

main().catch((error: unknown) => {
  console.error("Firestore smoke test failed:");
  console.error(error);
  process.exitCode = 1;
});
