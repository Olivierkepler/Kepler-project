/**
 * Phase 2J.1 — Backend Contribution Review & Provenance.
 *
 * Service-layer tests against Firestore (no Auth Admin dependency).
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { assertProjectOwnedByUser, ProjectAccessError } from "../auth/projectAccess.js";
import type { Measurement } from "../domain/measurement.js";
import {
  effectiveMeasurementReviewStatus,
} from "../domain/measurement.js";
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
  applyMeasurementContributionReview,
  listContributionReviewEventsForMeasurement,
  normalizeContributionReviewNote,
} from "../repositories/contributionReviewEventsRepository.js";
import { getMeasurementById, setMeasurement } from "../repositories/measurementsRepository.js";
import { getDeltasForProject } from "../repositories/deltasRepository.js";
import { getAgentRunsForProject } from "../repositories/agentRunsRepository.js";
import {
  assertProjectAccessContext,
  filterMeasurementsForAccess,
} from "../services/collaboration/projectAccessScope.js";
import {
  assertPlanItemFieldWritableByUser,
  selectCanonicalFieldWriteProvenance,
  type FieldWriteAuthorizationProvenance,
} from "../services/collaboration/projectFieldWriteAccess.js";
import {
  parseMeasurement,
  parseMeasurementContributionReviewBody,
} from "../validation/measurement.js";

const OWNER_UID = "phase2j1-owner-uid";
const CONTRACTOR_UID = "phase2j1-contractor-uid";
const FIELD_UID = "phase2j1-field-uid";
const ADMIN_UID = "phase2j1-admin-uid";
const VIEWER_UID = "phase2j1-viewer-uid";
const LOCAL_PROJECT_ID = "project-2j1-review";
const LOCAL_ALT_ID = "project-2j1-alt";

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
    name: `Phase 2J.1 ${input.localProjectId}`,
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
  id?: string;
}): Promise<WorkPackageAssignment> {
  const now = new Date().toISOString();
  const item: WorkPackageAssignment = {
    id: input.id ?? createWorkPackageAssignmentId(),
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

/** Mirrors owner POST /measurements create policy (Phase 2J.1). */
async function createOwnerMeasurement(input: {
  projectId: string;
  ownerUid: string;
  planItemId: string;
  localMeasurementId: string;
  createdAt: string;
}): Promise<Measurement> {
  const id = createRemoteMeasurementId(
    input.projectId,
    input.localMeasurementId,
  );
  const measurement: Measurement = {
    id,
    localMeasurementId: input.localMeasurementId,
    projectId: input.projectId,
    planItemId: input.planItemId,
    type: "length",
    label: "Owner measure",
    value: 12,
    unit: "ft",
    createdAt: input.createdAt,
    capturedByUid: input.ownerUid,
    reviewStatus: "accepted",
  };
  await setMeasurement(measurement);
  return measurement;
}

/** Mirrors collaborator POST /measurements create policy (Phase 2J.1). */
async function createCollaboratorMeasurement(input: {
  projectId: string;
  uid: string;
  planItemId: string;
  localMeasurementId: string;
  createdAt: string;
}): Promise<Measurement> {
  const write = await assertPlanItemFieldWritableByUser(
    input.projectId,
    input.uid,
    input.planItemId,
  );
  const provenance = write.authorizationProvenance;
  const id = createRemoteMeasurementId(
    input.projectId,
    input.localMeasurementId,
  );
  const measurement: Measurement = {
    id,
    localMeasurementId: input.localMeasurementId,
    projectId: input.projectId,
    planItemId: input.planItemId,
    type: "length",
    label: "Collaborator measure",
    value: 8,
    unit: "ft",
    createdAt: input.createdAt,
    capturedByUid: input.uid,
    reviewStatus: "pending",
    capturedByProjectMemberId: provenance.projectMemberId,
    submittedAssignmentId: provenance.assignmentId,
    submittedWorkPackageId: provenance.workPackageId,
  };
  await setMeasurement(measurement);
  return measurement;
}

function filterPending(measurements: readonly Measurement[]): Measurement[] {
  return measurements
    .filter((m) => m.reviewStatus === "pending")
    .sort((a, b) => {
      const timeCmp = b.createdAt.localeCompare(a.createdAt);
      if (timeCmp !== 0) return timeCmp;
      return b.id.localeCompare(a.id);
    });
}

