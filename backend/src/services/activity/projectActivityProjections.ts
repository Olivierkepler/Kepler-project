import type { ActivityEvent } from "../../domain/activityEvent.js";
import { buildActivityEventId } from "../../domain/activityEvent.js";
import type { AssignmentProgressEvent } from "../../domain/assignmentProgressEvent.js";
import type { ContributionReviewEvent } from "../../domain/contributionReviewEvent.js";
import type { AgentRun } from "../../domain/agentRun.js";
import type { Delta } from "../../domain/delta.js";
import type { Measurement } from "../../domain/measurement.js";
import type { ProjectInvitation } from "../../domain/projectInvitation.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import type { WorkPackage } from "../../domain/workPackage.js";
import type { WorkPackageAssignment } from "../../domain/workPackageAssignment.js";
import type { WorkPackageAssignmentStatus } from "../../domain/workPackageAssignment.js";
import type { TeamWorkPackageAssignment } from "../../domain/teamWorkPackageAssignment.js";
import type { Team } from "../../domain/team.js";
import { tryRecordActivityAndNotifications } from "./recordActivityEvent.js";
import type { ActivityNotificationPolicyContext } from "./activityNotificationPolicy.js";

function nowOr(value?: string): string {
  return value && value.trim().length > 0 ? value : new Date().toISOString();
}

/**
 * Maps AssignmentProgressEvent → Activity type using previous/next + actor authority.
 */
export function mapAssignmentProgressToActivityType(input: {
  previousStatus: WorkPackageAssignmentStatus | null;
  nextStatus: WorkPackageAssignmentStatus;
  actorIsOwner: boolean;
}): ActivityEvent["type"] | null {
  const { previousStatus, nextStatus, actorIsOwner } = input;

  if (nextStatus === "accepted") {
    return "assignment_accepted";
  }

  if (nextStatus === "in_progress" && previousStatus === "accepted") {
    return "assignment_started";
  }

  if (nextStatus === "ready_for_review") {
    return "assignment_ready_for_review";
  }

  if (
    nextStatus === "in_progress" &&
    previousStatus === "ready_for_review"
  ) {
    return actorIsOwner ? "assignment_sent_back" : "assignment_continued";
  }

  if (nextStatus === "completed") {
    return "assignment_completed";
  }

  if (
    nextStatus === "in_progress" &&
    previousStatus === "completed"
  ) {
    return "assignment_reopened";
  }

  if (nextStatus === "cancelled") {
    return "assignment_cancelled";
  }

  return null;
}

export async function projectAssignmentCreatedActivity(input: {
  assignment: WorkPackageAssignment;
  workPackage: WorkPackage;
  member: ProjectMember;
  actorUid: string;
  projectOwnerUid: string;
}): Promise<void> {
  const { assignment, workPackage, member, actorUid, projectOwnerUid } = input;

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "assignment-create",
      sourceId: assignment.id,
    }),
    projectId: assignment.projectId,
    type: "assignment_created",
    actorType: "human",
    actorUid,
    subjectType: "assignment",
    subjectId: assignment.id,
    sourceType: "assignment_create",
    sourceId: assignment.id,
    related: {
      assignmentId: assignment.id,
      workPackageId: assignment.workPackageId,
      projectMemberId: assignment.projectMemberId,
    },
    scopeWorkPackageIds: [assignment.workPackageId],
    scopePlanItemIds: [...workPackage.planItemIds],
    createdAt: nowOr(assignment.createdAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid,
    assignedMemberUid: member.userId,
  });
}

export async function projectTeamAssignmentActivity(input: {
  assignment: TeamWorkPackageAssignment;
  team: Team;
  workPackage: WorkPackage;
  actorUid: string;
  projectOwnerUid: string;
  action: "created" | "removed";
}): Promise<void> {
  const { assignment, team, workPackage } = input;
  const sourceType = input.action === "created" ? "team_assignment_create" : "team_assignment_remove";
  const type = input.action === "created" ? "team_assignment_created" : "team_assignment_removed";
  const kind = input.action === "created" ? "team-assignment-create" : "team-assignment-remove";
  const activity: ActivityEvent = {
    id: buildActivityEventId({ kind, sourceId: assignment.id }),
    projectId: assignment.projectId,
    type,
    actorType: "human",
    actorUid: input.actorUid,
    subjectType: "team_assignment",
    subjectId: assignment.id,
    sourceType,
    sourceId: assignment.id,
    related: { teamId: team.id, workPackageId: workPackage.id },
    scopeWorkPackageIds: [workPackage.id],
    scopePlanItemIds: [...workPackage.planItemIds],
    createdAt: assignment.updatedAt,
  };
  await tryRecordActivityAndNotifications(activity, { projectOwnerUid: input.projectOwnerUid });
}

