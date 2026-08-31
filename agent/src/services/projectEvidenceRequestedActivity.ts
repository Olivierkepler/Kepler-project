/**
 * Best-effort Activity + Notification projection for Field Variance
 * evidence requests created by the agent service.
 *
 * Mirrors backend projectAgentRunStateActivity(waiting_for_evidence) ID scheme
 * so create-if-absent remains idempotent across agent/backend writers.
 */

import type { AgentRun } from "../domain/agentRun.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { getProjectById } from "../repositories/projectsRepository.js";
import { getProjectMemberById } from "../repositories/projectMembersRepository.js";

function buildActivityEventId(agentRunId: string, requestId: string): string {
  return `activity:agent-evidence-requested:${agentRunId}:${requestId}`;
}

function buildNotificationId(
  activityEventId: string,
  recipientUid: string,
): string {
  return `notif:${activityEventId}:${recipientUid}`;
}

async function createIfAbsent(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const ref = db.collection(collection).doc(id);
  const existing = await ref.get();
  if (existing.exists) {
    return false;
  }
  try {
    await ref.create(data);
    return true;
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";
    if (message.includes("ALREADY_EXISTS")) {
      return false;
    }
    throw error;
  }
}

/**
 * Projects agent_evidence_requested Activity + owner (+ optional assignee) Notifications.
 */
export async function projectAgentEvidenceRequestedActivity(args: {
  agentRun: AgentRun;
}): Promise<void> {
  const { agentRun } = args;
  const requestId = agentRun.pendingRequest?.requestId?.trim();
  if (
    !requestId ||
    agentRun.status !== "waiting_for_evidence" ||
    agentRun.pendingRequest?.kind !== "delta_evidence"
  ) {
    return;
  }

  const project = await getProjectById(agentRun.projectId);
  if (!project) {
    return;
  }

  const ownerUid = project.ownerUid.trim();
  if (!ownerUid) {
    return;
  }

  let assignedMemberUid: string | undefined;
  const requestedMemberId =
    agentRun.pendingRequest.requestedProjectMemberId?.trim() ?? "";
  if (requestedMemberId) {
    const member = await getProjectMemberById(requestedMemberId);
    if (
      member &&
      member.projectId === agentRun.projectId &&
      member.status === "active" &&
      member.userId.trim()
    ) {
      assignedMemberUid = member.userId.trim();
    }
  }

  const activityId = buildActivityEventId(agentRun.id, requestId);
  const createdAt = agentRun.updatedAt;
  const activity = {
    id: activityId,
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
    createdAt,
  };

  const activityCreated = await createIfAbsent(
    COLLECTIONS.activityEvents,
    activityId,
    activity,
  );

  if (!activityCreated) {
    return;
  }

  const destination = {
    kind: "agent_run",
    projectId: agentRun.projectId,
    agentRunId: agentRun.id,
  };

  const recipients = new Set<string>([ownerUid]);
  if (assignedMemberUid && assignedMemberUid !== ownerUid) {
    recipients.add(assignedMemberUid);
  }

  for (const recipientUid of recipients) {
    const notificationId = buildNotificationId(activityId, recipientUid);
    await createIfAbsent(COLLECTIONS.notifications, notificationId, {
      id: notificationId,
      recipientUid,
      projectId: agentRun.projectId,
      activityEventId: activityId,
      type: "agent_evidence_requested",
      isRead: false,
      readAt: null,
      createdAt,
      destination,
    });
  }
}