async function runServiceLayerTests(): Promise<void> {
  const projectId = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const altProjectId = createRemoteProjectId(OWNER_UID, LOCAL_ALT_ID);

  for (const id of [projectId, altProjectId]) {
    await deleteByProject(COLLECTIONS.contributionReviewEvents, id);
    await deleteByProject(COLLECTIONS.measurements, id);
    await deleteByProject(COLLECTIONS.deltas, id);
    await deleteByProject(COLLECTIONS.agentRuns, id);
    await deleteByProject(COLLECTIONS.workPackageAssignments, id);
    await deleteByProject(COLLECTIONS.workPackages, id);
    await deleteByProject(COLLECTIONS.planItems, id);
    await deleteByProject(COLLECTIONS.projectMembers, id);
    await db.collection(COLLECTIONS.projects).doc(id).delete();
  }

  await seedProject({
    id: projectId,
    localProjectId: LOCAL_PROJECT_ID,
    ownerUid: OWNER_UID,
  });
  await seedProject({
    id: altProjectId,
    localProjectId: LOCAL_ALT_ID,
    ownerUid: OWNER_UID,
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

  const planA = await seedPlanItem(projectId, "pi-a", "Plan A");
  const planB = await seedPlanItem(projectId, "pi-b", "Plan B");
  const planAlt = await seedPlanItem(altProjectId, "pi-alt", "Plan Alt");

  // Deterministic multi-context: two WPs + assignments covering planA.
  // Canonical = lexicographically smallest workPackageId, then assignmentId.
  const wpZ = await seedWorkPackage({
    projectId,
    name: "WP-Z",
    status: "in_progress",
    planItemIds: [planA.id],
  });
  const wpA = await seedWorkPackage({
    projectId,
    name: "WP-A",
    status: "ready",
    planItemIds: [planA.id, planB.id],
  });

  // Force assignment IDs so selection is predictable relative to WP sort.
  const assignZ = await seedAssignment({
    projectId,
    workPackageId: wpZ.id,
    projectMemberId: contractorMemberId,
    status: "accepted",
    id: "zza-assign-z",
  });
  const assignA = await seedAssignment({
    projectId,
    workPackageId: wpA.id,
    projectMemberId: contractorMemberId,
    status: "assigned",
    id: "aaa-assign-a",
  });

  const contexts: FieldWriteAuthorizationProvenance[] = [
    {
      planItemId: planA.id,
      projectMemberId: contractorMemberId,
      assignmentId: assignZ.id,
      workPackageId: wpZ.id,
    },
    {
      planItemId: planA.id,
      projectMemberId: contractorMemberId,
      assignmentId: assignA.id,
      workPackageId: wpA.id,
    },
  ];
  const canonical = selectCanonicalFieldWriteProvenance(contexts);
  assert(!!canonical, "10 canonical exists");
  const expectedCanonical =
    wpA.id.localeCompare(wpZ.id) < 0
      ? { workPackageId: wpA.id, assignmentId: assignA.id }
      : { workPackageId: wpZ.id, assignmentId: assignZ.id };
  assertEq("10 wp", canonical!.workPackageId, expectedCanonical.workPackageId);
  assertEq("10 assign", canonical!.assignmentId, expectedCanonical.assignmentId);

  // --- Owner create ---
  const ownerMeas = await createOwnerMeasurement({
    projectId,
    ownerUid: OWNER_UID,
    planItemId: planA.id,
    localMeasurementId: "m-owner-1",
    createdAt: "2026-03-01T10:00:00.000Z",
  });
  assertEq("1 reviewStatus", ownerMeas.reviewStatus, "accepted");
  assertEq("1 reviewedByUid", ownerMeas.reviewedByUid, undefined);
  assertEq("1 reviewedAt", ownerMeas.reviewedAt, undefined);
  const ownerEvents = await listContributionReviewEventsForMeasurement(
    projectId,
    ownerMeas.id,
  );
  assertEq("2 no review event on owner create", ownerEvents.length, 0);

  // --- Contractor create ---
  const contractorMeas = await createCollaboratorMeasurement({
    projectId,
    uid: CONTRACTOR_UID,
    planItemId: planA.id,
    localMeasurementId: "m-contractor-1",
    createdAt: "2026-03-01T11:00:00.000Z",
  });
  assertEq("3 pending", contractorMeas.reviewStatus, "pending");
  assertEq("5 capturedByUid", contractorMeas.capturedByUid, CONTRACTOR_UID);
  assertEq(
    "6 member",
    contractorMeas.capturedByProjectMemberId,
    contractorMemberId,
  );
  assertEq(
    "7 assignment",
    contractorMeas.submittedAssignmentId,
    expectedCanonical.assignmentId,
  );
  assertEq(
    "8 workPackage",
    contractorMeas.submittedWorkPackageId,
    expectedCanonical.workPackageId,
  );

  const writeCtx = await assertPlanItemFieldWritableByUser(
    projectId,
    CONTRACTOR_UID,
    planA.id,
  );
  assertEq(
    "9 resolver assignment",
    writeCtx.authorizationProvenance.assignmentId,
    contractorMeas.submittedAssignmentId,
  );
  assertEq(
    "9 resolver wp",
    writeCtx.authorizationProvenance.workPackageId,
    contractorMeas.submittedWorkPackageId,
  );

  // Spoofed client fields rejected by parse
  assertEq(
    "40 reviewStatus spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-1"),
      localMeasurementId: "spoof-1",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      reviewStatus: "accepted",
    }),
    null,
  );
  assertEq(
    "38 reviewedByUid spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-2"),
      localMeasurementId: "spoof-2",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      reviewedByUid: "attacker",
    }),
    null,
  );
  assertEq(
    "39 reviewedAt spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-3"),
      localMeasurementId: "spoof-3",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      reviewedAt: "2020-01-01T00:00:00.000Z",
    }),
    null,
  );
  assertEq(
    "41 assignment spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-4"),
      localMeasurementId: "spoof-4",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      submittedAssignmentId: "forged-assignment",
    }),
    null,
  );
  assertEq(
    "42 wp spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-5"),
      localMeasurementId: "spoof-5",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      submittedWorkPackageId: "forged-wp",
    }),
    null,
  );
  assertEq(
    "43 member spoof",
    parseMeasurement({
      id: createRemoteMeasurementId(projectId, "spoof-6"),
      localMeasurementId: "spoof-6",
      projectId,
      planItemId: planA.id,
      type: "length",
      label: "x",
      value: 1,
      unit: "ft",
      createdAt: "2026-03-01T12:00:00.000Z",
      capturedByProjectMemberId: "forged-member",
    }),
    null,
  );

  // --- Field member create ---
  await seedAssignment({
    projectId,
    workPackageId: wpA.id,
    projectMemberId: fieldMemberId,
    status: "in_progress",
  });
  const fieldMeas = await createCollaboratorMeasurement({
    projectId,
    uid: FIELD_UID,
    planItemId: planA.id,
    localMeasurementId: "m-field-1",
    createdAt: "2026-03-01T12:30:00.000Z",
  });
  assertEq("4 field pending", fieldMeas.reviewStatus, "pending");
  assertEq("4 field member", fieldMeas.capturedByProjectMemberId, fieldMemberId);

  // --- Legacy ---
  const legacyId = createRemoteMeasurementId(projectId, "m-legacy");
  const legacy: Measurement = {
    id: legacyId,
    localMeasurementId: "m-legacy",
    projectId,
    planItemId: planA.id,
    type: "length",
    label: "Legacy",
    value: 3,
    unit: "ft",
    createdAt: "2025-01-01T00:00:00.000Z",
    capturedByUid: OWNER_UID,
  };
  await setMeasurement(legacy);
  assertEq(
    "11 effective legacy",
    effectiveMeasurementReviewStatus(legacy),
    "accepted",
  );

  const allForPending = [
    ownerMeas,
    contractorMeas,
    fieldMeas,
    legacy,
  ];
  const pending = filterPending(allForPending);
  assert(
    !pending.some((m) => m.id === legacyId),
    "12 legacy not in pending",
  );
  assert(
    pending.some((m) => m.id === contractorMeas.id),
    "13 contractor pending",
  );
  assert(
    pending.some((m) => m.id === fieldMeas.id),
    "13 field pending",
  );
  assert(
    !pending.some((m) => m.id === ownerMeas.id),
    "14 exclude accepted",
  );

  // Reject one to verify exclude rejected
  const rejectSeed = await createCollaboratorMeasurement({
    projectId,
    uid: CONTRACTOR_UID,
    planItemId: planB.id,
    localMeasurementId: "m-reject-seed",
    createdAt: "2026-03-01T09:00:00.000Z",
  });
  // planB only on wpA — contractor assigned via assignA which includes planB
  const rejectResult = await applyMeasurementContributionReview({
    projectId,
    measurementId: rejectSeed.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "bad",
  });
  assertEq("15 reject kind", rejectResult.kind, "updated");
  const pendingAfterReject = filterPending([
    ...allForPending,
    (rejectResult as { measurement: Measurement }).measurement,
  ]);
  assert(
    !pendingAfterReject.some((m) => m.id === rejectSeed.id),
    "15 exclude rejected",
  );

  // Sorting createdAt DESC
  assertEq("16 first pending", pending[0]?.id, fieldMeas.id);
  assertEq("16 second pending", pending[1]?.id, contractorMeas.id);

  // --- Review transitions ---
  const accept1 = await applyMeasurementContributionReview({
    projectId,
    measurementId: contractorMeas.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("17 kind", accept1.kind, "updated");
  if (accept1.kind !== "updated") {
    throw new Error("expected updated");
  }
  assertEq("17 status", accept1.measurement.reviewStatus, "accepted");
  assertEq("18 reviewedByUid", accept1.measurement.reviewedByUid, OWNER_UID);
  assert(!!accept1.measurement.reviewedAt, "19 reviewedAt set");
  assertEq("20 event next", accept1.event.nextStatus, "accepted");
  assertEq("21 event prev", accept1.event.previousStatus, "pending");
  assertEq("22 event nextStatus", accept1.event.nextStatus, "accepted");

  // pending → rejected
  const reject1 = await applyMeasurementContributionReview({
    projectId,
    measurementId: fieldMeas.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "wrong measurement",
  });
  assertEq("23 kind", reject1.kind, "updated");
  if (reject1.kind !== "updated") {
    throw new Error("expected updated");
  }
  assertEq("24 note", reject1.measurement.reviewNote, "wrong measurement");

  // rejected → accepted clears old note when no note supplied
  const accept2 = await applyMeasurementContributionReview({
    projectId,
    measurementId: fieldMeas.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("25 kind", accept2.kind, "updated");
  if (accept2.kind !== "updated") {
    throw new Error("expected updated");
  }
  assertEq("27 note cleared", accept2.measurement.reviewNote, undefined);
  const fieldHistory = await listContributionReviewEventsForMeasurement(
    projectId,
    fieldMeas.id,
  );
  assertEq("26 history length", fieldHistory.length, 2);
  assertEq("26 first next", fieldHistory[0]?.nextStatus, "rejected");
  assertEq("26 second next", fieldHistory[1]?.nextStatus, "accepted");

  // accepted → rejected correction
  const reject2 = await applyMeasurementContributionReview({
    projectId,
    measurementId: fieldMeas.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "correction",
  });
  assertEq("28 kind", reject2.kind, "updated");

  // Idempotent same-status
  const beforeIdempotent = await getMeasurementById(fieldMeas.id);
  const idemReject = await applyMeasurementContributionReview({
    projectId,
    measurementId: fieldMeas.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "ignored",
  });
  assertEq("30 idempotent kind", idemReject.kind, "idempotent");
  const afterIdempotent = await getMeasurementById(fieldMeas.id);
  assertEq(
    "30 reviewedAt unchanged",
    afterIdempotent?.reviewedAt,
    beforeIdempotent?.reviewedAt,
  );
  const histAfterIdem = await listContributionReviewEventsForMeasurement(
    projectId,
    fieldMeas.id,
  );
  assertEq("30 no new event", histAfterIdem.length, 3);

  const idemAccept = await applyMeasurementContributionReview({
    projectId,
    measurementId: contractorMeas.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("29 accepted idempotent", idemAccept.kind, "idempotent");

  // pending not allowed via review body parser
  assertEq(
    "31 pending status",
    parseMeasurementContributionReviewBody({ status: "pending" }),
    null,
  );
  assertEq(
    "31 reviewedByUid in body",
    parseMeasurementContributionReviewBody({
      status: "accepted",
      reviewedByUid: "x",
    }),
    null,
  );

  // Non-owners cannot use ownership primitive for review
  await expectDenied("32 contractor review", () =>
    assertProjectOwnedByUser(projectId, CONTRACTOR_UID),
  );
  await expectDenied("33 field review", () =>
    assertProjectOwnedByUser(projectId, FIELD_UID),
  );
  await expectDenied("34 admin review", () =>
    assertProjectOwnedByUser(projectId, ADMIN_UID),
  );
  await expectDenied("35 viewer review", () =>
    assertProjectOwnedByUser(projectId, VIEWER_UID),
  );

  // Cross-project / missing → not_found
  const cross = await applyMeasurementContributionReview({
    projectId: altProjectId,
    measurementId: contractorMeas.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("36 cross-project", cross.kind, "not_found");

  const missing = await applyMeasurementContributionReview({
    projectId,
    measurementId: createRemoteMeasurementId(projectId, "does-not-exist"),
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("37 missing", missing.kind, "not_found");

  // Legacy explicit review: previousStatus accepted
  const legacyReview = await applyMeasurementContributionReview({
    projectId,
    measurementId: legacyId,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "legacy fix",
  });
  assertEq("11b legacy review kind", legacyReview.kind, "updated");
  if (legacyReview.kind === "updated") {
    assertEq("11b previousStatus", legacyReview.event.previousStatus, "accepted");
  }

  // Atomicity: after update, measurement + event both present
  assert(accept1.kind === "updated", "44 atomic precondition");
  const stored = await getMeasurementById(accept1.measurement.id);
  const eventsForAccept = await listContributionReviewEventsForMeasurement(
    projectId,
    accept1.measurement.id,
  );
  assertEq("44 measurement status", stored?.reviewStatus, "accepted");
  assert(eventsForAccept.length >= 1, "44 event present");

  // Evidence has no reviewStatus in domain (structural check via import shape)
  assertEq(
    "45 evidence domain",
    Object.prototype.hasOwnProperty.call(
      await import("../domain/evidence.js"),
      "EvidenceReviewStatus",
    ),
    false,
  );

  // Review transaction alone does not create Delta/AgentRun
  // (Phase 2L.1 bridge is route/orchestration side-effect, not this mutation).
  const deltas = await getDeltasForProject(projectId);
  const agentRuns = await getAgentRunsForProject(projectId);
  assertEq("46/47/48/49 deltas", deltas.length, 0);
  assertEq("46/47/48/49 agentRuns", agentRuns.length, 0);

  // Owner Delta flow unchanged: owner-accepted measurement still coexists with Delta storage
  assertEq("50 owner measurement accepted", ownerMeas.reviewStatus, "accepted");
  const { setDelta } = await import("../repositories/deltasRepository.js");
  const { createRemoteDeltaId } = await import("../domain/deltaId.js");
  const ownerDelta = {
    id: createRemoteDeltaId(projectId, "delta-owner-bootstrap"),
    localDeltaId: "delta-owner-bootstrap",
    projectId,
    planItemId: planA.id,
    measurementId: ownerMeas.id,
    type: "length" as const,
    plannedValue: 10,
    actualValue: 12,
    difference: 2,
    percentDifference: 20,
    unit: "ft",
    unitCost: 1,
    costImpact: 2,
    productionRatePerDay: 1,
    scheduleImpactDays: 2,
    laborHoursPerUnit: 1,
    laborImpactHours: 2,
    status: "open" as const,
    dispositionReason: "",
    disposedAt: null,
    createdAt: "2026-03-01T10:05:00.000Z",
  };
  await setDelta(ownerDelta);
  const deltasAfter = await getDeltasForProject(projectId);
  assertEq("50 owner delta still storable", deltasAfter.length, 1);

  // Phase 2H scoped reads
  const scopedRead = await assertProjectAccessContext(projectId, CONTRACTOR_UID);
  const filtered = filterMeasurementsForAccess(
    [contractorMeas, fieldMeas, ownerMeas],
    scopedRead,
  );
  assert(
    filtered.some((m) => m.id === contractorMeas.id),
    "51 scoped read contractor measurement",
  );

  // Phase 2I.1 field-write still works
  const stillWritable = await assertPlanItemFieldWritableByUser(
    projectId,
    CONTRACTOR_UID,
    planA.id,
  );
  assert(
    stillWritable.writableAssignedPlanItemIds.includes(planA.id),
    "52 field-write still authorized",
  );
  assert(
    !!stillWritable.authorizationProvenance,
    "52 provenance still present",
  );

  // Note normalization
  assertEq("note empty", normalizeContributionReviewNote("   "), undefined);
  assertEq("note trim", normalizeContributionReviewNote("  hi  "), "hi");
  assertEq(
    "note too long",
    normalizeContributionReviewNote("x".repeat(2001)),
    null,
  );

  void planAlt;
  void assignA;
  void assignZ;

  console.log("phase2J1 contribution review & provenance: PASS");
}

async function main(): Promise<void> {
  await runServiceLayerTests();
  console.log("phase2J1ContributionReviewTest: PASS");
}

main().catch((error) => {
  console.error("phase2J1ContributionReviewTest failed:");
  console.error(error);
  process.exitCode = 1;
});