export async function projectAssignmentProgressActivity(input: {
  event: AssignmentProgressEvent;
  assignment: WorkPackageAssignment;
  workPackage?: WorkPackage;
  assignedMember?: ProjectMember;
  projectOwnerUid: string;
  actorIsOwner: boolean;
}): Promise<void> {
  const type = mapAssignmentProgressToActivityType({
    previousStatus: input.event.previousStatus,
    nextStatus: input.event.nextStatus,
    actorIsOwner: input.actorIsOwner,
  });

  if (!type) {
    return;
  }

  const planItemIds = input.workPackage?.planItemIds ?? [];

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "assignment-progress",
      sourceId: input.event.id,
    }),
    projectId: input.event.projectId,
    type,
    actorType: "human",
    actorUid: input.event.actorUid,
    subjectType: "assignment",
    subjectId: input.event.assignmentId,
    sourceType: "assignment_progress_event",
    sourceId: input.event.id,
    related: {
      assignmentId: input.event.assignmentId,
      workPackageId: input.event.workPackageId,
      projectMemberId: input.event.projectMemberId,
    },
    scopeWorkPackageIds: [input.event.workPackageId],
    ...(planItemIds.length > 0 ? { scopePlanItemIds: [...planItemIds] } : {}),
    createdAt: nowOr(input.event.createdAt),
  };

  const policy: ActivityNotificationPolicyContext = {
    projectOwnerUid: input.projectOwnerUid,
    assignedMemberUid: input.assignedMember?.userId,
  };

  await tryRecordActivityAndNotifications(activity, policy);
}

export async function projectMeasurementSubmittedActivity(input: {
  measurement: Measurement;
  actorUid: string;
  projectOwnerUid: string;
}): Promise<void> {
  const m = input.measurement;

  const related: ActivityEvent["related"] = {
    measurementId: m.id,
    planItemId: m.planItemId,
  };

  if (m.submittedWorkPackageId) {
    related.workPackageId = m.submittedWorkPackageId;
  }
  if (m.submittedAssignmentId) {
    related.assignmentId = m.submittedAssignmentId;
  }
  if (m.capturedByProjectMemberId) {
    related.projectMemberId = m.capturedByProjectMemberId;
  }

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "measurement-create",
      sourceId: m.id,
    }),
    projectId: m.projectId,
    type: "measurement_submitted",
    actorType: "human",
    actorUid: input.actorUid,
    subjectType: "measurement",
    subjectId: m.id,
    sourceType: "measurement_create",
    sourceId: m.id,
    related,
    scopePlanItemIds: [m.planItemId],
    ...(m.submittedWorkPackageId
      ? { scopeWorkPackageIds: [m.submittedWorkPackageId] }
      : {}),
    createdAt: nowOr(m.createdAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid: input.projectOwnerUid,
  });
}

export async function projectContributionReviewActivity(input: {
  event: ContributionReviewEvent;
  measurement: Measurement;
  projectOwnerUid: string;
}): Promise<void> {
  const { event, measurement } = input;

  if (event.nextStatus !== "accepted" && event.nextStatus !== "rejected") {
    return;
  }

  const type =
    event.nextStatus === "accepted"
      ? ("measurement_accepted" as const)
      : ("measurement_rejected" as const);

  const related: ActivityEvent["related"] = {
    measurementId: measurement.id,
    planItemId: measurement.planItemId,
  };

  if (measurement.submittedWorkPackageId) {
    related.workPackageId = measurement.submittedWorkPackageId;
  }
  if (measurement.submittedAssignmentId) {
    related.assignmentId = measurement.submittedAssignmentId;
  }
  if (measurement.capturedByProjectMemberId) {
    related.projectMemberId = measurement.capturedByProjectMemberId;
  }

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "contribution-review",
      sourceId: event.id,
    }),
    projectId: event.projectId,
    type,
    actorType: "human",
    actorUid: event.reviewerUid,
    subjectType: "measurement",
    subjectId: measurement.id,
    sourceType: "contribution_review_event",
    sourceId: event.id,
    related,
    scopePlanItemIds: [measurement.planItemId],
    ...(measurement.submittedWorkPackageId
      ? { scopeWorkPackageIds: [measurement.submittedWorkPackageId] }
      : {}),
    createdAt: nowOr(event.createdAt),
    ...(type === "measurement_rejected"
      ? {
          metadata: {
            kind: "measurement_rejected" as const,
            hasNote: typeof event.note === "string" && event.note.length > 0,
          },
        }
      : {}),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid: input.projectOwnerUid,
    contributorUid: measurement.capturedByUid,
  });
}

