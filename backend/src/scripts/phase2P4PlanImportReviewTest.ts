/**
 * Phase 2P.4 — Plan Import candidate review workspace tests.
 *
 * Covers patch validation, original-preservation, batch scope, readiness,
 * ready_for_approval transition, authz boundaries, single-candidate delete,
 * and no PlanItem creation.
 *
 * Run: npx tsx src/scripts/phase2P4PlanImportReviewTest.ts
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
import {
  candidateHasUnresolvedRequiredErrors,
  candidateNeedsAttention,
} from "../domain/planImportCandidate.js";
import { createRemotePlanImportId } from "../domain/planImportId.js";
import {
  batchSelectPlanImportCandidates,
  deletePlanImportCandidate,
  evaluatePlanImportApprovalReadiness,
  markPlanImportReadyForApproval,
  parsePlanImportCandidatePatchInput,
  PlanImportReviewError,
  updatePlanImportCandidate,
} from "../services/planImportReview.js";
import { buildPlanImportCandidatesFromExtraction } from "../validation/planImportCandidate.js";
import {
  deleteCandidateById,
  deleteCandidatesForImport,
  getCandidateById,
  getCandidatesForImport,
  setCandidate,
} from "../repositories/planImportCandidatesRepository.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";

const OWNER_UID = "phase2p4-owner-uid";
const FOREIGN_UID = "phase2p4-foreign-uid";
const LOCAL_PROJECT_ID = "project-2p4-plan-import-review";

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

function assertThrows(
  label: string,
  fn: () => void,
  match?: (error: unknown) => boolean,
): void {
  try {
    fn();
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
    name: "Phase 2P.4 Plan Import Review",
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

function makeImport(projectId: string, status: PlanImport["status"]): PlanImport {
  const now = new Date().toISOString();
  const importId = createRemotePlanImportId(projectId, "local-import-2p4");
  return {
    id: importId,
    projectId,
    ownerUid: OWNER_UID,
    createdByUid: OWNER_UID,
    localImportId: "local-import-2p4",
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
  const now = "2026-08-26T12:00:00.000Z";
  const label = args.overrides?.label ?? `Candidate ${args.index}`;
  const type = args.overrides?.type ?? "length";
  const plannedValue = args.overrides?.plannedValue ?? 100;
  const unit = args.overrides?.unit ?? "ft";
  const base: PlanImportCandidate = {
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
    confidence: 0.92,
    selected: true,
    reviewStatus: "unreviewed",
    originalLabel: label,
    originalType: type,
    originalPlannedValue: plannedValue,
    originalUnit: unit,
    createdAt: now,
    updatedAt: now,
    ...args.overrides,
  };
  return base;
}

async function cleanup(projectId: string, importId: string): Promise<void> {
  await deleteCandidatesForImport(importId);
  await db.collection(COLLECTIONS.planImports).doc(importId).delete();
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

function testPatchValidation(): void {
  console.log("\n--- Patch validation ---");

  assertThrows(
    "rejects sourceFileId mutation",
    () => {
      parsePlanImportCandidatePatchInput({ sourceFileId: "x" });
    },
    (e) => e instanceof PlanImportReviewError && e.statusCode === 400,
  );

  assertThrows(
    "rejects confidence mutation",
    () => {
      parsePlanImportCandidatePatchInput({ confidence: 0.1 });
    },
    (e) => e instanceof PlanImportReviewError && e.statusCode === 400,
  );

  assertThrows(
    "rejects projectId mutation",
    () => {
      parsePlanImportCandidatePatchInput({ projectId: "other" });
    },
    (e) => e instanceof PlanImportReviewError && e.statusCode === 400,
  );

  assertThrows(
    "rejects reviewedByUid from client",
    () => {
      parsePlanImportCandidatePatchInput({
        selected: true,
        reviewedByUid: "attacker",
      });
    },
    (e) => e instanceof PlanImportReviewError && e.statusCode === 400,
  );

  const ok = parsePlanImportCandidatePatchInput({
    selected: false,
    label: "  Main conduit  ",
    plannedValue: 1205,
  });
  assertEq("label trimmed", ok.label, "Main conduit");
  assertEq("plannedValue kept", ok.plannedValue, 1205);
  console.log("PASS allowed fields parse");
}

function testNeedsAttentionRules(): void {
  console.log("\n--- Needs-attention rules ---");

  const solid = makeCandidate({
    importId: "i",
    projectId: "p",
    index: 0,
  });
  assert(!candidateNeedsAttention(solid), "complete high-confidence ok");
  assert(
    !candidateHasUnresolvedRequiredErrors(solid),
    "complete has no required errors",
  );

  const lowConfidence: PlanImportCandidate = { ...solid, confidence: 0.5 };
  assert(
    candidateNeedsAttention(lowConfidence),
    "low confidence needs attention",
  );
  assert(
    !candidateHasUnresolvedRequiredErrors(lowConfidence),
    "low confidence alone is not a required-field block",
  );

  const missingValue: PlanImportCandidate = {
    ...solid,
    plannedValue: undefined,
  };
  delete missingValue.plannedValue;
  assert(
    candidateHasUnresolvedRequiredErrors(missingValue),
    "missing plannedValue blocks",
  );

  assert(
    candidateNeedsAttention({
      ...solid,
      sourcePage: undefined,
      sourceReference: undefined,
    }),
    "thin provenance needs attention",
  );

  console.log("PASS needs-attention derivation");
}

function testReadinessRules(): void {
  console.log("\n--- Readiness rules ---");

  const a = makeCandidate({
    importId: "i",
    projectId: "p",
    index: 0,
    overrides: { reviewStatus: "reviewed", selected: true },
  });
  const b = makeCandidate({
    importId: "i",
    projectId: "p",
    index: 1,
    overrides: {
      reviewStatus: "unreviewed",
      selected: false,
      plannedValue: undefined,
      unit: undefined,
    },
  });

  const ready = evaluatePlanImportApprovalReadiness([a, b]);
  assert(ready.ready, "unselected incomplete does not block");

  const notReady = evaluatePlanImportApprovalReadiness([
    { ...a, reviewStatus: "unreviewed" },
  ]);
  assert(!notReady.ready, "unreviewed selected blocks");

  const missing = evaluatePlanImportApprovalReadiness([
    {
      ...a,
      plannedValue: undefined,
      unit: undefined,
      reviewStatus: "reviewed",
    },
  ]);
  assert(!missing.ready, "missing required fields block");

  const noneSelected = evaluatePlanImportApprovalReadiness([
    { ...a, selected: false },
  ]);
  assert(!noneSelected.ready, "zero selected blocks");

  console.log("PASS readiness evaluation");
}

function testOriginalPreservedOnBuild(): void {
  console.log("\n--- Original extraction on build ---");

  const built = buildPlanImportCandidatesFromExtraction({
    importId: "import-x",
    projectId: "proj-x",
    extraction: {
      candidates: [
        {
          label: "Main conduit run",
          type: "length",
          plannedValue: 1250,
          unit: "ft",
          sourceFileId: "file-1",
          sourcePage: 4,
          sourceReference: "E-201",
          confidence: 0.94,
        },
      ],
    },
    nowIso: "2026-08-26T00:00:00.000Z",
  });

  assertEq("reviewStatus unreviewed", built[0]!.reviewStatus, "unreviewed");
  assertEq("originalLabel", built[0]!.originalLabel, "Main conduit run");
  assertEq("originalPlannedValue", built[0]!.originalPlannedValue, 1250);
  assertEq("originalUnit", built[0]!.originalUnit, "ft");
  console.log("PASS build sets original* + unreviewed");
}

async function testLiveReviewFlow(): Promise<void> {
  console.log("\n--- Live Firestore review flow ---");

  const project = await seedProject();
  const planImport = makeImport(project.id, "ready_for_review");
  await setPlanImport(planImport);

  const c0 = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 0,
    overrides: {
      label: "Main conduit run",
      plannedValue: 1250,
      unit: "ft",
      originalLabel: "Main conduit run",
      originalPlannedValue: 1250,
      originalUnit: "ft",
    },
  });
  const c1 = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 1,
    overrides: {
      label: "Panels",
      type: "count",
      plannedValue: 2,
      unit: "EA",
      originalLabel: "Panels",
      originalType: "count",
      originalPlannedValue: 2,
      originalUnit: "EA",
    },
  });

  await setCandidate(c0);
  await setCandidate(c1);

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

    const foreignImport = makeImport(project.id, "ready_for_review");
    // Simulate candidate from another import id under same project.
    const foreignCandidate = makeCandidate({
      importId: `${planImport.id}_other`,
      projectId: project.id,
      index: 0,
    });
    await setCandidate(foreignCandidate);

    await assertThrowsAsync(
      "candidate from another import cannot be modified",
      async () => {
        await updatePlanImportCandidate({
          projectId: project.id,
          importId: planImport.id,
          candidateId: foreignCandidate.id,
          reviewerUid: OWNER_UID,
          patch: { selected: false },
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 404,
    );

    const deselected = await updatePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: c0.id,
      reviewerUid: OWNER_UID,
      patch: { selected: false },
    });
    assertEq("selected can be changed", deselected.selected, false);
    console.log("PASS selected can be changed");

    const edited = await updatePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: c0.id,
      reviewerUid: OWNER_UID,
      patch: {
        selected: true,
        label: "Main conduit run (corrected)",
        plannedValue: 1205,
      },
    });
    assertEq("label edited", edited.label, "Main conduit run (corrected)");
    assertEq("plannedValue edited", edited.plannedValue, 1205);
    assertEq(
      "original AI extraction preserved (label)",
      edited.originalLabel,
      "Main conduit run",
    );
    assertEq(
      "original AI extraction preserved (value)",
      edited.originalPlannedValue,
      1250,
    );
    assertEq("auto-reviewed after edit", edited.reviewStatus, "reviewed");
    assertEq("reviewedByUid server-derived", edited.reviewedByUid, OWNER_UID);
    assert(
      typeof edited.reviewedAt === "string" && edited.reviewedAt.length > 0,
      "reviewedAt server-derived",
    );
    console.log("PASS editable fields + original preserved + audit");

    await assertThrowsAsync(
      "batch select cannot include foreign candidate IDs",
      async () => {
        await batchSelectPlanImportCandidates({
          projectId: project.id,
          importId: planImport.id,
          candidateIds: [c0.id, foreignCandidate.id],
          selected: true,
        });
      },
      (e) =>
        e instanceof PlanImportReviewError &&
        (e.statusCode === 403 || e.statusCode === 404),
    );

    await batchSelectPlanImportCandidates({
      projectId: project.id,
      importId: planImport.id,
      candidateIds: [c0.id, c1.id],
      selected: true,
    });

    // Mark second reviewed without unresolved errors.
    await updatePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: c1.id,
      reviewerUid: OWNER_UID,
      patch: { reviewStatus: "reviewed" },
    });

    const beforeApproval = await getCandidatesForImport(planImport.id);
    const readiness = evaluatePlanImportApprovalReadiness(beforeApproval);
    assert(readiness.ready, "ready when selected are reviewed + valid");

    const approved = await markPlanImportReadyForApproval({
      projectId: project.id,
      importId: planImport.id,
    });
    assertEq(
      "status ready_for_approval",
      approved.import.status,
      "ready_for_approval",
    );
    // Phase 2P.4 stops at ready_for_approval (no "approved" status exists yet).
    assert(
      approved.import.status === "ready_for_approval",
      "does not reach approved",
    );
    console.log("PASS ready-for-approval succeeds");

    // Reset one candidate to block transition from a fresh ready_for_review.
    const blockingImport: PlanImport = {
      ...planImport,
      status: "ready_for_review",
      updatedAt: new Date().toISOString(),
    };
    await setPlanImport(blockingImport);
    await updatePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: c1.id,
      reviewerUid: OWNER_UID,
      patch: { reviewStatus: "unreviewed" },
    });

    await assertThrowsAsync(
      "ready-for-approval rejects unresolved selected candidates",
      async () => {
        await markPlanImportReadyForApproval({
          projectId: project.id,
          importId: planImport.id,
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 409,
    );

    const after = await getPlanImportById(planImport.id);
    assertEq(
      "status remains ready_for_review after reject",
      after?.status,
      "ready_for_review",
    );

    // Confirm no PlanItems were written for this import project.
    const planItems = await db
      .collection(COLLECTIONS.planItems)
      .where("projectId", "==", project.id)
      .get();
    assert(planItems.empty, "NO PlanItems are created");
    console.log("PASS NO PlanItems are created");

    await db.collection(COLLECTIONS.planImportCandidates).doc(foreignCandidate.id).delete();
  } finally {
    await cleanup(project.id, planImport.id);
  }
}

async function testLiveCandidateDeleteFlow(): Promise<void> {
  console.log("\n--- Live Firestore candidate delete ---");

  const project = await seedProject();
  const planImport = makeImport(project.id, "ready_for_review");
  await setPlanImport(planImport);

  const keep = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 0,
    overrides: {
      label: "Keep me",
      plannedValue: 10,
      unit: "EA",
      originalLabel: "Keep me",
      originalPlannedValue: 10,
      originalUnit: "EA",
    },
  });
  const remove = makeCandidate({
    importId: planImport.id,
    projectId: project.id,
    index: 1,
    overrides: {
      label: "Remove me",
      plannedValue: 2,
      unit: "EA",
      originalLabel: "Remove me",
      originalPlannedValue: 2,
      originalUnit: "EA",
    },
  });
  const foreignCandidate = makeCandidate({
    importId: `${planImport.id}_other`,
    projectId: project.id,
    index: 0,
    overrides: {
      label: "Foreign",
      originalLabel: "Foreign",
    },
  });

  await setCandidate(keep);
  await setCandidate(remove);
  await setCandidate(foreignCandidate);

  try {
    await assertThrowsAsync(
      "unauthorized project denied for delete",
      async () => {
        await assertProjectOwnedByUser(project.id, FOREIGN_UID);
      },
      (e) => e instanceof ProjectAccessError,
    );

    await assertThrowsAsync(
      "candidate from another import cannot be deleted",
      async () => {
        await deletePlanImportCandidate({
          projectId: project.id,
          importId: planImport.id,
          candidateId: foreignCandidate.id,
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 404,
    );

    await assertThrowsAsync(
      "unknown candidate returns not found",
      async () => {
        await deletePlanImportCandidate({
          projectId: project.id,
          importId: planImport.id,
          candidateId: `${planImport.id}_c_missing`,
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 404,
    );

    await assertThrowsAsync(
      "unknown import returns not found",
      async () => {
        await deletePlanImportCandidate({
          projectId: project.id,
          importId: `${planImport.id}_missing`,
          candidateId: remove.id,
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 404,
    );

    await deletePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: remove.id,
    });

    const remaining = await getCandidatesForImport(planImport.id);
    assertEq("only requested candidate deleted", remaining.length, 1);
    assertEq("kept candidate remains", remaining[0]?.id, keep.id);
    assertEq(
      "deleted candidate no longer gettable",
      await getCandidateById(remove.id),
      undefined,
    );
    assertEq(
      "deleteCandidateById reports absent",
      await deleteCandidateById(remove.id),
      false,
    );

    const importAfterDelete = await getPlanImportById(planImport.id);
    assertEq(
      "import remains after candidate delete",
      importAfterDelete?.id,
      planImport.id,
    );
    assertEq(
      "foreign candidate unaffected",
      (await getCandidateById(foreignCandidate.id))?.id,
      foreignCandidate.id,
    );
    console.log("PASS single candidate deleted; others remain");

    // PATCH still works on remaining candidate.
    const patched = await updatePlanImportCandidate({
      projectId: project.id,
      importId: planImport.id,
      candidateId: keep.id,
      reviewerUid: OWNER_UID,
      patch: { label: "Keep me (edited)" },
    });
    assertEq("patch still works after delete", patched.label, "Keep me (edited)");
    console.log("PASS candidate PATCH still works");

    // Approved / finalized import rejects deletion.
    const approvedImport: PlanImport = {
      ...planImport,
      status: "approved",
      updatedAt: new Date().toISOString(),
    };
    await setPlanImport(approvedImport);
    await assertThrowsAsync(
      "approved import rejects candidate deletion",
      async () => {
        await deletePlanImportCandidate({
          projectId: project.id,
          importId: planImport.id,
          candidateId: keep.id,
        });
      },
      (e) => e instanceof PlanImportReviewError && e.statusCode === 409,
    );
    assertEq(
      "approved import still has remaining candidate",
      (await getCandidateById(keep.id))?.id,
      keep.id,
    );
    console.log("PASS approved import rejects deletion");

    // Confirm no PlanItems were written by delete.
    const planItems = await db
      .collection(COLLECTIONS.planItems)
      .where("projectId", "==", project.id)
      .get();
    assert(planItems.empty, "NO PlanItems are created by candidate delete");
    console.log("PASS NO PlanItems affected");
  } finally {
    await db
      .collection(COLLECTIONS.planImportCandidates)
      .doc(foreignCandidate.id)
      .delete();
    await cleanup(project.id, planImport.id);
  }
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  console.log("Phase 2P.4 Plan Import review tests\n");

  testPatchValidation();
  testNeedsAttentionRules();
  testReadinessRules();
  testOriginalPreservedOnBuild();
  await testLiveReviewFlow();
  await testLiveCandidateDeleteFlow();

  console.log("\nPhase 2P.4 review tests complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
