/**
 * Phase 2F-C — Owner server-side Plan-vs-Reality reconciliation.
 *
 * Service-layer tests against Firestore (no Auth Admin dependency).
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { assertProjectOwnedByUser, ProjectAccessError } from "../auth/projectAccess.js";
import { buildFieldVarianceAgentRunId } from "../domain/agentRun.js";
import type { Delta } from "../domain/delta.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
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
  getAgentRunsForProject,
} from "../repositories/agentRunsRepository.js";
import {
  getDeltaByMeasurementId,
  getDeltasForProject,
  setDelta,
} from "../repositories/deltasRepository.js";
import { setMeasurement } from "../repositories/measurementsRepository.js";
import {
  createCollaboratorReviewLocalDeltaId,
  createDeltaFromMeasurement,
  createOwnerReconcileLocalDeltaId,
} from "../services/createDeltaFromMeasurement.js";
import {
  OwnerMeasurementReconcileError,
  reconcileOwnerMeasurementToDelta,
} from "../services/reconcileOwnerMeasurementToDelta.js";

const OWNER_UID = "phase2fc-owner-uid";
const CONTRACTOR_UID = "phase2fc-contractor-uid";
const FIELD_UID = "phase2fc-field-uid";
const ADMIN_UID = "phase2fc-admin-uid";
const VIEWER_UID = "phase2fc-viewer-uid";
const OTHER_OWNER_UID = "phase2fc-other-owner-uid";
const LOCAL_PROJECT_ID = "project-2fc-reconcile";
const LOCAL_ALT_ID = "project-2fc-alt";

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
  } catch (caught) {
    const error = caught;
    const isAccess = error instanceof ProjectAccessError;
    const isReconcile = error instanceof OwnerMeasurementReconcileError;
    assert(isAccess || isReconcile, `${label}: expected access/reconcile denial`);
    const status = isAccess
      ? (error as ProjectAccessError).statusCode
      : (error as OwnerMeasurementReconcileError).statusCode;
    assertEq(`${label} status`, status, 404);
  }
}

async function expectIneligible(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected ineligible 400`);
  } catch (caught) {
    assert(
      caught instanceof OwnerMeasurementReconcileError,
      `${label}: expected OwnerMeasurementReconcileError`,
    );
    const error = caught as OwnerMeasurementReconcileError;
    assertEq(`${label} status`, error.statusCode, 400);
    assert(
      error.code.startsWith("delta_ineligible_") ||
        error.code === "plan_item_mismatch",
      `${label}: unexpected code ${error.code}`,
    );
  }
}

function mockEnqueueCreated(
  onEnqueue?: () => void,
): NonNullable<
  Parameters<typeof reconcileOwnerMeasurementToDelta>[1]
>["enqueueFn"] {
  return async (args) => {
    onEnqueue?.();
    return {
      outcome: "created" as const,
      taskId: `task-${args.agentRunId}`,
      url: `https://example.com/internal/agent-runs/${args.agentRunId}/start`,
      payload: { agentRunId: args.agentRunId },
    };
  };
}

const MOCK_AGENT_ENV = {
  projectId: "test",
  location: "us-central1",
  queue: "q",
  agentServiceUrl: "https://example.com",
  invokerServiceAccountEmail: "sa@example.com",
};

async function seedProject(input: {
  id: string;
  localProjectId: string;
  ownerUid: string;
}): Promise<Project> {
  const project: Project = {
    id: input.id,
    localProjectId: input.localProjectId,
    name: `Phase 2F-C ${input.localProjectId}`,
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
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

async function seedPlanItem(input: {
  projectId: string;
  localPlanItemId: string;
  plannedValue: number;
  unitCost?: number;
  productionRatePerDay?: number;
  laborHoursPerUnit?: number;
}): Promise<PlanItem> {
  const id = createRemotePlanItemId(input.projectId, input.localPlanItemId);
  const planItem: PlanItem = {
    id,
    localPlanItemId: input.localPlanItemId,
    projectId: input.projectId,
    type: "length",
    label: `Plan ${input.localPlanItemId}`,
    plannedValue: input.plannedValue,
    unit: "ft",
    unitCost: input.unitCost ?? 10,
    productionRatePerDay: input.productionRatePerDay ?? 50,
    laborHoursPerUnit: input.laborHoursPerUnit ?? 0.2,
  };
  await db.collection(COLLECTIONS.planItems).doc(id).set(planItem);
  return planItem;
}

function makeOwnerMeasurement(input: {
  projectId: string;
  planItemId: string;
  localMeasurementId: string;
  value: number;
  capturedByUid: string;
}): Measurement {
  return {
    id: createRemoteMeasurementId(input.projectId, input.localMeasurementId),
    localMeasurementId: input.localMeasurementId,
    projectId: input.projectId,
    planItemId: input.planItemId,
    type: "length",
    label: "Owner field length",
    value: input.value,
    unit: "ft",
    createdAt: new Date().toISOString(),
    capturedByUid: input.capturedByUid,
    reviewStatus: "accepted",
  };
}

function makeCollaboratorMeasurement(input: {
  projectId: string;
  planItemId: string;
  localMeasurementId: string;
  value: number;
  memberId: string;
  assignmentId: string;
  workPackageId: string;
  reviewStatus: "pending" | "accepted";
}): Measurement {
  return {
    id: createRemoteMeasurementId(input.projectId, input.localMeasurementId),
    localMeasurementId: input.localMeasurementId,
    projectId: input.projectId,
    planItemId: input.planItemId,
    type: "length",
    label: "Collaborator field length",
    value: input.value,
    unit: "ft",
    createdAt: new Date().toISOString(),
    capturedByUid: CONTRACTOR_UID,
    reviewStatus: input.reviewStatus,
    capturedByProjectMemberId: input.memberId,
    submittedAssignmentId: input.assignmentId,
    submittedWorkPackageId: input.workPackageId,
  };
}

async function deleteByProject(
  collection: string,
  projectId: string,
): Promise<void> {
  const snap = await db
    .collection(collection)
    .where("projectId", "==", projectId)
    .get();
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  if (!snap.empty) {
    await batch.commit();
  }
}

async function cleanup(projectIds: string[]): Promise<void> {
  for (const projectId of projectIds) {
    await deleteByProject(COLLECTIONS.activityEvents, projectId);
    await deleteByProject(COLLECTIONS.notifications, projectId);
    await deleteByProject(COLLECTIONS.agentRuns, projectId);
    await deleteByProject(COLLECTIONS.deltas, projectId);
    await deleteByProject(COLLECTIONS.measurements, projectId);
    await deleteByProject(COLLECTIONS.contributionReviewEvents, projectId);
    await deleteByProject(COLLECTIONS.workPackageAssignments, projectId);
    await deleteByProject(COLLECTIONS.workPackages, projectId);
    await deleteByProject(COLLECTIONS.planItems, projectId);
    await deleteByProject(COLLECTIONS.projectMembers, projectId);
    await db.collection(COLLECTIONS.projects).doc(projectId).delete();
  }
}

async function countDeltaCreatedActivity(
  projectId: string,
  deltaId: string,
): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.activityEvents)
    .where("projectId", "==", projectId)
    .where("type", "==", "delta_created")
    .get();
  return snap.docs.filter((doc) => {
    const data = doc.data() as { subjectId?: string; related?: { deltaId?: string } };
    return data.subjectId === deltaId || data.related?.deltaId === deltaId;
  }).length;
}

async function main(): Promise<void> {
  const projectId = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const altProjectId = createRemoteProjectId(OTHER_OWNER_UID, LOCAL_ALT_ID);

  await cleanup([projectId, altProjectId]);

  await seedProject({
    id: projectId,
    localProjectId: LOCAL_PROJECT_ID,
    ownerUid: OWNER_UID,
  });
  await seedProject({
    id: altProjectId,
    localProjectId: LOCAL_ALT_ID,
    ownerUid: OTHER_OWNER_UID,
  });

  const contractorMemberId = await seedMember({
    projectId,
    userId: CONTRACTOR_UID,
    role: "contractor",
  });
  await seedMember({ projectId, userId: FIELD_UID, role: "field_member" });
  await seedMember({ projectId, userId: ADMIN_UID, role: "project_admin" });
  await seedMember({ projectId, userId: VIEWER_UID, role: "viewer" });

  const plan = await seedPlanItem({
    projectId,
    localPlanItemId: "plan-main",
    plannedValue: 100,
  });
  const badRatePlan = await seedPlanItem({
    projectId,
    localPlanItemId: "plan-bad-rate",
    plannedValue: 100,
    productionRatePerDay: 0,
  });

  const wpId = createWorkPackageId();
  const wp: WorkPackage = {
    id: wpId,
    projectId,
    name: "WP 1",
    status: "in_progress",
    planItemIds: [plan.id],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.collection(COLLECTIONS.workPackages).doc(wpId).set(wp);

  const assignmentId = createWorkPackageAssignmentId();
  const assignment: WorkPackageAssignment = {
    id: assignmentId,
    projectId,
    workPackageId: wpId,
    projectMemberId: contractorMemberId,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignmentId)
    .set(assignment);

  let enqueueCount = 0;
  const deps = {
    enqueueFn: mockEnqueueCreated(() => {
      enqueueCount += 1;
    }),
    loadEnvFn: () => MOCK_AGENT_ENV,
  };

  // A. owner variance → created
  const ownerMeas = makeOwnerMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "m-owner-variance",
    value: 82,
    capturedByUid: OWNER_UID,
  });
  await setMeasurement(ownerMeas);

  const created = await reconcileOwnerMeasurementToDelta(
    {
      projectId,
      measurementId: ownerMeas.id,
      ownerUid: OWNER_UID,
    },
    deps,
  );
  assertEq("A outcome", created.outcome, "created");
  assert(created.outcome !== "no_delta" && created.delta !== null, "A delta");
  if (created.outcome === "no_delta") {
    throw new Error("unreachable");
  }
  assertEq("A difference", created.delta.difference, -18);
  assertEq(
    "A localDeltaId",
    created.delta.localDeltaId,
    createOwnerReconcileLocalDeltaId(ownerMeas.localMeasurementId),
  );
  assertEq(
    "A remote id",
    created.delta.id,
    createRemoteDeltaId(projectId, created.delta.localDeltaId),
  );
  assertEq("A planned", created.delta.plannedValue, 100);
  assertEq("A actual", created.delta.actualValue, 82);
  assert(created.trigger?.agentRunCreated === true, "G AgentRun created");
  assertEq("G enqueue once after create", enqueueCount, 1);

  const activityCount1 = await countDeltaCreatedActivity(
    projectId,
    created.delta.id,
  );
  assertEq("F activity once after create", activityCount1, 1);

  // D/E retry → existing, one delta, no second activity/enqueue
  const retry = await reconcileOwnerMeasurementToDelta(
    {
      projectId,
      measurementId: ownerMeas.id,
      ownerUid: OWNER_UID,
    },
    deps,
  );
  assertEq("D outcome", retry.outcome, "existing");
  if (retry.outcome === "no_delta") {
    throw new Error("unreachable");
  }
  assertEq("D same delta", retry.delta.id, created.delta.id);
  assertEq("E one delta", (await getDeltasForProject(projectId)).filter((d) => d.measurementId === ownerMeas.id).length, 1);
  assertEq("F activity still once", await countDeltaCreatedActivity(projectId, created.delta.id), 1);
  assertEq("G enqueue still once", enqueueCount, 1);
  assertEq("G AgentRun not recreated", retry.trigger?.agentRunCreated, false);

  // B. zero difference → no_delta
  const zeroMeas = makeOwnerMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "m-owner-zero",
    value: 100,
    capturedByUid: OWNER_UID,
  });
  await setMeasurement(zeroMeas);
  const zero = await reconcileOwnerMeasurementToDelta(
    {
      projectId,
      measurementId: zeroMeas.id,
      ownerUid: OWNER_UID,
    },
    deps,
  );
  assertEq("B outcome", zero.outcome, "no_delta");
  if (zero.outcome === "no_delta") {
    assertEq("B reason", zero.reason, "zero_difference");
    assertEq("B delta null", zero.delta, null);
  }
  assertEq(
    "B no delta stored",
    (await getDeltaByMeasurementId(zeroMeas.id)) === undefined,
    true,
  );

  // C. invalid plan rate → 400 not no_delta
  const badMeas = makeOwnerMeasurement({
    projectId,
    planItemId: badRatePlan.id,
    localMeasurementId: "m-owner-bad-rate",
    value: 90,
    capturedByUid: OWNER_UID,
  });
  await setMeasurement(badMeas);
  await expectIneligible("C invalid production rate", () =>
    reconcileOwnerMeasurementToDelta(
      {
        projectId,
        measurementId: badMeas.id,
        ownerUid: OWNER_UID,
      },
      deps,
    ),
  );

  // H–L ownership denials via assertProjectOwnedByUser
  await expectDenied("H non-owner", () =>
    assertProjectOwnedByUser(projectId, CONTRACTOR_UID),
  );
  await expectDenied("I project_admin", () =>
    assertProjectOwnedByUser(projectId, ADMIN_UID),
  );
  await expectDenied("J contractor", () =>
    assertProjectOwnedByUser(projectId, CONTRACTOR_UID),
  );
  await expectDenied("K field_member", () =>
    assertProjectOwnedByUser(projectId, FIELD_UID),
  );
  await expectDenied("L viewer", () =>
    assertProjectOwnedByUser(projectId, VIEWER_UID),
  );

  // Service-level non-owner
  await expectDenied("H service non-owner", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: ownerMeas.id,
      ownerUid: CONTRACTOR_UID,
    }),
  );

  // M. cross-project measurement
  const altPlan = await seedPlanItem({
    projectId: altProjectId,
    localPlanItemId: "plan-alt",
    plannedValue: 50,
  });
  const crossMeas = makeOwnerMeasurement({
    projectId: altProjectId,
    planItemId: altPlan.id,
    localMeasurementId: "m-cross",
    value: 40,
    capturedByUid: OTHER_OWNER_UID,
  });
  await setMeasurement(crossMeas);
  await expectDenied("M cross-project", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: crossMeas.id,
      ownerUid: OWNER_UID,
    }),
  );

  // N. measurement pointing at plan item from another project id space
  // (plan item missing / wrong project) — use a fake planItemId on an owner meas
  const mismatchLocal = "m-owner-mismatch";
  const mismatchMeas: Measurement = {
    ...makeOwnerMeasurement({
      projectId,
      planItemId: altPlan.id,
      localMeasurementId: mismatchLocal,
      value: 70,
      capturedByUid: OWNER_UID,
    }),
    // Force projectId match project but planItem belongs to alt
    projectId,
  };
  await setMeasurement(mismatchMeas);
  await expectDenied("N plan item wrong project", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: mismatchMeas.id,
      ownerUid: OWNER_UID,
    }),
  );

  // O. pending collaborator cannot bypass
  const pendingCollab = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "m-collab-pending",
    value: 70,
    memberId: contractorMemberId,
    assignmentId,
    workPackageId: wpId,
    reviewStatus: "pending",
  });
  await setMeasurement(pendingCollab);
  await expectDenied("O pending collaborator", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: pendingCollab.id,
      ownerUid: OWNER_UID,
    }),
  );

  // P. accepted collaborator already reconciled → existing via measurementId
  const acceptedCollab = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "m-collab-accepted",
    value: 75,
    memberId: contractorMemberId,
    assignmentId,
    workPackageId: wpId,
    reviewStatus: "accepted",
  });
  await setMeasurement(acceptedCollab);
  const collabDelta = createDeltaFromMeasurement(acceptedCollab, plan);
  assert(collabDelta !== null, "P collab helper delta");
  await setDelta(collabDelta!);
  assertEq(
    "P collab localDeltaId",
    collabDelta!.localDeltaId,
    createCollaboratorReviewLocalDeltaId(acceptedCollab.localMeasurementId),
  );

  await expectDenied("P accepted collaborator blocked from owner reconcile", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: acceptedCollab.id,
      ownerUid: OWNER_UID,
    }),
  );
  assertEq(
    "P no duplicate collab deltas",
    (await getDeltasForProject(projectId)).filter(
      (d) => d.measurementId === acceptedCollab.id,
    ).length,
    1,
  );

  // Q. existing mobile-bootstrap Delta → existing
  const bootMeas = makeOwnerMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "m-owner-bootstrap",
    value: 88,
    capturedByUid: OWNER_UID,
  });
  await setMeasurement(bootMeas);
  const bootLocalDeltaId = "delta-mobile-random-12345";
  const bootDelta: Delta = {
    id: createRemoteDeltaId(projectId, bootLocalDeltaId),
    localDeltaId: bootLocalDeltaId,
    projectId,
    planItemId: plan.id,
    measurementId: bootMeas.id,
    type: "length",
    plannedValue: 100,
    actualValue: 88,
    difference: -12,
    percentDifference: -12,
    unit: "ft",
    unitCost: 10,
    costImpact: -120,
    productionRatePerDay: 50,
    scheduleImpactDays: -12 / 50,
    laborHoursPerUnit: 0.2,
    laborImpactHours: -12 * 0.2,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt: new Date().toISOString(),
  };
  await setDelta(bootDelta);

  const beforeEnqueue = enqueueCount;
  const bootResult = await reconcileOwnerMeasurementToDelta(
    {
      projectId,
      measurementId: bootMeas.id,
      ownerUid: OWNER_UID,
    },
    deps,
  );
  assertEq("Q outcome", bootResult.outcome, "existing");
  if (bootResult.outcome === "no_delta") {
    throw new Error("unreachable");
  }
  assertEq("Q reuses bootstrap delta", bootResult.delta.id, bootDelta.id);
  assertEq(
    "Q still one delta",
    (await getDeltasForProject(projectId)).filter(
      (d) => d.measurementId === bootMeas.id,
    ).length,
    1,
  );
  // May create AgentRun if absent for that delta; must not create second Delta
  assert(
    (await getAgentRunsForProject(projectId)).some(
      (run) => run.id === buildFieldVarianceAgentRunId(bootDelta.id),
    ) || bootResult.trigger !== null,
    "Q agent path exercised without duplicate delta",
  );
  void beforeEnqueue;

  // Missing capturedByUid denied
  const legacyLocal = "m-owner-legacy";
  const legacy: Measurement = {
    ...makeOwnerMeasurement({
      projectId,
      planItemId: plan.id,
      localMeasurementId: legacyLocal,
      value: 91,
      capturedByUid: OWNER_UID,
    }),
  };
  delete legacy.capturedByUid;
  await setMeasurement(legacy);
  await expectDenied("missing capturedByUid", () =>
    reconcileOwnerMeasurementToDelta({
      projectId,
      measurementId: legacy.id,
      ownerUid: OWNER_UID,
    }),
  );

  // Collaborator createDeltaFromMeasurement identity regression
  const collabHelper = createDeltaFromMeasurement(acceptedCollab, plan);
  assert(collabHelper !== null, "collab helper still works");
  assertEq(
    "collab helper id",
    collabHelper!.localDeltaId,
    createCollaboratorReviewLocalDeltaId(acceptedCollab.localMeasurementId),
  );

  await cleanup([projectId, altProjectId]);

  console.log("phase2fc owner reconcile: PASS");
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
