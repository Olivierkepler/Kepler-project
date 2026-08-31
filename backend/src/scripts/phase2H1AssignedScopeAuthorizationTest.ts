/**
 * Phase 2H.1 — Assignment-aware scoped READ authorization.
 *
 * Primary: service-layer assertions against Firestore (no Auth Admin).
 * Optional HTTP: when BUILDSIGMA_TEST_EMAIL_A/B and PASSWORD_A/B plus API key are set.
 *
 * Auth Admin getUserByEmail / updateUser is intentionally unused — local ADC
 * often lacks Auth Admin permissions.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { Delta } from "../domain/delta.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
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
import {
  assertProjectAccessContext,
  canReadAssignment,
  canReadWorkPackageId,
  filterAssignmentsForAccess,
  filterDeltasForAccess,
  filterEvidenceForAccess,
  filterMeasurementsForAccess,
  filterPlanItemsForAccess,
  filterWorkPackagesForAccess,
} from "../services/collaboration/projectAccessScope.js";
import { ProjectAccessError } from "../auth/projectAccess.js";

const OWNER_UID = "phase2h1-owner-uid";
const CONTRACTOR_UID = "phase2h1-contractor-uid";
const FIELD_UID = "phase2h1-field-uid";
const ADMIN_UID = "phase2h1-admin-uid";
const VIEWER_UID = "phase2h1-viewer-uid";
const TEAMMATE_UID = "phase2h1-teammate-uid";
const STRANGER_UID = "phase2h1-stranger-uid";
const LOCAL_PROJECT_ID = "project-2h1-scope";
const LOCAL_LEGACY_ID = "project-2h1-legacy";
const LOCAL_ALT_ID = "project-2h1-alt";

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

function ids(items: readonly { id: string }[]): string[] {
  return items.map((i) => i.id).sort();
}

async function seedProject(input: {
  id: string;
  localProjectId: string;
  ownerUid: string;
  progress?: number;
  openDeltas?: number;
  assignedTasks?: number;
}): Promise<Project> {
  const project: Project = {
    id: input.id,
    localProjectId: input.localProjectId,
    name: `Phase 2H.1 ${input.localProjectId}`,
    location: "Boston, MA",
    status: "active",
    progress: input.progress ?? 12,
    openDeltas: input.openDeltas ?? 3,
    assignedTasks: input.assignedTasks ?? 5,
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

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(id)
    .set({
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

async function seedMeasurement(
  projectId: string,
  localMeasurementId: string,
  planItemId: string,
): Promise<Measurement> {
  const item: Measurement = {
    id: createRemoteMeasurementId(projectId, localMeasurementId),
    localMeasurementId,
    projectId,
    planItemId,
    type: "length",
    label: localMeasurementId,
    value: 9,
    unit: "ft",
    createdAt: "2026-08-24T00:00:00.000Z",
  };
  await db.collection(COLLECTIONS.measurements).doc(item.id).set(item);
  return item;
}

async function seedDelta(
  projectId: string,
  localDeltaId: string,
  planItemId: string,
  measurementId: string,
): Promise<Delta> {
  const item: Delta = {
    id: createRemoteDeltaId(projectId, localDeltaId),
    localDeltaId,
    projectId,
    planItemId,
    measurementId,
    type: "length",
    plannedValue: 10,
    actualValue: 9,
    difference: -1,
    percentDifference: -10,
    unit: "ft",
    unitCost: 1,
    costImpact: -1,
    productionRatePerDay: 1,
    scheduleImpactDays: 0,
    laborHoursPerUnit: 1,
    laborImpactHours: -1,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt: "2026-08-24T00:00:00.000Z",
  };
  await db.collection(COLLECTIONS.deltas).doc(item.id).set(item);
  return item;
}

async function seedEvidence(input: {
  projectId: string;
  localEvidenceId: string;
  localMeasurementId: string | null;
  localDeltaId: string | null;
}): Promise<Evidence> {
  const item: Evidence = {
    id: createRemoteEvidenceId(input.projectId, input.localEvidenceId),
    ownerUid: OWNER_UID,
    projectId: input.projectId,
    localEvidenceId: input.localEvidenceId,
    type: "note",
    note: input.localEvidenceId,
    objectPath: null,
    contentType: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    localMeasurementId: input.localMeasurementId,
    localDeltaId: input.localDeltaId,
  };
  await db.collection(COLLECTIONS.evidence).doc(item.id).set(item);
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

async function deleteByProject(collection: string, projectId: string): Promise<void> {
  const snap = await db.collection(collection).where("projectId", "==", projectId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function expectAccessDenied(projectId: string, uid: string): Promise<void> {
  try {
    await assertProjectAccessContext(projectId, uid);
    throw new Error(`Expected denial for ${uid}`);
  } catch (error) {
    assert(error instanceof ProjectAccessError, "Expected ProjectAccessError");
    assertEq("deny status", (error as ProjectAccessError).statusCode, 404);
  }
}

async function runServiceLayerTests(): Promise<void> {
  const projectId = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const legacyId = createRemoteProjectId(OWNER_UID, LOCAL_LEGACY_ID);
  const altId = createRemoteProjectId(OWNER_UID, LOCAL_ALT_ID);

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(projectId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyId).delete(),
    db.collection(COLLECTIONS.projects).doc(altId).delete(),
    deleteByProject(COLLECTIONS.projectMembers, projectId),
    deleteByProject(COLLECTIONS.projectMembers, legacyId),
    deleteByProject(COLLECTIONS.projectMembers, altId),
    deleteByProject(COLLECTIONS.planItems, projectId),
    deleteByProject(COLLECTIONS.measurements, projectId),
    deleteByProject(COLLECTIONS.deltas, projectId),
    deleteByProject(COLLECTIONS.evidence, projectId),
    deleteByProject(COLLECTIONS.workPackages, projectId),
    deleteByProject(COLLECTIONS.workPackages, altId),
    deleteByProject(COLLECTIONS.workPackageAssignments, projectId),
    deleteByProject(COLLECTIONS.workPackageAssignments, altId),
  ]);

  const project = await seedProject({
    id: projectId,
    localProjectId: LOCAL_PROJECT_ID,
    ownerUid: OWNER_UID,
  });
  await seedProject({
    id: legacyId,
    localProjectId: LOCAL_LEGACY_ID,
    ownerUid: OWNER_UID,
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
  });
  await seedProject({
    id: altId,
    localProjectId: LOCAL_ALT_ID,
    ownerUid: OWNER_UID,
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
  });

  const planA = await seedPlanItem(projectId, "plan-a", "Plan A");
  const planB = await seedPlanItem(projectId, "plan-b", "Plan B");
  const planC = await seedPlanItem(projectId, "plan-c", "Plan C");

  const measA = await seedMeasurement(projectId, "meas-a", planA.id);
  const measB = await seedMeasurement(projectId, "meas-b", planB.id);

  const deltaA = await seedDelta(projectId, "delta-a", planA.id, measA.id);
  const deltaB = await seedDelta(projectId, "delta-b", planB.id, measB.id);

  const evMeas = await seedEvidence({
    projectId,
    localEvidenceId: "ev-meas",
    localMeasurementId: measA.localMeasurementId,
    localDeltaId: null,
  });
  const evDelta = await seedEvidence({
    projectId,
    localEvidenceId: "ev-delta",
    localMeasurementId: null,
    localDeltaId: deltaA.localDeltaId,
  });
  const evUnlinked = await seedEvidence({
    projectId,
    localEvidenceId: "ev-unlinked",
    localMeasurementId: null,
    localDeltaId: null,
  });
  const evBadMeas = await seedEvidence({
    projectId,
    localEvidenceId: "ev-bad-meas",
    localMeasurementId: "missing-meas",
    localDeltaId: null,
  });
  const evBadDelta = await seedEvidence({
    projectId,
    localEvidenceId: "ev-bad-delta",
    localMeasurementId: null,
    localDeltaId: "missing-delta",
  });
  const evMeasB = await seedEvidence({
    projectId,
    localEvidenceId: "ev-meas-b",
    localMeasurementId: measB.localMeasurementId,
    localDeltaId: null,
  });

  const allPlans = [planA, planB, planC];
  const allMeas = [measA, measB];
  const allDeltas = [deltaA, deltaB];
  const allEvidence = [
    evMeas,
    evDelta,
    evUnlinked,
    evBadMeas,
    evBadDelta,
    evMeasB,
  ];

  const wpA = await seedWorkPackage({
    projectId,
    name: "WP A",
    status: "in_progress",
    planItemIds: [planA.id],
  });
  const wpB = await seedWorkPackage({
    projectId,
    name: "WP B",
    status: "ready",
    planItemIds: [planB.id],
  });
  const wpEmpty = await seedWorkPackage({
    projectId,
    name: "WP Empty",
    status: "draft",
    planItemIds: [],
  });
  const wpBlocked = await seedWorkPackage({
    projectId,
    name: "WP Blocked",
    status: "blocked",
    planItemIds: [planC.id],
  });
  const wpCompleted = await seedWorkPackage({
    projectId,
    name: "WP Completed",
    status: "completed",
    planItemIds: [planC.id],
  });
  const wpCancelled = await seedWorkPackage({
    projectId,
    name: "WP Cancelled",
    status: "cancelled",
    planItemIds: [planA.id],
  });
  const altWp = await seedWorkPackage({
    projectId: altId,
    name: "Foreign WP",
    status: "ready",
    planItemIds: [],
  });

  const allWps = [wpA, wpB, wpEmpty, wpBlocked, wpCompleted, wpCancelled];

  const ownerMemberId = await seedMember({
    projectId,
    userId: OWNER_UID,
    role: "owner",
    status: "active",
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
  const adminMemberId = await seedMember({
    projectId,
    userId: ADMIN_UID,
    role: "project_admin",
    status: "active",
  });
  const viewerMemberId = await seedMember({
    projectId,
    userId: VIEWER_UID,
    role: "viewer",
    status: "active",
  });
  const teammateMemberId = await seedMember({
    projectId,
    userId: TEAMMATE_UID,
    role: "field_member",
    status: "active",
  });
  void ownerMemberId;
  void adminMemberId;
  void viewerMemberId;

  // 1: Legacy owner without ProjectMember → full
  const legacyAccess = await assertProjectAccessContext(legacyId, OWNER_UID);
  assertEq("1 legacy role", legacyAccess.role, "legacy_owner");
  assertEq("1 legacy mode", legacyAccess.accessMode, "full");

  // 2: Owner with membership → full
  const ownerAccess = await assertProjectAccessContext(projectId, OWNER_UID);
  assertEq("2 owner role", ownerAccess.role, "owner");
  assertEq("2 owner mode", ownerAccess.accessMode, "full");
  assertEq(
    "2 owner plans full",
    filterPlanItemsForAccess(allPlans, ownerAccess).length,
    3,
  );

  // 3: project_admin → full
  const adminAccess = await assertProjectAccessContext(projectId, ADMIN_UID);
  assertEq("3 admin mode", adminAccess.accessMode, "full");
  assertEq(
    "3 admin plans",
    filterPlanItemsForAccess(allPlans, adminAccess).length,
    3,
  );

  // 4–5: viewer → full operational, assignments []
  const viewerAccess = await assertProjectAccessContext(projectId, VIEWER_UID);
  assertEq("4 viewer mode", viewerAccess.accessMode, "full");
  assertEq(
    "4 viewer plans",
    filterPlanItemsForAccess(allPlans, viewerAccess).length,
    3,
  );
  assertEq(
    "4 viewer meas",
    filterMeasurementsForAccess(allMeas, viewerAccess).length,
    2,
  );
  assertEq(
    "4 viewer deltas",
    filterDeltasForAccess(allDeltas, viewerAccess).length,
    2,
  );
  assertEq(
    "4 viewer evidence",
    filterEvidenceForAccess(allEvidence, allMeas, allDeltas, viewerAccess)
      .length,
    6,
  );
  assertEq(
    "4 viewer WPs",
    filterWorkPackagesForAccess(allWps, viewerAccess).length,
    6,
  );
  assertEq(
    "5 viewer assignments",
    filterAssignmentsForAccess([], viewerAccess).length,
    0,
  );

  // 17: contractor zero assignments → empty scope, still readable
  let contractorAccess = await assertProjectAccessContext(
    projectId,
    CONTRACTOR_UID,
  );
  assertEq("17 mode", contractorAccess.accessMode, "assigned_scope");
  assertEq("17 WP ids", contractorAccess.assignedWorkPackageIds.length, 0);
  assertEq("17 plan ids", contractorAccess.assignedPlanItemIds.length, 0);
  assertEq(
    "17 plans",
    filterPlanItemsForAccess(allPlans, contractorAccess).length,
    0,
  );
  assertEq(
    "17 meas",
    filterMeasurementsForAccess(allMeas, contractorAccess).length,
    0,
  );
  assertEq(
    "17 deltas",
    filterDeltasForAccess(allDeltas, contractorAccess).length,
    0,
  );
  assertEq(
    "17 evidence",
    filterEvidenceForAccess(allEvidence, allMeas, allDeltas, contractorAccess)
      .length,
    0,
  );
  assertEq(
    "17 WPs",
    filterWorkPackagesForAccess(allWps, contractorAccess).length,
    0,
  );
  assertEq("45 empty ≠ full", contractorAccess.accessMode, "assigned_scope");
  assertEq("48 metadata progress", project.progress, 12);

  const assignA = await seedAssignment({
    projectId,
    workPackageId: wpA.id,
    projectMemberId: contractorMemberId,
    status: "assigned",
  });
  const assignTeammate = await seedAssignment({
    projectId,
    workPackageId: wpA.id,
    projectMemberId: teammateMemberId,
    status: "accepted",
  });
  const assignOnB = await seedAssignment({
    projectId,
    workPackageId: wpB.id,
    projectMemberId: teammateMemberId,
    status: "assigned",
  });
  const allAssignments = [assignA, assignTeammate, assignOnB];

  assertEq(
    "5 viewer assignments with data",
    filterAssignmentsForAccess(allAssignments, viewerAccess).length,
    0,
  );

  contractorAccess = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("6 WP scope", contractorAccess.assignedWorkPackageIds.join(","), wpA.id);
  assertEq(
    "7 plan scope",
    contractorAccess.assignedPlanItemIds.join(","),
    planA.id,
  );
  assertEq(
    "6 filtered WPs",
    ids(filterWorkPackagesForAccess(allWps, contractorAccess)).join(","),
    wpA.id,
  );
  assertEq(
    "7 filtered plans",
    ids(filterPlanItemsForAccess(allPlans, contractorAccess)).join(","),
    planA.id,
  );
  assertEq(
    "8 filtered meas",
    filterMeasurementsForAccess(allMeas, contractorAccess)
      .map((m) => m.localMeasurementId)
      .join(","),
    "meas-a",
  );
  assertEq(
    "9 filtered deltas",
    filterDeltasForAccess(allDeltas, contractorAccess)
      .map((d) => d.localDeltaId)
      .join(","),
    "delta-a",
  );

  const scopedEvidence = filterEvidenceForAccess(
    allEvidence,
    allMeas,
    allDeltas,
    contractorAccess,
  );
  const scopedEvIds = ids(scopedEvidence);
  assert(scopedEvIds.includes(evMeas.id), "10 measurement-linked evidence");
  assert(scopedEvIds.includes(evDelta.id), "11 delta-linked evidence");
  assert(!scopedEvIds.includes(evUnlinked.id), "12 unlinked excluded");
  assert(!scopedEvIds.includes(evBadMeas.id), "13 unresolved meas excluded");
  assert(!scopedEvIds.includes(evBadDelta.id), "13 unresolved delta excluded");
  assert(!scopedEvIds.includes(evMeasB.id), "out-of-scope meas evidence excluded");

  const scopedAssign = filterAssignmentsForAccess(
    allAssignments,
    contractorAccess,
  );
  assertEq(
    "14 assignments on WP A",
    ids(scopedAssign).join("|"),
    [assignA.id, assignTeammate.id].sort().join("|"),
  );
  assert(
    !ids(scopedAssign).includes(assignOnB.id),
    "15 unrelated WP assignment excluded",
  );

  assert(canReadWorkPackageId(contractorAccess, wpA.id), "39 WP A readable");
  assert(!canReadWorkPackageId(contractorAccess, wpB.id), "39 WP B denied");
  assert(canReadAssignment(contractorAccess, assignA), "40 assign A readable");
  assert(!canReadAssignment(contractorAccess, assignOnB), "40 assign B denied");
  assert(!canReadAssignment(viewerAccess, assignA), "40 viewer assign denied");

  // 16 / 18 field_member
  let fieldAccess = await assertProjectAccessContext(projectId, FIELD_UID);
  assertEq("18 field zero mode", fieldAccess.accessMode, "assigned_scope");
  assertEq("18 field zero WPs", fieldAccess.assignedWorkPackageIds.length, 0);

  await seedAssignment({
    projectId,
    workPackageId: wpA.id,
    projectMemberId: fieldMemberId,
    status: "in_progress",
  });
  fieldAccess = await assertProjectAccessContext(projectId, FIELD_UID);
  assertEq("16 field WP", fieldAccess.assignedWorkPackageIds.join(","), wpA.id);
  assertEq("16 field plan", fieldAccess.assignedPlanItemIds.join(","), planA.id);

  // Status contributing (19–23)
  for (const status of [
    "assigned",
    "accepted",
    "in_progress",
    "completed",
  ] as const) {
    await db
      .collection(COLLECTIONS.workPackageAssignments)
      .doc(assignA.id)
      .update({ status });
    const access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
    assertEq(`19–22 ${status}`, access.assignedWorkPackageIds.join(","), wpA.id);
  }

  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ status: "cancelled" });
  let access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("23 cancelled assignment", access.assignedWorkPackageIds.length, 0);

  // 24 cancelled WP
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ status: "assigned", workPackageId: wpCancelled.id });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("24 cancelled WP", access.assignedWorkPackageIds.length, 0);

  // 25 completed WP
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ workPackageId: wpCompleted.id });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("25 completed WP", access.assignedWorkPackageIds.join(","), wpCompleted.id);

  // 26 blocked WP
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ workPackageId: wpBlocked.id });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("26 blocked WP", access.assignedWorkPackageIds.join(","), wpBlocked.id);

  // 27 empty planItemIds WP visible, no plans
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ workPackageId: wpEmpty.id });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("27 empty WP", access.assignedWorkPackageIds.join(","), wpEmpty.id);
  assertEq("27 empty plans", access.assignedPlanItemIds.length, 0);

  // 41 missing WP
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ workPackageId: "missing-wp-2h1" });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("41 missing WP", access.assignedWorkPackageIds.length, 0);

  // 42 foreign WP
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignA.id)
    .update({ workPackageId: altWp.id });
  access = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  assertEq("42 foreign WP", access.assignedWorkPackageIds.length, 0);

  // Security membership gate
  await seedMember({
    projectId,
    userId: STRANGER_UID,
    role: "contractor",
    status: "invited",
  });
  await expectAccessDenied(projectId, STRANGER_UID);

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(createProjectMemberId(projectId, STRANGER_UID))
    .update({ status: "removed" });
  await expectAccessDenied(projectId, STRANGER_UID);

  await expectAccessDenied(projectId, "totally-unrelated-uid");

  // Full-access roles do not resolve assignment arrays
  assertEq("admin empty WP scope arrays", adminAccess.assignedWorkPackageIds.length, 0);
  assertEq("viewer empty WP scope arrays", viewerAccess.assignedWorkPackageIds.length, 0);

  console.log("phase2H1 service-layer assigned-scope authorization: PASS");
}

function loadWebApiKey(): string | null {
  try {
    const envPath = resolve(process.cwd(), "../.env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq < 0) {
        continue;
      }
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
  const emailB = process.env.BUILDSIGMA_TEST_EMAIL_B?.trim();
  const passwordB = process.env.BUILDSIGMA_TEST_PASSWORD_B?.trim();
  const apiKey = loadWebApiKey();
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";

  if (!emailA || !passwordA || !emailB || !passwordB || !apiKey) {
    console.log(
      "phase2H1 HTTP smoke: SKIPPED (set BUILDSIGMA_TEST_EMAIL_*/PASSWORD_* + API key)",
    );
    return;
  }

  async function idToken(email: string, password: string): Promise<string> {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    if (!response.ok) {
      throw new Error(`sign-in failed (${response.status})`);
    }
    const payload = (await response.json()) as { idToken?: string };
    if (!payload.idToken) {
      throw new Error("no idToken");
    }
    return payload.idToken;
  }

  function uidFromIdToken(idTokenValue: string): string {
    const parts = idTokenValue.split(".");
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { user_id?: string; sub?: string };
    const uid = payload.user_id ?? payload.sub;
    if (!uid) {
      throw new Error("idToken missing uid");
    }
    return uid;
  }

  const tokenA = await idToken(emailA, passwordA);
  const tokenB = await idToken(emailB, passwordB);
  const uidA = uidFromIdToken(tokenA);
  const uidB = uidFromIdToken(tokenB);
  const remoteProjectId = createRemoteProjectId(uidA, "project-2h1-http");

  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();
  await deleteByProject(COLLECTIONS.projectMembers, remoteProjectId);

  const bootstrap = await fetch(`${baseUrl}/api/projects/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      localProjectId: "project-2h1-http",
      name: "Phase 2H.1 HTTP",
      location: "Boston, MA",
      status: "active",
      progress: 1,
      openDeltas: 0,
      assignedTasks: 0,
    }),
  });
  assert(
    bootstrap.status === 200 || bootstrap.status === 201,
    `HTTP bootstrap ${bootstrap.status}`,
  );

  await seedMember({
    projectId: remoteProjectId,
    userId: uidB,
    role: "contractor",
    status: "active",
  });

  const emptyList = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items`,
    { headers: { Authorization: `Bearer ${tokenB}` } },
  );
  assertEq("HTTP contractor zero plans status", emptyList.status, 200);
  const emptyBody = (await emptyList.json()) as unknown[];
  assertEq("HTTP contractor zero plans", emptyBody.length, 0);

  const writeDenied = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/work-packages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "nope",
        description: "",
        status: "draft",
        planItemIds: [],
      }),
    },
  );
  assert(writeDenied.status !== 201, "HTTP contractor write denied");

  const membersDenied = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
    { headers: { Authorization: `Bearer ${tokenB}` } },
  );
  assertEq("HTTP members owner-only", membersDenied.status, 404);

  console.log("phase2H1 HTTP smoke: PASS");
}

async function main(): Promise<void> {
  await runServiceLayerTests();
  await runOptionalHttpSmoke();
  console.log("phase2H1 assigned-scope authorization: PASS");
}

main().catch((error) => {
  console.error("phase2H1AssignedScopeAuthorizationTest failed:");
  console.error(error);
  process.exitCode = 1;
});
