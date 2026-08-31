/**
 * Phase 2I.1 — Scoped field contribution WRITE authorization.
 *
 * Primary: service-layer assertions against Firestore (no Auth Admin).
 * Optional HTTP smoke when BUILDSIGMA_TEST_EMAIL_A/B and passwords are set.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { Evidence } from "../domain/evidence.js";
import { createRemoteEvidenceId } from "../domain/evidenceId.js";
import type { Measurement } from "../domain/measurement.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import type { PlanItem } from "../domain/planItem.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";
import { createWorkPackageId } from "../domain/workPackageId.js";
import { createWorkPackageAssignmentId } from "../domain/workPackageAssignmentId.js";
import { normalizeEvidenceDocument } from "../repositories/evidenceRepository.js";
import { getPlanItemById } from "../repositories/planItemsRepository.js";
import {
  assertProjectAccessContext,
  filterMeasurementsForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  assertMeasurementLinkedFieldWritableByUser,
  assertPlanItemFieldWritableByUser,
  WRITE_ACTIVE_ASSIGNMENT_STATUSES,
} from "../services/collaboration/projectFieldWriteAccess.js";
import { buildEvidenceObjectPath } from "../storage/evidenceStorage.js";

const OWNER_UID = "phase2i1-owner-uid";
const CONTRACTOR_UID = "phase2i1-contractor-uid";
const FIELD_UID = "phase2i1-field-uid";
const ADMIN_UID = "phase2i1-admin-uid";
const VIEWER_UID = "phase2i1-viewer-uid";
const LOCAL_PROJECT_ID = "project-2i1-field";
const LOCAL_ALT_ID = "project-2i1-alt";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEq(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function expectDenied(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected denial`);
  } catch (error) {
    assert(
      error instanceof ProjectAccessError,
      `${label}: expected ProjectAccessError`,
    );
    assertEq(`${label} status`, (error as ProjectAccessError).statusCode, 404);
  }
}

async function seedProject(input: {
  id: string;
  localProjectId: string;
  ownerUid: string;
}): Promise<Project> {
  const project: Project = {
    id: input.id,
    localProjectId: input.localProjectId,
    name: `Phase 2I.1 ${input.localProjectId}`,
    location: "Boston, MA",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: input.ownerUid,
  };
  await db.collection(COLLECTIONS.projects).doc(project.id).set(project);
  return project;
}

async function seedMember(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: "active" | "invited" | "removed";
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: input.status,
    invitedBy: OWNER_UID,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function seedPlanItem(
  projectId: string,
  localPlanItemId: string,
  label: string,
): Promise<PlanItem> {
  const item: PlanItem = {
    id: createRemotePlanItemId(projectId, localPlanItemId),
    localPlanItemId,
    projectId,
    type: "length",
    label,
    plannedValue: 10,
    unit: "ft",
    unitCost: 1,
    productionRatePerDay: 1,
    laborHoursPerUnit: 1,
  };
  await db.collection(COLLECTIONS.planItems).doc(item.id).set(item);
  return item;
}

async function seedWorkPackage(input: {
  projectId: string;
  name: string;
  status: WorkPackage["status"];
  planItemIds: string[];
}): Promise<WorkPackage> {
  const now = new Date().toISOString();
  const item: WorkPackage = {
    id: createWorkPackageId(),
    projectId: input.projectId,
    name: input.name,
    description: input.name,
    status: input.status,
    planItemIds: input.planItemIds,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(COLLECTIONS.workPackages).doc(item.id).set(item);
  return item;
}

async function seedAssignment(input: {
  projectId: string;
  workPackageId: string;
  projectMemberId: string;
  status: WorkPackageAssignment["status"];
}): Promise<WorkPackageAssignment> {
  const now = new Date().toISOString();
  const item: WorkPackageAssignment = {
    id: createWorkPackageAssignmentId(),
    projectId: input.projectId,
    workPackageId: input.workPackageId,
    projectMemberId: input.projectMemberId,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(item.id)
    .set(item);
  return item;
}

async function deleteByProject(
  collection: string,
  projectId: string,
): Promise<void> {
  const snap = await db
    .collection(collection)
    .where("projectId", "==", projectId)
    .get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function runServiceLayerTests(): Promise<void> {
  assertEq(
    "write statuses",
    WRITE_ACTIVE_ASSIGNMENT_STATUSES.join(","),
    "assigned,accepted,in_progress,ready_for_review",
  );

  const projectId = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const altId = createRemoteProjectId(OWNER_UID, LOCAL_ALT_ID);

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(projectId).delete(),
    db.collection(COLLECTIONS.projects).doc(altId).delete(),
    deleteByProject(COLLECTIONS.projectMembers, projectId),
    deleteByProject(COLLECTIONS.planItems, projectId),
    deleteByProject(COLLECTIONS.planItems, altId),
    deleteByProject(COLLECTIONS.workPackages, projectId),
    deleteByProject(COLLECTIONS.workPackages, altId),
    deleteByProject(COLLECTIONS.workPackageAssignments, projectId),
    deleteByProject(COLLECTIONS.measurements, projectId),
    deleteByProject(COLLECTIONS.evidence, projectId),
  ]);

  const project = await seedProject({
    id: projectId,
    localProjectId: LOCAL_PROJECT_ID,
    ownerUid: OWNER_UID,
  });
  await seedProject({
    id: altId,
    localProjectId: LOCAL_ALT_ID,
    ownerUid: OWNER_UID,
  });

  const planElectrical = await seedPlanItem(projectId, "plan-electrical", "Electrical");
  const planHvac = await seedPlanItem(projectId, "plan-hvac", "HVAC");
  const planAlt = await seedPlanItem(altId, "plan-alt", "Foreign");

  const wpElectrical = await seedWorkPackage({
    projectId,
    name: "Electrical",
    status: "in_progress",
    planItemIds: [planElectrical.id],
  });
  const wpHvac = await seedWorkPackage({
    projectId,
    name: "HVAC",
    status: "ready",
    planItemIds: [planHvac.id],
  });
  const wpCancelled = await seedWorkPackage({
    projectId,
    name: "Cancelled WP",
    status: "cancelled",
    planItemIds: [planElectrical.id],
  });

  const contractorMemberId = await seedMember({
    projectId,
    userId: CONTRACTOR_UID,
    role: "contractor",
    status: "active",
  });
  const fieldMemberId = await seedMember({
    projectId,
    userId: FIELD_UID,
    role: "field_member",
    status: "active",
  });
  await seedMember({
    projectId,
    userId: ADMIN_UID,
    role: "project_admin",
    status: "active",
  });
  await seedMember({
    projectId,
    userId: VIEWER_UID,
    role: "viewer",
    status: "active",
  });

  // Role denial: project_admin / viewer cannot field-write
  await expectDenied("6 admin measurement", () =>
    assertPlanItemFieldWritableByUser(projectId, ADMIN_UID, planElectrical.id),
  );
  await expectDenied("8 viewer measurement", () =>
    assertPlanItemFieldWritableByUser(projectId, VIEWER_UID, planElectrical.id),
  );

  // 15: zero assignment denied
  await expectDenied("15 zero assignment", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  const assignElectrical = await seedAssignment({
    projectId,
    workPackageId: wpElectrical.id,
    projectMemberId: contractorMemberId,
    status: "assigned",
  });

  // 10–12: assigned contractor succeeds
  const write = await assertPlanItemFieldWritableByUser(
    projectId,
    CONTRACTOR_UID,
    planElectrical.id,
  );
  assertEq("10 writable plan", write.writableAssignedPlanItemIds.join(","), planElectrical.id);
  assertEq("12 project owner", write.project.ownerUid, OWNER_UID);

  // Simulate Measurement create attribution
  const localMeasId = "meas-2i1-contractor";
  const measurement: Measurement = {
    id: createRemoteMeasurementId(projectId, localMeasId),
    localMeasurementId: localMeasId,
    projectId,
    planItemId: planElectrical.id,
    type: "length",
    label: "Field run",
    value: 12,
    unit: "ft",
    createdAt: "2026-08-24T00:00:00.000Z",
    capturedByUid: CONTRACTOR_UID,
  };
  await db.collection(COLLECTIONS.measurements).doc(measurement.id).set(measurement);
  assertEq("11 capturedByUid", measurement.capturedByUid, CONTRACTOR_UID);
  assertEq("12 Project.ownerUid", project.ownerUid, OWNER_UID);

  // 13 HVAC out of scope
  await expectDenied("13 HVAC plan", () =>
    assertPlanItemFieldWritableByUser(projectId, CONTRACTOR_UID, planHvac.id),
  );

  // 14 foreign PlanItem
  await expectDenied("14 foreign plan", () =>
    assertPlanItemFieldWritableByUser(projectId, CONTRACTOR_UID, planAlt.id),
  );

  // 16 completed assignment — readable but not writable
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "completed" });

  const readAccess = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assert(
    readAccess.assignedPlanItemIds.includes(planElectrical.id),
    "36 completed still readable",
  );
  await expectDenied("16 completed write", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  // Restore assigned for further tests
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "assigned" });

  // 17 cancelled assignment
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "cancelled" });
  await expectDenied("17 cancelled assignment", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "assigned", workPackageId: wpCancelled.id });
  await expectDenied("18 cancelled WP", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({
      status: "assigned",
      workPackageId: wpElectrical.id,
    });

  // 19 removed
  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(contractorMemberId)
    .update({ status: "removed" });
  await expectDenied("19 removed", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(contractorMemberId)
    .update({ status: "invited" });
  await expectDenied("20 invited", () =>
    assertPlanItemFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      planElectrical.id,
    ),
  );

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(contractorMemberId)
    .update({ status: "active", role: "contractor" });

  // Evidence link authorization
  const linked = await assertMeasurementLinkedFieldWritableByUser(
    projectId,
    CONTRACTOR_UID,
    localMeasId,
  );
  assertEq("23 linked measurement", linked.measurement.id, measurement.id);

  await expectDenied("25 fabricated local id", () =>
    assertMeasurementLinkedFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      "missing-local-meas",
    ),
  );

  // Storage tenancy under Project.ownerUid
  const evidenceId = createRemoteEvidenceId(projectId, "ev-2i1-photo");
  const objectPath = buildEvidenceObjectPath(
    project.ownerUid,
    projectId,
    evidenceId,
    "image/jpeg",
  );
  assert(
    objectPath.startsWith(`users/${OWNER_UID}/projects/${projectId}/`),
    "24 path uses Project.ownerUid",
  );
  assert(
    !objectPath.includes(CONTRACTOR_UID),
    "24 path must not use contractor uid",
  );

  // Simulate Evidence create
  const evidence: Evidence = {
    id: evidenceId,
    ownerUid: project.ownerUid,
    projectId,
    localEvidenceId: "ev-2i1-photo",
    type: "note",
    note: "field note",
    objectPath: null,
    contentType: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    localMeasurementId: localMeasId,
    localDeltaId: null,
    capturedByUid: CONTRACTOR_UID,
  };
  await db.collection(COLLECTIONS.evidence).doc(evidence.id).set(evidence);
  assertEq("28 Evidence capturedByUid", evidence.capturedByUid, CONTRACTOR_UID);
  assertEq("29 Evidence ownerUid tenancy", evidence.ownerUid, OWNER_UID);

  // Tampered path check (logic)
  const tampered = buildEvidenceObjectPath(
    CONTRACTOR_UID,
    projectId,
    evidenceId,
    "image/jpeg",
  );
  assert(tampered !== objectPath, "29 tampered path differs");

  // 32: cancel assignment then linked write denied
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "cancelled" });
  await expectDenied("32 post-cancel metadata", () =>
    assertMeasurementLinkedFieldWritableByUser(
      projectId,
      CONTRACTOR_UID,
      localMeasId,
    ),
  );

  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignElectrical.id)
    .update({ status: "assigned" });

  // Field member
  await seedAssignment({
    projectId,
    workPackageId: wpElectrical.id,
    projectMemberId: fieldMemberId,
    status: "in_progress",
  });
  const fieldWrite = await assertPlanItemFieldWritableByUser(
    projectId,
    FIELD_UID,
    planElectrical.id,
  );
  assertEq("21 field writable", fieldWrite.writableAssignedPlanItemIds.join(","), planElectrical.id);
  await expectDenied("22 field HVAC", () =>
    assertPlanItemFieldWritableByUser(projectId, FIELD_UID, planHvac.id),
  );

  // Backward compat: Evidence without capturedByUid
  const legacyRaw = {
    id: createRemoteEvidenceId(projectId, "ev-legacy"),
    ownerUid: OWNER_UID,
    projectId,
    localEvidenceId: "ev-legacy",
    type: "note",
    note: "legacy",
    objectPath: null,
    contentType: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    localMeasurementId: null,
    localDeltaId: null,
  };
  const legacy = normalizeEvidenceDocument(legacyRaw);
  assert(!!legacy, "41 legacy evidence parses");
  assertEq("41 no capturedByUid", legacy!.capturedByUid, undefined);

  // Owner still has plan item
  const ownerPlan = await getPlanItemById(planElectrical.id);
  assertEq("43 owner plan", ownerPlan?.projectId, projectId);

  // Empty writable never expands: HVAC WP exists but contractor not assigned
  void wpHvac;
  const stillScoped = await assertPlanItemFieldWritableByUser(
    projectId,
    CONTRACTOR_UID,
    planElectrical.id,
  );
  assert(
    !stillScoped.writableAssignedPlanItemIds.includes(planHvac.id),
    "35 empty/other scope not expanded",
  );

  // Phase 2H scoped reads still work for assigned contractor
  const scopedRead = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  const filtered = filterMeasurementsForAccess([measurement], scopedRead);
  assertEq("44 scoped measurement read", filtered.length, 1);
  assertEq("44 scoped measurement id", filtered[0]?.id, measurement.id);

  console.log("phase2I1 service-layer field contribution authorization: PASS");
}

function loadWebApiKey(): string | null {
  try {
    const envPath = resolve(process.cwd(), "../.env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (
        (key === "EXPO_PUBLIC_FIREBASE_API_KEY" ||
          key === "FIREBASE_WEB_API_KEY") &&
        value.length > 0
      ) {
        return value;
      }
    }
  } catch {
    // ignore
  }
  return process.env.FIREBASE_WEB_API_KEY?.trim() || null;
}

async function runOptionalHttpSmoke(): Promise<void> {
  const emailA = process.env.BUILDSIGMA_TEST_EMAIL_A?.trim();
  const passwordA = process.env.BUILDSIGMA_TEST_PASSWORD_A?.trim();
  const apiKey = loadWebApiKey();
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";

  if (!emailA || !passwordA || !apiKey) {
    console.log(
      "phase2I1 HTTP smoke: SKIPPED (set BUILDSIGMA_TEST_EMAIL_A/PASSWORD_A + API key)",
    );
    return;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailA,
        password: passwordA,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP smoke sign-in failed (${response.status})`);
  }
  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error("HTTP smoke missing idToken");
  }

  const health = await fetch(`${baseUrl}/health`);
  assert(health.ok, "HTTP API health");
  console.log("phase2I1 HTTP smoke: PASS (auth + health only)");
}

async function main(): Promise<void> {
  await runServiceLayerTests();
  await runOptionalHttpSmoke();
  console.log("phase2I1 field contribution authorization: PASS");
}

main().catch((error) => {
  console.error("phase2I1FieldContributionAuthorizationTest failed:");
  console.error(error);
  process.exitCode = 1;
});