export async function projectDeltaCreatedActivity(input: {
  delta: Delta;
  measurement?: Measurement;
  actorType: "human" | "system";
  actorUid?: string;
  projectOwnerUid: string;
}): Promise<void> {
  const { delta, measurement, actorType, actorUid, projectOwnerUid } = input;

  if (actorType === "human" && (!actorUid || !actorUid.trim())) {
    return;
  }

  const related: ActivityEvent["related"] = {
    deltaId: delta.id,
    measurementId: delta.measurementId,
    planItemId: delta.planItemId,
  };

  if (measurement?.submittedWorkPackageId) {
    related.workPackageId = measurement.submittedWorkPackageId;
  }

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "delta-create",
      sourceId: delta.id,
    }),
    projectId: delta.projectId,
    type: "delta_created",
    actorType,
    ...(actorType === "human" && actorUid
      ? { actorUid: actorUid.trim() }
      : {}),
    subjectType: "delta",
    subjectId: delta.id,
    sourceType: "delta_create",
    sourceId: delta.id,
    related,
    scopePlanItemIds: [delta.planItemId],
    ...(measurement?.submittedWorkPackageId
      ? { scopeWorkPackageIds: [measurement.submittedWorkPackageId] }
      : {}),
    createdAt: nowOr(delta.createdAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid,
  });
}

export async function projectAgentRunStateActivity(input: {
  agentRun: AgentRun;
  status: "waiting_for_evidence" | "completed" | "escalated";
  projectOwnerUid: string;
}): Promise<void> {
  const { agentRun, status, projectOwnerUid } = input;

  if (status === "waiting_for_evidence") {
    const requestId = agentRun.pendingRequest?.requestId;
    if (!requestId) {
      return;
    }

    let assignedMemberUid: string | undefined;
    const requestedMemberId =
      agentRun.pendingRequest?.requestedProjectMemberId?.trim() ?? "";
    if (requestedMemberId) {
      try {
        const { getProjectMemberById } = await import(
          "../../repositories/projectMembersRepository.js"
        );
        const member = await getProjectMemberById(requestedMemberId);
        if (
          member &&
          member.projectId === agentRun.projectId &&
          member.status === "active" &&
          member.userId.trim()
        ) {
          assignedMemberUid = member.userId.trim();
        }
      } catch {
        // Recipient lookup is best-effort; owner notification still proceeds.
      }
    }

    const activity: ActivityEvent = {
      id: buildActivityEventId({
        kind: "agent-evidence-requested",
        sourceId: agentRun.id,
        suffix: requestId,
      }),
      projectId: agentRun.projectId,
      type: "agent_evidence_requested",
      actorType: "agent",
      subjectType: "agent_run",
      subjectId: agentRun.id,
      sourceType: "agent_run_state",
      sourceId: `${agentRun.id}:${requestId}`,
      related: {
        agentRunId: agentRun.id,
        deltaId: agentRun.contextRefs.remoteDeltaId,
        measurementId: agentRun.contextRefs.remoteMeasurementId,
        planItemId: agentRun.contextRefs.remotePlanItemId,
      },
      scopePlanItemIds: [agentRun.contextRefs.remotePlanItemId],
      metadata: {
        kind: "agent_evidence_requested",
        requestId,
        ...(requestedMemberId
          ? { requestedProjectMemberId: requestedMemberId }
          : {}),
      },
      createdAt: nowOr(agentRun.updatedAt),
    };

    await tryRecordActivityAndNotifications(activity, {
      projectOwnerUid,
      ...(assignedMemberUid ? { assignedMemberUid } : {}),
    });
    return;
  }

  if (status === "completed") {
    const summaryId = agentRun.outcome?.summaryId ?? "";
    const activity: ActivityEvent = {
      id: buildActivityEventId({
        kind: "agent-terminal",
        sourceId: agentRun.id,
        suffix: "completed",
      }),
      projectId: agentRun.projectId,
      type: "agent_completed",
      actorType: "agent",
      subjectType: "agent_run",
      subjectId: agentRun.id,
      sourceType: "agent_run_state",
      sourceId: `${agentRun.id}:completed`,
      related: {
        agentRunId: agentRun.id,
        deltaId: agentRun.contextRefs.remoteDeltaId,
        measurementId: agentRun.contextRefs.remoteMeasurementId,
        planItemId: agentRun.contextRefs.remotePlanItemId,
      },
      scopePlanItemIds: [agentRun.contextRefs.remotePlanItemId],
      createdAt: nowOr(agentRun.completedAt ?? agentRun.updatedAt),
      ...(summaryId
        ? {
            metadata: {
              kind: "agent_completed" as const,
              summaryId,
              ...(agentRun.outcome?.kind
                ? { outcomeKind: agentRun.outcome.kind }
                : {}),
            },
          }
        : {}),
    };

    await tryRecordActivityAndNotifications(activity, { projectOwnerUid });
    return;
  }

  // escalated
  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "agent-terminal",
      sourceId: agentRun.id,
      suffix: "escalated",
    }),
    projectId: agentRun.projectId,
    type: "agent_escalated",
    actorType: "agent",
    subjectType: "agent_run",
    subjectId: agentRun.id,
    sourceType: "agent_run_state",
    sourceId: `${agentRun.id}:escalated`,
    related: {
      agentRunId: agentRun.id,
      deltaId: agentRun.contextRefs.remoteDeltaId,
      measurementId: agentRun.contextRefs.remoteMeasurementId,
      planItemId: agentRun.contextRefs.remotePlanItemId,
    },
    scopePlanItemIds: [agentRun.contextRefs.remotePlanItemId],
    createdAt: nowOr(agentRun.completedAt ?? agentRun.updatedAt),
    metadata: {
      kind: "agent_escalated",
      ...(agentRun.outcome?.summaryId
        ? { summaryId: agentRun.outcome.summaryId }
        : {}),
      ...(agentRun.outcome?.kind
        ? { outcomeKind: agentRun.outcome.kind }
        : {}),
    },
  };

  await tryRecordActivityAndNotifications(activity, { projectOwnerUid });
}

