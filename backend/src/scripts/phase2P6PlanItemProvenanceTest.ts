/**
 * Phase 2P.6 — PlanItem provenance & traceability tests.
 *
 * Run: npx tsx src/scripts/phase2P6PlanItemProvenanceTest.ts
 */

import { existsSync, readFileSync } from "node:fs";
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
import { createRemotePlanImportId } from "../domain/planImportId.js";
import type { PlanItem } from "../domain/planItem.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import {
  deleteCandidatesForImport,
  setCandidate,
} from "../repositories/planImportCandidatesRepository.js";
import { setPlanImport } from "../repositories/planImportsRepository.js";
import { setPlanItem } from "../repositories/planItemsRepository.js";
import { approvePlanImport } from "../services/planImportApproval.js";
import {
  getPlanItemProvenance,
  PlanItemProvenanceError,
} from "../services/planItemProvenance.js";

const OWNER_UID = "phase2p6-owner-uid";
const FOREIGN_UID = "phase2p6-foreign-uid";
const LOCAL_PROJECT_ID = "project-2p6-plan-item-provenance";

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

async function seedProject(localProjectId = LOCAL_PROJECT_ID): Promise<Project> {
  const id = createRemoteProjectId(OWNER_UID, localProjectId);
  const project: Project = {
    id,
    localProjectId,
    name: "Phase 2P.6 Plan Item Provenance",
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
  localImportId = "local-import-2p6",
): PlanImport {
  const now = new Date().toISOString();
  const importId = createRemotePlanImportId(projectId, localImportId);
  return {
    id: importId,
    projectId,
    ownerUid: OWNER_UID,
    createdByUid: OWNER_UID,
    localImportId,
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
    sourceReference: "Drawing E-201",
    sourceExcerpt: "Provide 1,250 LF of EMT conduit along corridor A.",
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

function makeManualPlanItem(projectId: string): PlanItem {
  const localPlanItemId = "plan-manual-2p6";
  return {
    id: createRemotePlanItemId(projectId, localPlanItemId),
    localPlanItemId,
    projectId,
    type: "length",
    label: "Manual trench",
    plannedValue: 100,
    unit: "ft",
    unitCost: 0,
    productionRatePerDay: 1,
    laborHoursPerUnit: 0,
  };
}

async function cleanup(
  projectId: string,
  importIds: string[],
  planItemIds: string[],
): Promise<void> {
  for (const id of planItemIds) {
    await db.collection(COLLECTIONS.planItems).doc(id).delete();
  }
  for (const importId of importIds) {
    await deleteCandidatesForImport(importId);
    await db.collection(COLLECTIONS.planImports).doc(importId).delete();
  }
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  console.log("Phase 2P.6 PlanItem provenance tests\n");

  const project = await seedProject();
  const importIds: string[] = [];
  const planItemIds: string[] = [];

  try {
    await assertProjectOwnedByUser(project.id, OWNER_UID);
    console.log("PASS owner authorized");

    await assertThrowsAsync(
      "foreign project access denied",
      async () => {
        await assertProjectOwnedByUser(project.id, FOREIGN_UID);
      },
      (error) => error instanceof ProjectAccessError,
    );

    const manual = makeManualPlanItem(project.id);
    await setPlanItem(manual);
    planItemIds.push(manual.id);

    const manualProvenance = await getPlanItemProvenance({
      projectId: project.id,
      planItemId: manual.id,
    });
    assertEq("manual origin", manualProvenance.origin, "manual");
    assertEq("manual planItemId", manualProvenance.planItemId, manual.id);
    assert(!manualProvenance.import, "manual has no import block");
    assert(!manualProvenance.candidate, "manual has no candidate block");
    console.log("PASS manual PlanItem returns manual provenance");

    await assertThrowsAsync(
      "missing plan item rejected",
      async () => {
        await getPlanItemProvenance({
          projectId: project.id,
          planItemId: "does-not-exist",
        });
      },
      (error) =>
        error instanceof PlanItemProvenanceError && error.statusCode === 404,
    );

    const planImport = makeImport(project.id, "ready_for_approval");
    importIds.push(planImport.id);
    await setPlanImport(planImport);

    const candidate = makeCandidate({
      importId: planImport.id,
      projectId: project.id,
      index: 0,
      overrides: {
        label: "Main conduit run",
        plannedValue: 1205,
        originalLabel: "Main conduit run",
        originalPlannedValue: 1250,
        selected: true,
        reviewStatus: "reviewed",
      },
    });
    await setCandidate(candidate);

    const approval = await approvePlanImport({
      projectId: project.id,
      importId: planImport.id,
      approverUid: OWNER_UID,
    });
    assertEq("approval createdCount", approval.createdCount, 1);
    const createdId = approval.createdPlanItemIds[0];
    assert(typeof createdId === "string", "created plan item id present");
    planItemIds.push(createdId);

    const provenance = await getPlanItemProvenance({
      projectId: project.id,
      planItemId: createdId,
    });

    assertEq("imported origin", provenance.origin, "plan_import");
    assertEq("import id", provenance.import?.id, planImport.id);
    assert(
      typeof provenance.import?.approvedAt === "string" &&
        provenance.import.approvedAt.length > 0,
      "approvedAt present",
    );
    assertEq("approvedByUid", provenance.import?.approvedByUid, OWNER_UID);
    assertEq("candidate id", provenance.candidate?.id, candidate.id);
    assertEq("confidence", provenance.candidate?.confidence, 0.94);
    assertEq(
      "original plannedValue preserved",
      provenance.candidate?.original.plannedValue,
      1250,
    );
    assertEq(
      "reviewed plannedValue",
      provenance.candidate?.reviewed.plannedValue,
      1205,
    );
    assertEq(
      "source fileName",
      provenance.candidate?.source.fileName,
      "Electrical-plan.pdf",
    );
    assertEq("source page", provenance.candidate?.source.page, 4);
    assertEq(
      "source reference",
      provenance.candidate?.source.reference,
      "Drawing E-201",
    );
    assert(
      (provenance.candidate?.source.excerpt ?? "").includes("EMT conduit"),
      "excerpt preserved",
    );
    assertEq(
      "reviewedByUid",
      provenance.candidate?.reviewedByUid,
      OWNER_UID,
    );
    const serialized = JSON.stringify(provenance);
    assert(!serialized.includes("storagePath"), "storagePath not exposed");
    assert(!serialized.includes("/plan-imports/"), "object path not exposed");
    console.log("PASS imported PlanItem resolves full provenance chain");

    const otherImport = makeImport(
      project.id,
      "approved",
      "local-import-2p6-other",
    );
    importIds.push(otherImport.id);
    await setPlanImport(otherImport);

    const mismatched: PlanItem = {
      id: createRemotePlanItemId(project.id, "plan-mismatch"),
      localPlanItemId: "plan-mismatch",
      projectId: project.id,
      type: "length",
      label: "Mismatch",
      plannedValue: 1,
      unit: "ft",
      unitCost: 0,
      productionRatePerDay: 1,
      laborHoursPerUnit: 0,
      origin: "plan_import",
      planImportId: otherImport.id,
      planImportCandidateId: candidate.id,
    };
    await setPlanItem(mismatched);
    planItemIds.push(mismatched.id);

    await assertThrowsAsync(
      "cross-import candidate mismatch rejected",
      async () => {
        await getPlanItemProvenance({
          projectId: project.id,
          planItemId: mismatched.id,
        });
      },
      (error) =>
        error instanceof PlanItemProvenanceError && error.statusCode === 409,
    );

    const badLinkCandidate = makeCandidate({
      importId: otherImport.id,
      projectId: project.id,
      index: 9,
      overrides: {
        sourceFileId: otherImport.files[0].id,
        createdPlanItemId: "some-other-plan-item",
        label: "Bad link",
      },
    });
    await setCandidate(badLinkCandidate);

    const badLinkItem: PlanItem = {
      id: createRemotePlanItemId(project.id, "plan-bad-link"),
      localPlanItemId: "plan-bad-link",
      projectId: project.id,
      type: "length",
      label: "Bad link",
      plannedValue: 10,
      unit: "ft",
      unitCost: 0,
      productionRatePerDay: 1,
      laborHoursPerUnit: 0,
      origin: "plan_import",
      planImportId: otherImport.id,
      planImportCandidateId: badLinkCandidate.id,
    };
    await setPlanItem(badLinkItem);
    planItemIds.push(badLinkItem.id);

    await assertThrowsAsync(
      "createdPlanItemId mismatch rejected",
      async () => {
        await getPlanItemProvenance({
          projectId: project.id,
          planItemId: badLinkItem.id,
        });
      },
      (error) =>
        error instanceof PlanItemProvenanceError && error.statusCode === 409,
    );

    const foreignProject = await seedProject("project-2p6-foreign-scope");
    await assertThrowsAsync(
      "foreign project cannot read provenance",
      async () => {
        await getPlanItemProvenance({
          projectId: foreignProject.id,
          planItemId: createdId,
        });
      },
      (error) =>
        error instanceof PlanItemProvenanceError && error.statusCode === 404,
    );
    await db.collection(COLLECTIONS.projects).doc(foreignProject.id).delete();

    console.log("\nPhase 2P.6 provenance tests complete.");
  } finally {
    await cleanup(project.id, importIds, planItemIds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
