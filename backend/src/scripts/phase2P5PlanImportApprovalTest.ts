/**
 * Phase 2P.5 — Final approval → authoritative PlanItem creation tests.
 *
 * Run: npx tsx src/scripts/phase2P5PlanImportApprovalTest.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  assertProjectOwnedByUser,
  ProjectAccessError,
} from "../auth/projectAccess.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { PlanImport } from "../domain/planImport.js";
import type { PlanImportCandidate } from "../domain/planImportCandidate.js";
import { candidateIsPlanItemCompatible } from "../domain/planImportCandidate.js";
import { createRemotePlanImportId } from "../domain/planImportId.js";
import {
  deleteCandidatesForImport,
  getCandidatesForImport,
  setCandidate,
} from "../repositories/planImportCandidatesRepository.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import {
  approvePlanImport,
  localPlanItemIdForCandidate,
  mapCandidateToPlanItem,
  PlanImportApprovalError,
} from "../services/planImportApproval.js";
import {
  PlanImportReviewError,
  updatePlanImportCandidate,
} from "../services/planImportReview.js";

const OWNER_UID = "phase2p5-owner-uid";
const FOREIGN_UID = "phase2p5-foreign-uid";
const LOCAL_PROJECT_ID = "project-2p5-plan-import-approval";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEq(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

async function assertThrowsAsync(
  label: string,
  fn: () => Promise<void>,
  match?: (error: unknown) => boolean,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected throw`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label}:`)) {
      throw error;
    }
    if (match && !match(error)) {
      throw error;
    }
  }
  console.log(`PASS ${label}`);
}

function loadEnvFileIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function seedProject(): Promise<Project> {
  const id = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const project: Project = {
    id,
    localProjectId: LOCAL_PROJECT_ID,
    name: "Phase 2P.5 Plan Import Approval",
    location: "Test Site",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: OWNER_UID,
  };
  await db.collection(COLLECTIONS.projects).doc(id).set(project);
  return project;
}

function makeImport(
  projectId: string,
  status: PlanImport["status"],
): PlanImport {
  const now = new Date().toISOString();
  const importId = createRemotePlanImportId(projectId, "local-import-2p5");
  return {
    id: importId,
    projectId,
    ownerUid: OWNER_UID,
    createdByUid: OWNER_UID,
    localImportId: "local-import-2p5",
    status,
    files: [
      {
        id: `${importId}_f_0`,
        localFileId: "file-local-1",
        name: "Electrical-plan.pdf",
        mimeType: "application/pdf",
        size: 1024,
        storagePath: `users/${OWNER_UID}/projects/${projectId}/plan-imports/${importId}/f.pdf`,
        uploadStatus: "uploaded",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function makeCandidate(args: {
  importId: string;
  projectId: string;
  index: number;
  overrides?: Partial<PlanImportCandidate>;
}): PlanImportCandidate {
  const now = "2026-08-26T15:00:00.000Z";
  const label = args.overrides?.label ?? `Candidate ${args.index}`;
  const type = args.overrides?.type ?? "length";
  const plannedValue = args.overrides?.plannedValue ?? 1250;
  const unit = args.overrides?.unit ?? "ft";
  return {
    id: `${args.importId}_c_${args.index}`,
    importId: args.importId,
    projectId: args.projectId,
    label,
    type,
    plannedValue,
    unit,
    sourceFileId: `${args.importId}_f_0`,
    sourcePage: 4,
    sourceReference: "E-201",
    confidence: 0.94,
    selected: true,
    reviewStatus: "reviewed",
    originalLabel: label,
    originalType: type,
    originalPlannedValue: plannedValue,
    originalUnit: unit,
    reviewedByUid: OWNER_UID,
    reviewedAt: now,
    createdAt: now,
    updatedAt: now,
    ...args.overrides,
  };
}

async function cleanup(
  projectId: string,
  importId: string,
  planItemIds: string[],
): Promise<void> {
  for (const id of planItemIds) {
    await db.collection(COLLECTIONS.planItems).doc(id).delete();
  }
  await deleteCandidatesForImport(importId);
  await db.collection(COLLECTIONS.planImports).doc(importId).delete();
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

function testMappingAndCompatibility(): void {
  console.log("\n--- Mapping / compatibility ---");

  const candidate = makeCandidate({
    importId: "imp",
    projectId: "proj",
    index: 0,
    overrides: {
      label: "Main conduit run",
      plannedValue: 1205,
      originalPlannedValue: 1250,
    },
  });

  assert(candidateIsPlanItemCompatible(candidate), "compatible candidate");
  assert(
    !candidateIsPlanItemCompatible({ ...candidate, type: "other" }),
    "other type incompatible",
  );
  assert(
    !candidateIsPlanItemCompatible({ ...candidate, plannedValue: 0 }),
    "zero quantity incompatible",
  );

  const item = mapCandidateToPlanItem({
    candidate,
    projectId: "proj",
    importId: "imp",
  });
  assertEq("uses effective label", item.label, "Main conduit run");
  assertEq("uses effective plannedValue", item.plannedValue, 1205);
  assertEq("origin plan_import", item.origin, "plan_import");
  assertEq("planImportId", item.planImportId, "imp");
  assertEq("planImportCandidateId", item.planImportCandidateId, candidate.id);
  assertEq("unitCost default", item.unitCost, 0);
  assertEq("productionRatePerDay default", item.productionRatePerDay, 1);
  assertEq(
    "deterministic local id",
    item.localPlanItemId,
    localPlanItemIdForCandidate(candidate.id),
  );
  console.log("PASS mapping uses reviewed values + provenance");
}

async function testLiveApprovalFlow(): Promise<void> {
  console.log("\n--- Live approval flow ---");

  const project = await seedProject();
  const planImport = makeImport(project.id, "ready_for_approval");
  await setPlanImport(planImport);

  const selectedA = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 0,
    overrides: {
      label: "Main conduit run",
      plannedValue: 1205,
      originalPlannedValue: 1250,
      unit: "ft",
      selected: true,
      reviewStatus: "reviewed",
    },
  });
  const selectedB = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 1,
    overrides: {
      label: "Receptacles",
      type: "count",
      plannedValue: 48,
      originalPlannedValue: 48,
      unit: "EA",
      originalType: "count",
      originalUnit: "EA",
      selected: true,
      reviewStatus: "reviewed",
    },
  });
  const unselected = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 2,
    overrides: {
      label: "Spare panels",
      type: "count",
      plannedValue: 2,
      unit: "EA",
      originalType: "count",
      originalUnit: "EA",
      selected: false,
      reviewStatus: "unreviewed",
    },
  });

  await setCandidate(selectedA);
  await setCandidate(selectedB);
  await setCandidate(unselected);

  const createdIds: string[] = [];

  try {
    await assertProjectOwnedByUser(project.id, OWNER_UID);
    console.log("PASS owner authorized");

    await assertThrowsAsync(
      "unauthorized project denied",
      async () => {
        await assertProjectOwnedByUser(project.id, FOREIGN_UID);
      },
      (e) => e instanceof ProjectAccessError,
    );

    await assertThrowsAsync(
      "import not ready_for_approval rejected",
      async () => {
        const wrongStatus = {
          ...planImport,
          status: "ready_for_review" as const,
        };
        await setPlanImport(wrongStatus);
        try {
          await approvePlanImport({
            projectId: project.id,
            importId: planImport.id,
            approverUid: OWNER_UID,
          });
        } finally {
          await setPlanImport(planImport);
        }
      },
      (e) => e instanceof PlanImportApprovalError && e.statusCode === 409,
    );

    await assertThrowsAsync(
      "zero selected rejected",
      async () => {
        await setCandidate({ ...selectedA, selected: false });
        await setCandidate({ ...selectedB, selected: false });
        try {
          await approvePlanImport({
            projectId: project.id,
            importId: planImport.id,
            approverUid: OWNER_UID,
          });
        } finally {
          await setCandidate(selectedA);
          await setCandidate(selectedB);
        }
      },
      (e) => e instanceof PlanImportApprovalError && e.statusCode === 409,
    );

    await assertThrowsAsync(
      "selected unreviewed rejected",
      async () => {
        await setCandidate({ ...selectedB, reviewStatus: "unreviewed" });
        try {
          await approvePlanImport({
            projectId: project.id,
            importId: planImport.id,
            approverUid: OWNER_UID,
          });
        } finally {
          await setCandidate(selectedB);
        }
      },
      (e) => e instanceof PlanImportApprovalError && e.statusCode === 409,
    );

    await assertThrowsAsync(
      "selected invalid candidate rejected",
      async () => {
        const { unit: _omitUnit, ...rest } = selectedB;
        await setCandidate({
          ...rest,
          type: "other",
        });
        try {
          await approvePlanImport({
            projectId: project.id,
            importId: planImport.id,
            approverUid: OWNER_UID,
          });
        } finally {
          await setCandidate(selectedB);
        }
      },
      (e) => e instanceof PlanImportApprovalError && e.statusCode === 409,
    );

    const first = await approvePlanImport({
      projectId: project.id,
      importId: planImport.id,
      approverUid: OWNER_UID,
    });
    createdIds.push(...first.createdPlanItemIds);

    assertEq("status approved", first.import.status, "approved");
    assertEq("createdCount 2", first.createdCount, 2);
    assert(!first.alreadyApproved, "first approval is not replay");
    assert(
      typeof first.import.approvedAt === "string" &&
        first.import.approvedAt.length > 0,
      "approvedAt server-derived",
    );
    assertEq(
      "approvedByUid server-derived",
      first.import.approvedByUid,
      OWNER_UID,
    );
    assertEq(
      "createdPlanItemIds length",
      first.import.createdPlanItemIds?.length,
      2,
    );

    const expectedA = mapCandidateToPlanItem({
      candidate: selectedA,
      projectId: project.id,
      importId: planImport.id,
    });
    const itemA = await getPlanItemById(expectedA.id);
    assert(itemA != null, "plan item A exists");
    assertEq("A uses reviewed value", itemA!.plannedValue, 1205);
    assertEq("A origin", itemA!.origin, "plan_import");
    assertEq("A planImportId", itemA!.planImportId, planImport.id);
    assertEq("A candidate id", itemA!.planImportCandidateId, selectedA.id);

    const candidatesAfter = await getCandidatesForImport(planImport.id);
    const aAfter = candidatesAfter.find((c) => c.id === selectedA.id);
    const unselectedAfter = candidatesAfter.find((c) => c.id === unselected.id);
    assertEq(
      "candidate A original preserved",
      aAfter?.originalPlannedValue,
      1250,
    );
    assertEq("candidate A marker set", aAfter?.createdPlanItemId, itemA!.id);
    assert(
      unselectedAfter?.createdPlanItemId == null,
      "unselected has no PlanItem marker",
    );
    assertEq("unselected remains", unselectedAfter?.selected, false);

    const planItemCount = await db
      .collection(COLLECTIONS.planItems)
      .where("projectId", "==", project.id)
      .get();
    assertEq("exactly 2 plan items", planItemCount.size, 2);
    console.log("PASS selected reviewed candidates create PlanItems");

    const second = await approvePlanImport({
      projectId: project.id,
      importId: planImport.id,
      approverUid: OWNER_UID,
    });
    assert(second.alreadyApproved, "replay reports alreadyApproved");
    assertEq("replay returns existing items", second.planItems.length, 2);
    assertEq("replay createdCount still 2", second.createdCount, 2);

    const afterReplay = await db
      .collection(COLLECTIONS.planItems)
      .where("projectId", "==", project.id)
      .get();
    assertEq("idempotent: still exactly 2 plan items", afterReplay.size, 2);
    console.log("PASS duplicate approval creates ZERO duplicates");

    await assertThrowsAsync(
      "approved candidate mutations rejected",
      async () => {
        await updatePlanImportCandidate({
          projectId: project.id,
          importId: planImport.id,
          candidateId: selectedA.id,
          reviewerUid: OWNER_UID,
          patch: { label: "Should not stick" },
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 409,
    );

    await assertThrowsAsync(
      "wrong-project import denied",
      async () => {
        await approvePlanImport({
          projectId: "other-project",
          importId: planImport.id,
          approverUid: OWNER_UID,
        });
      },
      (e) => e instanceof PlanImportApprovalError && e.statusCode === 404,
    );

    const finalImport = await getPlanImportById(planImport.id);
    assertEq("final status approved", finalImport?.status, "approved");
    console.log("PASS approved import immutable for candidate edits");
  } finally {
    await cleanup(project.id, planImport.id, createdIds);
  }
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  console.log("Phase 2P.5 Plan Import approval tests\n");
  testMappingAndCompatibility();
  await testLiveApprovalFlow();
  console.log("\nPhase 2P.5 approval tests complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