export async function projectInvitationCreatedActivity(input: {
  invitation: ProjectInvitation;
  projectOwnerUid: string;
  inviteeUid?: string;
}): Promise<void> {
  const { invitation, projectOwnerUid, inviteeUid } = input;

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "invitation",
      sourceId: invitation.id,
      suffix: "pending",
    }),
    projectId: invitation.projectId,
    type: "invitation_created",
    actorType: "human",
    actorUid: invitation.invitedBy,
    subjectType: "project_invitation",
    subjectId: invitation.id,
    sourceType: "invitation_create",
    sourceId: invitation.id,
    related: {
      invitationId: invitation.id,
    },
    metadata: {
      kind: "invitation",
      role: invitation.role,
    },
    createdAt: nowOr(invitation.createdAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid,
    inviteeUid,
  });
}

export async function projectInvitationAcceptedActivity(input: {
  invitation: ProjectInvitation;
  actorUid: string;
  projectOwnerUid: string;
}): Promise<void> {
  const { invitation, actorUid, projectOwnerUid } = input;

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "invitation",
      sourceId: invitation.id,
      suffix: "accepted",
    }),
    projectId: invitation.projectId,
    type: "invitation_accepted",
    actorType: "human",
    actorUid,
    subjectType: "project_invitation",
    subjectId: invitation.id,
    sourceType: "invitation_accept",
    sourceId: invitation.id,
    related: {
      invitationId: invitation.id,
    },
    metadata: {
      kind: "invitation",
      role: invitation.role,
    },
    createdAt: nowOr(invitation.updatedAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid,
  });
}

export async function projectMemberRemovedActivity(input: {
  member: ProjectMember;
  actorUid: string;
  projectOwnerUid: string;
}): Promise<void> {
  const { member, actorUid, projectOwnerUid } = input;

  const activity: ActivityEvent = {
    id: buildActivityEventId({
      kind: "member-removed",
      sourceId: member.id,
    }),
    projectId: member.projectId,
    type: "member_removed",
    actorType: "human",
    actorUid,
    subjectType: "project_member",
    subjectId: member.id,
    sourceType: "member_status_change",
    sourceId: `${member.id}:removed`,
    related: {
      projectMemberId: member.id,
    },
    createdAt: nowOr(member.updatedAt),
  };

  await tryRecordActivityAndNotifications(activity, {
    projectOwnerUid,
    removedMemberUid: member.userId,
  });
}
