/**
 * Phase 2L.1 — Backend accepted-Measurement → Delta → Field Variance bridge.
 *
 * Service-layer tests against Firestore (no Auth Admin dependency).
 * Agent context / prompt assertions live in agent phase2L1CollaborationContextTest.
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { buildFieldVarianceAgentRunId } from "../domain/agentRun.js";
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
import { createRemoteDeltaId } from "../domain/deltaId.js";
import {
  applyMeasurementContributionReview,
} from "../repositories/contributionReviewEventsRepository.js";
import {
  createDeltaIfAbsentForMeasurement,
  getDeltaById,
  getDeltaByMeasurementId,
  getDeltasForProject,
  setDelta,
} from "../repositories/deltasRepository.js";
import {
  getAgentRunById,
  getAgentRunsForProject,
} from "../repositories/agentRunsRepository.js";
import { setMeasurement } from "../repositories/measurementsRepository.js";
import {
  bridgeAcceptedCollaboratorMeasurementToFieldVariance,
  isCollaboratorFieldContribution,
} from "../services/acceptedMeasurementAgentBridge.js";
import {
  createCollaboratorReviewLocalDeltaId,
  createDeltaFromMeasurement,
} from "../services/createDeltaFromMeasurement.js";
import {
  calculateDifference,
  calculatePercentDifference,
} from "../services/calculations/comparison.js";
import { calculateCostImpact } from "../services/calculations/cost.js";
import { calculateLaborImpactHours } from "../services/calculations/labor.js";
import { calculateScheduleImpactDays } from "../services/calculations/schedule.js";
import {
  applyAssignmentProgressTransition,
} from "../repositories/assignmentProgressEventsRepository.js";

const OWNER_UID = "phase2l1-owner-uid";
const CONTRACTOR_UID = "phase2l1-contractor-uid";
const LOCAL_PROJECT_ID = "project-2l1-agent";

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

function mockEnqueueCreated(
  onEnqueue?: () => void,
): NonNullable<
  Parameters<typeof bridgeAcceptedCollaboratorMeasurementToFieldVariance>[1]
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
    name: `Phase 2L.1 ${input.localProjectId}`,
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
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: "active",
    invitedBy: OWNER_UID,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function seedPlanItem(
  projectId: string,
  localPlanItemId: string,
  overrides: Partial<PlanItem> = {},
): Promise<PlanItem> {
  const item: PlanItem = {
    id: createRemotePlanItemId(projectId, localPlanItemId),
    localPlanItemId,
    projectId,
    type: "length",
    label: "Conduit",
    plannedValue: 100,
    unit: "ft",
    unitCost: 2,
    productionRatePerDay: 10,
    laborHoursPerUnit: 0.5,
    ...overrides,
  };
  await db.collection(COLLECTIONS.planItems).doc(item.id).set(item);
  return item;
}

async function seedWorkPackage(input: {
  projectId: string;
  name: string;
  planItemIds: string[];
}): Promise<WorkPackage> {
  const now = new Date().toISOString();
  const item: WorkPackage = {
    id: createWorkPackageId(),
    projectId: input.projectId,
    name: input.name,
    description: input.name,
    status: "in_progress",
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

async function cleanup(projectId: string): Promise<void> {
  const agentRuns = await getAgentRunsForProject(projectId);
  await Promise.all(
    agentRuns.map((r) =>
      db.collection(COLLECTIONS.agentRuns).doc(r.id).delete(),
    ),
  );
  await deleteByProject(COLLECTIONS.deltas, projectId);
  await deleteByProject(COLLECTIONS.measurements, projectId);
  await deleteByProject(COLLECTIONS.contributionReviewEvents, projectId);
  await deleteByProject(COLLECTIONS.assignmentProgressEvents, projectId);
  await deleteByProject(COLLECTIONS.workPackageAssignments, projectId);
  await deleteByProject(COLLECTIONS.workPackages, projectId);
  await deleteByProject(COLLECTIONS.planItems, projectId);
  await deleteByProject(COLLECTIONS.projectMembers, projectId);
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

function makeCollaboratorMeasurement(input: {
  projectId: string;
  planItemId: string;
  localMeasurementId: string;
  value: number;
  memberId: string;
  assignmentId: string;
  workPackageId: string;
  reviewStatus?: Measurement["reviewStatus"];
}): Measurement {
  return {
    id: createRemoteMeasurementId(input.projectId, input.localMeasurementId),
    localMeasurementId: input.localMeasurementId,
    projectId: input.projectId,
    planItemId: input.planItemId,
    type: "length",
    label: "Field run",
    value: input.value,
    unit: "ft",
    createdAt: "2026-08-24T12:00:00.000Z",
    capturedByUid: CONTRACTOR_UID,
    reviewStatus: input.reviewStatus ?? "pending",
    capturedByProjectMemberId: input.memberId,
    submittedAssignmentId: input.assignmentId,
    submittedWorkPackageId: input.workPackageId,
  };
}

async function runServiceLayerTests(): Promise<void> {
  const projectId = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  await cleanup(projectId);

  const project = await seedProject({
    id: projectId,
    localProjectId: LOCAL_PROJECT_ID,
    ownerUid: OWNER_UID,
  });
  const memberId = await seedMember({
    projectId,
    userId: CONTRACTOR_UID,
    role: "contractor",
  });
  const plan = await seedPlanItem(projectId, "plan-a");
  const wp = await seedWorkPackage({
    projectId,
    name: "Electrical Rough-In",
    planItemIds: [plan.id],
  });
  const assignment = await seedAssignment({
    projectId,
    workPackageId: wp.id,
    projectMemberId: memberId,
    status: "in_progress",
  });

  // --- Variance math reuse ---
  const difference = calculateDifference(100, 80);
  assertEq("12 difference", difference, -20);
  assertEq("12 percent", calculatePercentDifference(100, 80), -20);
  assertEq("12 cost", calculateCostImpact(-20, 2), -40);
  assertEq("12 schedule", calculateScheduleImpactDays(-20, 10), -2);
  assertEq("12 labor", calculateLaborImpactHours(-20, 0.5), -10);

  // 1. Owner Delta bootstrap still creates/reuses AgentRun (via trigger deps)
  const ownerLocalMeas = "owner-meas-1";
  const ownerMeas: Measurement = {
    id: createRemoteMeasurementId(projectId, ownerLocalMeas),
    localMeasurementId: ownerLocalMeas,
    projectId,
    planItemId: plan.id,
    type: "length",
    label: "Owner capture",
    value: 90,
    unit: "ft",
    createdAt: "2026-08-24T11:00:00.000Z",
    capturedByUid: OWNER_UID,
    reviewStatus: "accepted",
  };
  await setMeasurement(ownerMeas);
  assert(
    !isCollaboratorFieldContribution(ownerMeas),
    "2 owner is not collaborator contribution",
  );

  const ownerLocalDelta = "owner-delta-1";
  const ownerDelta = {
    id: createRemoteDeltaId(projectId, ownerLocalDelta),
    localDeltaId: ownerLocalDelta,
    projectId,
    planItemId: plan.id,
    measurementId: ownerMeas.id,
    type: "length" as const,
    plannedValue: 100,
    actualValue: 90,
    difference: -10,
    percentDifference: -10,
    unit: "ft",
    unitCost: 2,
    costImpact: -20,
    productionRatePerDay: 10,
    scheduleImpactDays: -1,
    laborHoursPerUnit: 0.5,
    laborImpactHours: -5,
    status: "open" as const,
    dispositionReason: "",
    disposedAt: null,
    createdAt: "2026-08-24T11:01:00.000Z",
  };
  await setDelta(ownerDelta);

  let enqueueCount = 0;
  const ownerBridge = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: ownerMeas },
    {
      enqueueFn: mockEnqueueCreated(() => { enqueueCount += 1; }),
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assertEq("2 owner bridge skipped", ownerBridge.reason, "not_collaborator_contribution");
  assertEq("2 no enqueue from owner bridge", enqueueCount, 0);

  // Simulate owner bootstrap trigger (existing path)
  const { triggerFieldVarianceForNewDelta } = await import(
    "../services/fieldVarianceTrigger.js"
  );
  const ownerTrigger = await triggerFieldVarianceForNewDelta(
    {
      ownerUid: OWNER_UID,
      projectId,
      delta: ownerDelta,
      measurement: ownerMeas,
    },
    {
      enqueueFn: mockEnqueueCreated(() => { enqueueCount += 1; }),
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assert(ownerTrigger.agentRunCreated, "1 owner AgentRun created");
  assertEq("1 owner enqueue", enqueueCount, 1);
  const ownerRunId = buildFieldVarianceAgentRunId(ownerDelta.id);
  assertEq("15 owner run id", ownerTrigger.agentRun?.id, ownerRunId);

  // 3–6. Collaborator create pending → no Delta / AgentRun
  const collabPending = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "collab-pending-1",
    value: 80,
    memberId,
    assignmentId: assignment.id,
    workPackageId: wp.id,
    reviewStatus: "pending",
  });
  await setMeasurement(collabPending);
  assert(isCollaboratorFieldContribution(collabPending), "3 collaborator id");
  assertEq("3 pending", collabPending.reviewStatus, "pending");

  const pendingBridge = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: collabPending },
  );
  assertEq("6 pending no bridge", pendingBridge.reason, "not_accepted");
  assertEq(
    "4/5 no delta for pending",
    (await getDeltaByMeasurementId(collabPending.id)) === undefined,
    true,
  );

  // 7–15. Actual pending → accepted creates Delta + AgentRun
  const accept1 = await applyMeasurementContributionReview({
    projectId,
    measurementId: collabPending.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("7 review kind", accept1.kind, "updated");
  if (accept1.kind !== "updated") {
    throw new Error("expected updated");
  }

  let collabEnqueue = 0;
  const bridge1 = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: accept1.measurement },
    {
      enqueueFn: mockEnqueueCreated(() => { collabEnqueue += 1; }),
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assert(bridge1.bridged, "7 bridged");
  assert(bridge1.deltaCreated, "7 delta created");
  assert(bridge1.delta !== null, "7 delta present");
  assertEq("8 ownerUid tenancy trigger", bridge1.trigger?.agentRun?.ownerUid, OWNER_UID);
  assertEq("9 projectId", bridge1.delta!.projectId, projectId);
  assertEq("10 planItemId", bridge1.delta!.planItemId, plan.id);
  assertEq("11 measurementId", bridge1.delta!.measurementId, collabPending.id);

  const expectedMath = createDeltaFromMeasurement(accept1.measurement, plan);
  assert(expectedMath !== null, "12 helper produces delta");
  assertEq("12 difference match", bridge1.delta!.difference, expectedMath!.difference);
  assertEq("12 costImpact match", bridge1.delta!.costImpact, expectedMath!.costImpact);
  assertEq(
    "12 scheduleImpactDays match",
    bridge1.delta!.scheduleImpactDays,
    expectedMath!.scheduleImpactDays,
  );
  assertEq(
    "12 laborImpactHours match",
    bridge1.delta!.laborImpactHours,
    expectedMath!.laborImpactHours,
  );
  assertEq(
    "12 localDeltaId",
    bridge1.delta!.localDeltaId,
    createCollaboratorReviewLocalDeltaId(collabPending.localMeasurementId),
  );

  assert(bridge1.trigger?.agentRunCreated === true, "14 AgentRun created");
  assertEq("14 enqueue", collabEnqueue, 1);
  assertEq(
    "15 deterministic AgentRun id",
    bridge1.trigger?.agentRun?.id,
    buildFieldVarianceAgentRunId(bridge1.delta!.id),
  );

  // 13/16/17. Reuse Delta + idempotent accepted→accepted
  const bridgeReuse = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: accept1.measurement },
    {
      enqueueFn: mockEnqueueCreated(() => { collabEnqueue += 1; }),
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assertEq("13 delta reused", bridgeReuse.deltaCreated, false);
  assertEq("13 same delta id", bridgeReuse.delta?.id, bridge1.delta!.id);
  assertEq("14 AgentRun not recreated", bridgeReuse.trigger?.agentRunCreated, false);
  assertEq("17 no second enqueue", collabEnqueue, 1);

  const idemAccept = await applyMeasurementContributionReview({
    projectId,
    measurementId: collabPending.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("16 idempotent kind", idemAccept.kind, "idempotent");
  // Route only bridges on kind === "updated"; simulate that guard
  assertEq("16 no bridge on idempotent", idemAccept.kind, "idempotent");

  const deltasAfterIdem = await getDeltasForProject(projectId);
  const collabDeltas = deltasAfterIdem.filter(
    (d) => d.measurementId === collabPending.id,
  );
  assertEq("16/17 one collab delta", collabDeltas.length, 1);

  // 18–20. Rejected paths
  const rejectMeas = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "collab-reject-1",
    value: 70,
    memberId,
    assignmentId: assignment.id,
    workPackageId: wp.id,
    reviewStatus: "pending",
  });
  await setMeasurement(rejectMeas);
  const rejectResult = await applyMeasurementContributionReview({
    projectId,
    measurementId: rejectMeas.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "wrong",
  });
  assertEq("19 reject kind", rejectResult.kind, "updated");
  if (rejectResult.kind !== "updated") {
    throw new Error("expected reject update");
  }
  const rejectBridge = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: rejectResult.measurement },
  );
  assertEq("18/19 rejected no bridge", rejectBridge.reason, "not_accepted");
  assertEq(
    "18 no delta",
    (await getDeltaByMeasurementId(rejectMeas.id)) === undefined,
    true,
  );

  // accepted → rejected does not trigger new run (bridge not called for reject)
  const acceptThenReject = await applyMeasurementContributionReview({
    projectId,
    measurementId: collabPending.id,
    reviewerUid: OWNER_UID,
    status: "rejected",
    note: "correction",
  });
  assertEq("20 accept→reject", acceptThenReject.kind, "updated");
  const runsBeforeRejectBridge = (await getAgentRunsForProject(projectId)).length;
  if (acceptThenReject.kind === "updated") {
    const noBridgeOnReject =
      await bridgeAcceptedCollaboratorMeasurementToFieldVariance({
        projectId,
        measurement: acceptThenReject.measurement,
      });
    assertEq("20 reject bridge skipped", noBridgeOnReject.reason, "not_accepted");
  }
  assertEq(
    "20 agent run count unchanged",
    (await getAgentRunsForProject(projectId)).length,
    runsBeforeRejectBridge,
  );

  // 23/25/26. Legacy / no provenance still analyzes via owner path
  const legacyLocal = "legacy-meas-1";
  const legacyMeas: Measurement = {
    id: createRemoteMeasurementId(projectId, legacyLocal),
    localMeasurementId: legacyLocal,
    projectId,
    planItemId: plan.id,
    type: "length",
    label: "Legacy",
    value: 95,
    unit: "ft",
    createdAt: "2026-08-20T10:00:00.000Z",
  };
  await setMeasurement(legacyMeas);
  assert(
    !isCollaboratorFieldContribution(legacyMeas),
    "26 no provenance → not collaborator bridge",
  );
  const legacyReadAlone = await getDeltaByMeasurementId(legacyMeas.id);
  assertEq("24 legacy read alone no delta", legacyReadAlone, undefined);

  // Project without WorkPackage still analyzes (collaborator-like with provenance but WP deleted)
  const noWpMeas = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "collab-no-wp-meta",
    value: 85,
    memberId,
    assignmentId: assignment.id,
    workPackageId: wp.id,
    reviewStatus: "accepted",
  });
  // Strip WP provenance — still collaborator via member+assignment
  delete (noWpMeas as { submittedWorkPackageId?: string }).submittedWorkPackageId;
  await setMeasurement(noWpMeas);
  const noWpBridge = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: noWpMeas },
    {
      enqueueFn: mockEnqueueCreated(),
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assert(noWpBridge.bridged, "25/26 analyzes without WP field");

  // 42/43. Acceptance durable if trigger fails
  const failMeas = makeCollaboratorMeasurement({
    projectId,
    planItemId: plan.id,
    localMeasurementId: "collab-fail-enqueue",
    value: 60,
    memberId,
    assignmentId: assignment.id,
    workPackageId: wp.id,
    reviewStatus: "pending",
  });
  await setMeasurement(failMeas);
  const failAccept = await applyMeasurementContributionReview({
    projectId,
    measurementId: failMeas.id,
    reviewerUid: OWNER_UID,
    status: "accepted",
    note: undefined,
  });
  assertEq("42 accept ok", failAccept.kind, "updated");
  if (failAccept.kind !== "updated") {
    throw new Error("expected accept");
  }
  const failBridge = await bridgeAcceptedCollaboratorMeasurementToFieldVariance(
    { projectId, measurement: failAccept.measurement },
    {
      enqueueFn: async () => {
        throw new Error("simulated enqueue failure");
      },
      loadEnvFn: () => MOCK_AGENT_ENV,
    },
  );
  assertEq("43 enqueue failed", failBridge.trigger?.taskOutcome, "failed");
  const stillAccepted = await db
    .collection(COLLECTIONS.measurements)
    .doc(failMeas.id)
    .get();
  assertEq(
    "42/43 acceptance durable",
    (stillAccepted.data() as Measurement).reviewStatus,
    "accepted",
  );
  assert(failBridge.delta !== null, "43 delta still created");

  // 39–41. Assignment transitions create no AgentRun
  const runsBeforeAssign = (await getAgentRunsForProject(projectId)).length;
  // Seed assignment at in_progress for progress transitions
  await db.collection(COLLECTIONS.workPackageAssignments).doc(assignment.id).set({
    ...assignment,
    status: "in_progress",
    updatedAt: new Date().toISOString(),
  });

  const ready = await applyAssignmentProgressTransition({
    projectId,
    assignmentId: assignment.id,
    actorUid: CONTRACTOR_UID,
    nextStatus: "ready_for_review",
    note: undefined,
  });
  assertEq("39 ready_for_review kind", ready.kind, "updated");
  assertEq(
    "39 no new AgentRun",
    (await getAgentRunsForProject(projectId)).length,
    runsBeforeAssign,
  );

  const completed = await applyAssignmentProgressTransition({
    projectId,
    assignmentId: assignment.id,
    actorUid: OWNER_UID,
    nextStatus: "completed",
    note: undefined,
  });
  assertEq("40 completed kind", completed.kind, "updated");
  assertEq(
    "40 no new AgentRun",
    (await getAgentRunsForProject(projectId)).length,
    runsBeforeAssign,
  );

  const reopened = await applyAssignmentProgressTransition({
    projectId,
    assignmentId: assignment.id,
    actorUid: OWNER_UID,
    nextStatus: "in_progress",
    note: undefined,
  });
  assertEq("41 reopen kind", reopened.kind, "updated");
  assertEq(
    "41 no new AgentRun",
    (await getAgentRunsForProject(projectId)).length,
    runsBeforeAssign,
  );

  // 44. createDeltaIfAbsent idempotent
  const again = await createDeltaIfAbsentForMeasurement(bridge1.delta!);
  assertEq("44 delta if-absent reuse", again.created, false);

  // 47. Delta schema unchanged — required fields present, no collab fields
  const storedDelta = await getDeltaById(bridge1.delta!.id);
  assert(storedDelta !== undefined, "47 delta exists");
  assertEq(
    "47 no reviewStatus on delta",
    Object.prototype.hasOwnProperty.call(storedDelta, "reviewStatus"),
    false,
  );
  assertEq(
    "47 no submittedAssignmentId on delta",
    Object.prototype.hasOwnProperty.call(storedDelta, "submittedAssignmentId"),
    false,
  );

  // Agent cannot mutate — structural: no write tools in agent package for review
  // Covered by agent 2L.1 context test; confirm bridge did not mutate assignment
  const assignmentAfter = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignment.id)
    .get();
  assertEq(
    "36 assignment not mutated by bridge",
    (assignmentAfter.data() as WorkPackageAssignment).status,
    "in_progress",
  );

  void project;
  void getAgentRunById;

  console.log("phase2L1 agent collaboration backend: PASS");
}

async function main(): Promise<void> {
  await runServiceLayerTests();
  console.log("phase2L1AgentCollaborationTest: PASS");
}

main().catch((error) => {
  console.error("phase2L1AgentCollaborationTest failed:");
  console.error(error);
  process.exitCode = 1;
});
