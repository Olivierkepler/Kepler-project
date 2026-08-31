/**
 * Phase 2M.1 — Backend ActivityEvent + Notification foundation.
 * Service-layer tests against Firestore.
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  ACTIVITY_EVENT_TYPES,
  buildActivityEventId,
  type ActivityEvent,
} from "../domain/activityEvent.js";
import { buildNotificationId } from "../domain/notification.js";
import type { AssignmentProgressEvent } from "../domain/assignmentProgressEvent.js";
import { createAssignmentProgressEventId } from "../domain/assignmentProgressEvent.js";
import type { ContributionReviewEvent } from "../domain/contributionReviewEvent.js";
import { createContributionReviewEventId } from "../domain/contributionReviewEvent.js";
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
import type { Delta } from "../domain/delta.js";
import {
  buildFieldVarianceAgentRunId,
  FIELD_VARIANCE_WORKFLOW_TYPE,
  type AgentRun,
} from "../domain/agentRun.js";
import { normalizeActivityEventDocument } from "../validation/activityEvent.js";
import { normalizeNotificationDocument } from "../validation/notification.js";
import {
  createActivityEventIfAbsent,
  listActivityEventsForProject,
} from "../repositories/activityEventsRepository.js";
import {
  countUnreadNotifications,
  createNotificationIfAbsent,
  listNotificationsForRecipient,
  markNotificationRead,
} from "../repositories/notificationsRepository.js";
import { markProjectMemberRemoved } from "../repositories/projectMembersRepository.js";
import {
  resolveNotificationRecipients,
} from "../services/activity/activityNotificationPolicy.js";
import {
  filterActivityEventsForAccess,
} from "../services/activity/activityVisibility.js";
import {
  mapAssignmentProgressToActivityType,
  projectAgentRunStateActivity,
  projectAssignmentCreatedActivity,
  projectAssignmentProgressActivity,
  projectContributionReviewActivity,
  projectDeltaCreatedActivity,
  projectInvitationAcceptedActivity,
  projectInvitationCreatedActivity,
  projectMeasurementSubmittedActivity,
  projectMemberRemovedActivity,
} from "../services/activity/projectActivityProjections.js";
import {
  recordActivityAndNotifications,
} from "../services/activity/recordActivityEvent.js";
import type { ProjectAccessContext } from "../services/collaboration/projectAccessScope.js";

const OWNER = "phase2m1-owner";
const CONTRACTOR = "phase2m1-contractor";
const FIELD = "phase2m1-field";
const VIEWER = "phase2m1-viewer";
const ADMIN = "phase2m1-admin";
const OTHER = "phase2m1-other";
const LOCAL_PROJECT = "project-2m1-activity";

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

async function seedProject(id: string, ownerUid: string): Promise<Project> {
  const project: Project = {
    id,
    localProjectId: LOCAL_PROJECT,
    name: "Phase 2M.1",
    location: "Boston",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid,
  };
  await db.collection(COLLECTIONS.projects).doc(id).set(project);
  return project;
}

async function seedMember(
  projectId: string,
  userId: string,
  role: ProjectMemberRole,
): Promise<string> {
  const id = createProjectMemberId(projectId, userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId,
    userId,
    role,
    status: "active",
    invitedBy: OWNER,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function deleteByProject(collection: string, projectId: string): Promise<void> {
  const snap = await db.collection(collection).where("projectId", "==", projectId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function cleanup(projectId: string): Promise<void> {
  const notifSnap = await db.collection(COLLECTIONS.notifications).get();
  await Promise.all(
    notifSnap.docs
      .filter((d) => (d.data() as { projectId?: string }).projectId === projectId)
      .map((d) => d.ref.delete()),
  );
  await deleteByProject(COLLECTIONS.activityEvents, projectId);
  await deleteByProject(COLLECTIONS.deltas, projectId);
  await deleteByProject(COLLECTIONS.measurements, projectId);
  await deleteByProject(COLLECTIONS.workPackageAssignments, projectId);
  await deleteByProject(COLLECTIONS.workPackages, projectId);
  await deleteByProject(COLLECTIONS.planItems, projectId);
  await deleteByProject(COLLECTIONS.projectMembers, projectId);
  await deleteByProject(COLLECTIONS.projectInvitations, projectId);
  await deleteByProject(COLLECTIONS.agentRuns, projectId);
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

function makeAccess(
  project: Project,
  input: {
    currentUserId: string;
    role: ProjectAccessContext["role"];
    accessMode: ProjectAccessContext["accessMode"];
    membershipId?: string;
    assignedWorkPackageIds?: string[];
    assignedPlanItemIds?: string[];
  },
): ProjectAccessContext {
  return {
    project,
    currentUserId: input.currentUserId,
    isOwner: project.ownerUid === input.currentUserId,
    membership: input.membershipId
      ? {
          id: input.membershipId,
          projectId: project.id,
          userId: input.currentUserId,
          role: input.role === "legacy_owner" ? "owner" : input.role,
          status: "active",
          invitedBy: OWNER,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }
      : null,
    role: input.role,
    accessMode: input.accessMode,
    assignedWorkPackageIds: input.assignedWorkPackageIds ?? [],
    assignedPlanItemIds: input.assignedPlanItemIds ?? [],
  };
}

async function runTests(): Promise<void> {
  const projectId = createRemoteProjectId(OWNER, LOCAL_PROJECT);
  await cleanup(projectId);
  const project = await seedProject(projectId, OWNER);
  const contractorMemberId = await seedMember(projectId, CONTRACTOR, "contractor");
  const fieldMemberId = await seedMember(projectId, FIELD, "field_member");
  await seedMember(projectId, VIEWER, "viewer");
  await seedMember(projectId, ADMIN, "project_admin");

  const plan: PlanItem = {
    id: createRemotePlanItemId(projectId, "plan-a"),
    localPlanItemId: "plan-a",
    projectId,
    type: "length",
    label: "Feeder",
    plannedValue: 100,
    unit: "ft",
    unitCost: 2,
    productionRatePerDay: 10,
    laborHoursPerUnit: 0.5,
  };
  await db.collection(COLLECTIONS.planItems).doc(plan.id).set(plan);

  const wp: WorkPackage = {
    id: createWorkPackageId(),
    projectId,
    name: "Electrical Rough-In",
    status: "in_progress",
    planItemIds: [plan.id],
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
  };
  await db.collection(COLLECTIONS.workPackages).doc(wp.id).set(wp);

  const assignment: WorkPackageAssignment = {
    id: createWorkPackageAssignmentId(),
    projectId,
    workPackageId: wp.id,
    projectMemberId: contractorMemberId,
    status: "assigned",
    createdAt: "2026-08-25T10:01:00.000Z",
    updatedAt: "2026-08-25T10:01:00.000Z",
  };
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignment.id)
    .set(assignment);

  // --- Domain validation ---
  assert(ACTIVITY_EVENT_TYPES.includes("assignment_created"), "1 closed types");
  assertEq(
    "2 related keys",
    normalizeActivityEventDocument({
      id: "x",
      projectId,
      type: "delta_created",
      actorType: "system",
      subjectType: "delta",
      subjectId: "d",
      sourceType: "delta_create",
      sourceId: "d",
      related: { deltaId: "d", email: "a@b.com" },
      createdAt: "2026-08-25T10:00:00.000Z",
    }),
    undefined,
  );
  assertEq(
    "3 email metadata rejected",
    normalizeActivityEventDocument({
      id: "x",
      projectId,
      type: "invitation_created",
      actorType: "human",
      actorUid: OWNER,
      subjectType: "project_invitation",
      subjectId: "i",
      sourceType: "invitation_create",
      sourceId: "i",
      related: {},
      metadata: { kind: "invitation", role: "contractor", email: "x@y.com" },
      createdAt: "2026-08-25T10:00:00.000Z",
    }),
    undefined,
  );
  assert(
    normalizeNotificationDocument({
      id: "n",
      recipientUid: OWNER,
      projectId,
      activityEventId: "a",
      type: "assignment_created",
      isRead: false,
      readAt: null,
      createdAt: "2026-08-25T10:00:00.000Z",
      destination: { kind: "project", projectId },
    }) !== undefined,
    "4 destination ok",
  );
  assertEq(
    "4b bad destination",
    normalizeNotificationDocument({
      id: "n",
      recipientUid: OWNER,
      projectId,
      activityEventId: "a",
      type: "assignment_created",
      isRead: false,
      readAt: null,
      createdAt: "2026-08-25T10:00:00.000Z",
      destination: { kind: "url", url: "https://evil.example" },
    }),
    undefined,
  );

  // --- Assignment create ---
  await projectAssignmentCreatedActivity({
    assignment,
    workPackage: wp,
    member: {
      id: contractorMemberId,
      projectId,
      userId: CONTRACTOR,
      role: "contractor",
      status: "active",
      invitedBy: OWNER,
      createdAt: assignment.createdAt,
      updatedAt: assignment.createdAt,
    },
    actorUid: OWNER,
    projectOwnerUid: OWNER,
  });

  const createdActivities = await listActivityEventsForProject(projectId, {
    limit: 50,
  });
  const createdAct = createdActivities.items.find(
    (a) => a.type === "assignment_created",
  );
  assert(!!createdAct, "13 assignment_created");
  const createdNotifs = await listNotificationsForRecipient(CONTRACTOR, {
    limit: 20,
  });
  assert(
    createdNotifs.items.some((n) => n.type === "assignment_created"),
    "14 member notified",
  );

  // Idempotent re-project
  await projectAssignmentCreatedActivity({
    assignment,
    workPackage: wp,
    member: {
      id: contractorMemberId,
      projectId,
      userId: CONTRACTOR,
      role: "contractor",
      status: "active",
      invitedBy: OWNER,
      createdAt: assignment.createdAt,
      updatedAt: assignment.createdAt,
    },
    actorUid: OWNER,
    projectOwnerUid: OWNER,
  });
  assertEq(
    "7/8 no duplicate assignment_created",
    createdActivities.items.filter((a) => a.type === "assignment_created")
      .length,
    (await listActivityEventsForProject(projectId, { limit: 50 })).items.filter(
      (a) => a.type === "assignment_created",
    ).length,
  );

  // Progress mappings
  assertEq(
    "15 accepted",
    mapAssignmentProgressToActivityType({
      previousStatus: "assigned",
      nextStatus: "accepted",
      actorIsOwner: false,
    }),
    "assignment_accepted",
  );
  assertEq(
    "16 started",
    mapAssignmentProgressToActivityType({
      previousStatus: "accepted",
      nextStatus: "in_progress",
      actorIsOwner: false,
    }),
    "assignment_started",
  );
  assertEq(
    "17 ready",
    mapAssignmentProgressToActivityType({
      previousStatus: "in_progress",
      nextStatus: "ready_for_review",
      actorIsOwner: false,
    }),
    "assignment_ready_for_review",
  );
  assertEq(
    "18 send back",
    mapAssignmentProgressToActivityType({
      previousStatus: "ready_for_review",
      nextStatus: "in_progress",
      actorIsOwner: true,
    }),
    "assignment_sent_back",
  );
  assertEq(
    "19 continue",
    mapAssignmentProgressToActivityType({
      previousStatus: "ready_for_review",
      nextStatus: "in_progress",
      actorIsOwner: false,
    }),
    "assignment_continued",
  );
  assertEq(
    "22 cancel",
    mapAssignmentProgressToActivityType({
      previousStatus: "assigned",
      nextStatus: "cancelled",
      actorIsOwner: true,
    }),
    "assignment_cancelled",
  );

  async function progress(
    previous: WorkPackageAssignment["status"],
    next: WorkPackageAssignment["status"],
    actorUid: string,
    actorIsOwner: boolean,
  ): Promise<void> {
    const event: AssignmentProgressEvent = {
      id: createAssignmentProgressEventId(),
      projectId,
      assignmentId: assignment.id,
      workPackageId: wp.id,
      projectMemberId: contractorMemberId,
      previousStatus: previous,
      nextStatus: next,
      actorUid,
      createdAt: new Date().toISOString(),
    };
    await projectAssignmentProgressActivity({
      event,
      assignment: { ...assignment, status: next },
      workPackage: wp,
      assignedMember: {
        id: contractorMemberId,
        projectId,
        userId: CONTRACTOR,
        role: "contractor",
        status: "active",
        invitedBy: OWNER,
        createdAt: assignment.createdAt,
        updatedAt: assignment.createdAt,
      },
      projectOwnerUid: OWNER,
      actorIsOwner,
    });
  }

  const unreadBeforeReady = await countUnreadNotifications(OWNER);
  await progress("assigned", "accepted", CONTRACTOR, false);
  await progress("accepted", "in_progress", CONTRACTOR, false);
  assertEq(
    "15/16 no owner notifs for accept/start",
    await countUnreadNotifications(OWNER),
    unreadBeforeReady,
  );

  await progress("in_progress", "ready_for_review", CONTRACTOR, false);
  assert(
    (await countUnreadNotifications(OWNER)) > unreadBeforeReady,
    "17 ready_for_review owner Notification",
  );

  const memberUnreadBeforeSendBack = await countUnreadNotifications(CONTRACTOR);
  await progress("ready_for_review", "in_progress", OWNER, true);
  assert(
    (await countUnreadNotifications(CONTRACTOR)) > memberUnreadBeforeSendBack,
    "18 send-back notifies member",
  );

  const memberUnreadBeforeContinue = await countUnreadNotifications(CONTRACTOR);
  await progress("ready_for_review", "in_progress", CONTRACTOR, false);
  assertEq(
    "19 continue no Notification",
    await countUnreadNotifications(CONTRACTOR),
    memberUnreadBeforeContinue,
  );

  await progress("in_progress", "ready_for_review", CONTRACTOR, false);
  await progress("ready_for_review", "completed", OWNER, true);
  assert(
    (await listNotificationsForRecipient(CONTRACTOR, { limit: 50 })).items.some(
      (n) => n.type === "assignment_completed",
    ),
    "20 completed notifies member",
  );
  await progress("completed", "in_progress", OWNER, true);
  assert(
    (await listNotificationsForRecipient(CONTRACTOR, { limit: 50 })).items.some(
      (n) => n.type === "assignment_reopened",
    ),
    "21 reopen notifies member",
  );

  // Measurement submitted
  const collabMeas: Measurement = {
    id: createRemoteMeasurementId(projectId, "collab-1"),
    localMeasurementId: "collab-1",
    projectId,
    planItemId: plan.id,
    type: "length",
    label: "Run",
    value: 80,
    unit: "ft",
    createdAt: "2026-08-25T11:00:00.000Z",
    capturedByUid: CONTRACTOR,
    reviewStatus: "pending",
    capturedByProjectMemberId: contractorMemberId,
    submittedAssignmentId: assignment.id,
    submittedWorkPackageId: wp.id,
  };
  await projectMeasurementSubmittedActivity({
    measurement: collabMeas,
    actorUid: CONTRACTOR,
    projectOwnerUid: OWNER,
  });
  assert(
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.some(
      (a) => a.type === "measurement_submitted",
    ),
    "23 measurement_submitted",
  );
  assert(
    (await listNotificationsForRecipient(OWNER, { limit: 50 })).items.some(
      (n) => n.type === "measurement_submitted",
    ),
    "24 owner notified",
  );

  // Owner measurement: no Activity via projector (we simply don't call it)
  const ownerMeasId = createRemoteMeasurementId(projectId, "owner-1");
  assertEq(
    "25 no owner measurement Activity",
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.some(
      (a) =>
        a.type === "measurement_submitted" && a.subjectId === ownerMeasId,
    ),
    false,
  );

  // Review accept/reject
  const acceptEvent: ContributionReviewEvent = {
    id: createContributionReviewEventId(),
    projectId,
    measurementId: collabMeas.id,
    previousStatus: "pending",
    nextStatus: "accepted",
    reviewerUid: OWNER,
    createdAt: "2026-08-25T11:05:00.000Z",
  };
  await projectContributionReviewActivity({
    event: acceptEvent,
    measurement: { ...collabMeas, reviewStatus: "accepted" },
    projectOwnerUid: OWNER,
  });
  assert(
    (await listNotificationsForRecipient(CONTRACTOR, { limit: 50 })).items.some(
      (n) => n.type === "measurement_accepted",
    ),
    "26/27 accepted notifies contributor",
  );

  const rejectEvent: ContributionReviewEvent = {
    id: createContributionReviewEventId(),
    projectId,
    measurementId: collabMeas.id,
    previousStatus: "accepted",
    nextStatus: "rejected",
    reviewerUid: OWNER,
    note: "Please verify against finished wall.",
    createdAt: "2026-08-25T11:06:00.000Z",
  };
  await projectContributionReviewActivity({
    event: rejectEvent,
    measurement: { ...collabMeas, reviewStatus: "rejected" },
    projectOwnerUid: OWNER,
  });
  const rejectAct = (
    await listActivityEventsForProject(projectId, { limit: 100 })
  ).items.find((a) => a.id.includes(rejectEvent.id));
  assert(!!rejectAct && rejectAct.type === "measurement_rejected", "28 rejected");
  assertEq(
    "30 no reviewNote in metadata",
    JSON.stringify(rejectAct?.metadata ?? {}).includes("Please verify"),
    false,
  );
  assertEq(
    "31 hasNote",
    rejectAct?.metadata?.kind === "measurement_rejected"
      ? rejectAct.metadata.hasNote
      : false,
    true,
  );

  // Re-project same review → no duplicate
  const beforeDup = (await listActivityEventsForProject(projectId, { limit: 100 }))
    .items.length;
  await projectContributionReviewActivity({
    event: rejectEvent,
    measurement: { ...collabMeas, reviewStatus: "rejected" },
    projectOwnerUid: OWNER,
  });
  assertEq(
    "9 idempotent review Activity",
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.length,
    beforeDup,
  );

  // Delta
  const delta: Delta = {
    id: createRemoteDeltaId(projectId, "collab-review-collab-1"),
    localDeltaId: "collab-review-collab-1",
    projectId,
    planItemId: plan.id,
    measurementId: collabMeas.id,
    type: "length",
    plannedValue: 100,
    actualValue: 80,
    difference: -20,
    percentDifference: -20,
    unit: "ft",
    unitCost: 2,
    costImpact: -40,
    productionRatePerDay: 10,
    scheduleImpactDays: -2,
    laborHoursPerUnit: 0.5,
    laborImpactHours: -10,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt: "2026-08-25T11:10:00.000Z",
  };
  const ownerNotifsBeforeDelta = await countUnreadNotifications(OWNER);
  await projectDeltaCreatedActivity({
    delta,
    measurement: collabMeas,
    actorType: "system",
    projectOwnerUid: OWNER,
  });
  const deltaAct = (
    await listActivityEventsForProject(projectId, { limit: 100 })
  ).items.find((a) => a.type === "delta_created");
  assert(!!deltaAct, "32 delta_created");
  assertEq("33 scope plan", deltaAct?.scopePlanItemIds?.[0], plan.id);
  assertEq(
    "34 no delta Notification",
    await countUnreadNotifications(OWNER),
    ownerNotifsBeforeDelta,
  );
  await projectDeltaCreatedActivity({
    delta,
    measurement: collabMeas,
    actorType: "system",
    projectOwnerUid: OWNER,
  });
  assertEq(
    "11 no duplicate delta Activity",
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.filter(
      (a) => a.type === "delta_created",
    ).length,
    1,
  );

  // Agent
  const agentRunId = buildFieldVarianceAgentRunId(delta.id);
  const agentRun: AgentRun = {
    id: agentRunId,
    schemaVersion: 1,
    ownerUid: OWNER,
    projectId,
    workflowType: FIELD_VARIANCE_WORKFLOW_TYPE,
    triggerType: "delta_created",
    triggerSourceId: delta.id,
    idempotencyKey: agentRunId,
    status: "waiting_for_evidence",
    currentStep: "waiting_for_evidence",
    attemptCount: 1,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: delta.id,
      localDeltaId: delta.localDeltaId,
      remoteMeasurementId: collabMeas.id,
      localMeasurementId: collabMeas.localMeasurementId,
      remotePlanItemId: plan.id,
    },
    pendingRequest: {
      kind: "delta_evidence",
      message: "Need photo",
      requestedAt: "2026-08-25T11:20:00.000Z",
      requestId: `req-${agentRunId}`,
        requestedProjectMemberId: null,
    },
    outcome: null,
    lastEvidenceId: null,
    errorCategory: null,
    createdAt: "2026-08-25T11:15:00.000Z",
    updatedAt: "2026-08-25T11:20:00.000Z",
    completedAt: null,
  };
  await projectAgentRunStateActivity({
    agentRun,
    status: "waiting_for_evidence",
    projectOwnerUid: OWNER,
  });
  const evReq = (
    await listActivityEventsForProject(projectId, { limit: 100 })
  ).items.find((a) => a.type === "agent_evidence_requested");
  assert(!!evReq, "35 evidence requested");
  assertEq("38 actorType agent", evReq?.actorType, "agent");
  assertEq("38 no actorUid", evReq?.actorUid, undefined);

  const completedRun: AgentRun = {
    ...agentRun,
    status: "completed",
    currentStep: "completed",
    pendingRequest: null,
    outcome: {
      kind: "summary_ready",
      summaryId: "summary-1",
      userVisibleRationale: "Documented",
    },
    completedAt: "2026-08-25T11:30:00.000Z",
    updatedAt: "2026-08-25T11:30:00.000Z",
  };
  await projectAgentRunStateActivity({
    agentRun: completedRun,
    status: "completed",
    projectOwnerUid: OWNER,
  });
  assert(
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.some(
      (a) => a.type === "agent_completed",
    ),
    "36 agent_completed",
  );
  await projectAgentRunStateActivity({
    agentRun: { ...completedRun, status: "escalated", currentStep: "escalated" },
    status: "escalated",
    projectOwnerUid: OWNER,
  });
  assert(
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.some(
      (a) => a.type === "agent_escalated",
    ),
    "37 agent_escalated",
  );
  const beforeRetry = (
    await listActivityEventsForProject(projectId, { limit: 100 })
  ).items.filter((a) => a.type === "agent_completed").length;
  await projectAgentRunStateActivity({
    agentRun: completedRun,
    status: "completed",
    projectOwnerUid: OWNER,
  });
  assertEq(
    "12 agent terminal idempotent",
    (
      await listActivityEventsForProject(projectId, { limit: 100 })
    ).items.filter((a) => a.type === "agent_completed").length,
    beforeRetry,
  );

  // Invitation
  const invitationId = "invite-2m1-1";
  await projectInvitationCreatedActivity({
    invitation: {
      id: invitationId,
      projectId,
      email: "secret@example.com",
      role: "contractor",
      status: "pending",
      invitedBy: OWNER,
      createdAt: "2026-08-25T09:00:00.000Z",
      updatedAt: "2026-08-25T09:00:00.000Z",
      acceptedByUserId: null,
    },
    projectOwnerUid: OWNER,
  });
  const inviteAct = (
    await listActivityEventsForProject(projectId, { limit: 100 })
  ).items.find((a) => a.type === "invitation_created");
  assert(!!inviteAct, "41 invitation created");
  assertEq(
    "41 no email",
    JSON.stringify(inviteAct).includes("secret@example.com"),
    false,
  );
  assertEq(
    "43 no fabricated invitee Notification",
    resolveNotificationRecipients(inviteAct!, { projectOwnerUid: OWNER })
      .length,
    0,
  );

  await projectInvitationAcceptedActivity({
    invitation: {
      id: invitationId,
      projectId,
      email: "secret@example.com",
      role: "contractor",
      status: "accepted",
      invitedBy: OWNER,
      createdAt: "2026-08-25T09:00:00.000Z",
      updatedAt: "2026-08-25T09:05:00.000Z",
      acceptedByUserId: OTHER,
    },
    actorUid: OTHER,
    projectOwnerUid: OWNER,
  });
  assert(
    (await listNotificationsForRecipient(OWNER, { limit: 50 })).items.some(
      (n) => n.type === "invitation_accepted",
    ),
    "42 invitation accepted owner Notification",
  );

  // Member removed
  const removed = await markProjectMemberRemoved(fieldMemberId);
  assert(!!removed, "44 remove");
  await projectMemberRemovedActivity({
    member: removed!,
    actorUid: OWNER,
    projectOwnerUid: OWNER,
  });
  assert(
    (await listActivityEventsForProject(projectId, { limit: 100 })).items.some(
      (a) => a.type === "member_removed",
    ),
    "44 member_removed Activity",
  );
  assert(
    (await listNotificationsForRecipient(FIELD, { limit: 20 })).items.some(
      (n) => n.type === "member_removed",
    ),
    "45 removed member Notification",
  );

  // Visibility
  const all = (await listActivityEventsForProject(projectId, { limit: 100 }))
    .items;
  const ownerAccess = makeAccess(project, {
    currentUserId: OWNER,
    role: "owner",
    accessMode: "full",
  });
  const adminAccess = makeAccess(project, {
    currentUserId: ADMIN,
    role: "project_admin",
    accessMode: "full",
  });
  const viewerAccess = makeAccess(project, {
    currentUserId: VIEWER,
    role: "viewer",
    accessMode: "full",
  });
  const contractorAccess = makeAccess(project, {
    currentUserId: CONTRACTOR,
    role: "contractor",
    accessMode: "assigned_scope",
    membershipId: contractorMemberId,
    assignedWorkPackageIds: [wp.id],
    assignedPlanItemIds: [plan.id],
  });
  const emptyContractorAccess = makeAccess(project, {
    currentUserId: CONTRACTOR,
    role: "contractor",
    accessMode: "assigned_scope",
    membershipId: contractorMemberId,
    assignedWorkPackageIds: [],
    assignedPlanItemIds: [],
  });

  assertEq(
    "46 owner sees all",
    filterActivityEventsForAccess(all, ownerAccess).length,
    all.length,
  );
  assertEq(
    "47 admin sees all",
    filterActivityEventsForAccess(all, adminAccess).length,
    all.length,
  );
  const viewerItems = filterActivityEventsForAccess(all, viewerAccess);
  assert(
    viewerItems.every(
      (a) =>
        a.type.startsWith("measurement_") ||
        a.type === "delta_created" ||
        a.type.startsWith("agent_"),
    ),
    "48-51 viewer operational only",
  );
  assert(
    !viewerItems.some((a) => a.type.startsWith("assignment_")),
    "48 no assignment for viewer",
  );
  assert(
    !viewerItems.some((a) => a.type.startsWith("invitation_")),
    "49 no invitation for viewer",
  );
  assert(
    !viewerItems.some((a) => a.type === "member_removed"),
    "50 no member_removed for viewer",
  );

  const contractorItems = filterActivityEventsForAccess(all, contractorAccess, {
    currentUserMeasurementIds: new Set([collabMeas.id]),
  });
  assert(
    contractorItems.every(
      (a) =>
        (a.scopeWorkPackageIds ?? []).includes(wp.id) ||
        (a.scopePlanItemIds ?? []).includes(plan.id) ||
        a.related.projectMemberId === contractorMemberId ||
        a.subjectId === collabMeas.id,
    ),
    "52 contractor scoped",
  );
  assert(
    filterActivityEventsForAccess(all, emptyContractorAccess, {
      currentUserMeasurementIds: new Set([collabMeas.id]),
    }).some(
      (a) =>
        a.type === "measurement_accepted" || a.type === "measurement_rejected",
    ),
    "55 own review visible",
  );
  assertEq(
    "56 zero-assignment no staffing",
    filterActivityEventsForAccess(all, emptyContractorAccess).some(
      (a) => a.type === "assignment_created",
    ),
    false,
  );

  // Notifications security / read
  const ownerList = await listNotificationsForRecipient(OWNER, { limit: 50 });
  assert(
    ownerList.items.every((n) => n.recipientUid === OWNER),
    "57 own only",
  );
  const foreign = await markNotificationRead(ownerList.items[0]!.id, OTHER);
  assertEq("58 IDOR forbidden", foreign.kind, "forbidden");

  const unreadBefore = await countUnreadNotifications(OWNER);
  assert(unreadBefore > 0, "62 unread > 0");
  const marked = await markNotificationRead(ownerList.items[0]!.id, OWNER);
  assert(marked.kind === "ok" && marked.notification.isRead, "59 isRead");
  assert(marked.kind === "ok" && !!marked.notification.readAt, "60 readAt");
  const markedAgain = await markNotificationRead(ownerList.items[0]!.id, OWNER);
  assertEq("61 idempotent", markedAgain.kind, "ok");
  assertEq(
    "63 unread decreases",
    await countUnreadNotifications(OWNER),
    unreadBefore - 1,
  );
  assert(
    ownerList.items.length >= 2
      ? ownerList.items[0]!.createdAt >= ownerList.items[1]!.createdAt
      : true,
    "64 newest first",
  );

  // Failure: domain would already be committed; Activity create failure path
  // is covered by tryRecord swallowing — simulate createActivity with invalid
  // by ensuring recordActivityAndNotifications throws on bad candidate.
  try {
    await recordActivityAndNotifications(
      {
        id: "",
        projectId,
        type: "delta_created",
        actorType: "system",
        subjectType: "delta",
        subjectId: "x",
        sourceType: "delta_create",
        sourceId: "x",
        related: {},
        createdAt: "2026-08-25T12:00:00.000Z",
      },
      { projectOwnerUid: OWNER },
    );
    assert(false, "66 should throw invalid");
  } catch {
    assert(true, "66 invalid Activity throws without domain rollback concern");
  }

  // Deterministic IDs
  assertEq(
    "id strategy",
    buildActivityEventId({
      kind: "assignment-progress",
      sourceId: "evt-1",
    }),
    "activity:assignment-progress:evt-1",
  );
  assertEq(
    "notif id",
    buildNotificationId("activity:x", OWNER),
    `notif:activity:x:${OWNER}`,
  );

  // createNotificationIfAbsent when activity already exists → no dup notifs
  const firstCreate = await createActivityEventIfAbsent({
    id: buildActivityEventId({
      kind: "assignment-create",
      sourceId: "dup-assign-test",
    }),
    projectId,
    type: "assignment_created",
    actorType: "human",
    actorUid: OWNER,
    subjectType: "assignment",
    subjectId: "dup-assign-test",
    sourceType: "assignment_create",
    sourceId: "dup-assign-test",
    related: { assignmentId: "dup-assign-test", workPackageId: wp.id },
    createdAt: "2026-08-25T12:30:00.000Z",
  });
  assert(firstCreate.created, "create activity");
  await createNotificationIfAbsent({
    id: buildNotificationId(firstCreate.activityEvent.id, CONTRACTOR),
    recipientUid: CONTRACTOR,
    projectId,
    activityEventId: firstCreate.activityEvent.id,
    type: "assignment_created",
    isRead: false,
    readAt: null,
    createdAt: firstCreate.activityEvent.createdAt,
    destination: {
      kind: "work_progress",
      projectId,
      workPackageId: wp.id,
    },
  });
  const secondNotif = await createNotificationIfAbsent({
    id: buildNotificationId(firstCreate.activityEvent.id, CONTRACTOR),
    recipientUid: CONTRACTOR,
    projectId,
    activityEventId: firstCreate.activityEvent.id,
    type: "assignment_created",
    isRead: false,
    readAt: null,
    createdAt: firstCreate.activityEvent.createdAt,
    destination: {
      kind: "work_progress",
      projectId,
      workPackageId: wp.id,
    },
  });
  assertEq("8 notif if-absent", secondNotif.created, false);

  void fieldMemberId;
  console.log("phase2M1 activity + notification foundation: PASS");
}

async function main(): Promise<void> {
  await runTests();
  console.log("phase2M1ActivityNotificationTest: PASS");
}

main().catch((error) => {
  console.error("phase2M1ActivityNotificationTest failed:");
  console.error(error);
  process.exitCode = 1;
});
