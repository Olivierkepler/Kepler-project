import type { ActivityEvent } from "../../domain/activityEvent.js";
import type { NotificationDestination } from "../../domain/notification.js";

export type NotificationRecipientInstruction = {
  recipientUid: string;
  destination: NotificationDestination;
};

export type ActivityNotificationPolicyContext = {
  projectOwnerUid: string;
  /** Assigned member userId for assignment events. */
  assignedMemberUid?: string;
  /** Measurement.capturedByUid for review outcomes. */
  contributorUid?: string;
  /** Invitee UID when resolvable (not email). */
  inviteeUid?: string;
  /** Removed member userId. */
  removedMemberUid?: string;
};

/**
 * Deterministic recipients for an ActivityEvent.
 * Returns zero or more instructions — never fabricates UIDs from email.
 */
export function resolveNotificationRecipients(
  activity: ActivityEvent,
  context: ActivityNotificationPolicyContext,
): NotificationRecipientInstruction[] {
  const projectId = activity.projectId;
  const owner = context.projectOwnerUid.trim();

  switch (activity.type) {
    case "invitation_created": {
      const invitee = context.inviteeUid?.trim();
      if (!invitee) {
        return [];
      }
      return [
        {
          recipientUid: invitee,
          destination: { kind: "team", projectId },
        },
      ];
    }

    case "invitation_accepted":
      return [
        {
          recipientUid: owner,
          destination: { kind: "team", projectId },
        },
      ];

    case "assignment_created": {
      const member = context.assignedMemberUid?.trim();
      if (!member) {
        return [];
      }
      const workPackageId = activity.related.workPackageId;
      return [
        {
          recipientUid: member,
          destination: workPackageId
            ? { kind: "work_progress", projectId, workPackageId }
            : { kind: "project", projectId },
        },
      ];
    }

    case "assignment_ready_for_review": {
      const workPackageId = activity.related.workPackageId;
      return [
        {
          recipientUid: owner,
          destination: workPackageId
            ? { kind: "work_progress", projectId, workPackageId }
            : { kind: "project", projectId },
        },
      ];
    }

    case "assignment_sent_back":
    case "assignment_completed":
    case "assignment_reopened": {
      const member = context.assignedMemberUid?.trim();
      if (!member) {
        return [];
      }
      const workPackageId = activity.related.workPackageId;
      return [
        {
          recipientUid: member,
          destination: workPackageId
            ? { kind: "work_progress", projectId, workPackageId }
            : { kind: "project", projectId },
        },
      ];
    }

    case "measurement_submitted": {
      const measurementId = activity.related.measurementId ?? activity.subjectId;
      return [
        {
          recipientUid: owner,
          destination: {
            kind: "contribution_review",
            projectId,
            measurementId,
          },
        },
      ];
    }

    case "measurement_accepted":
    case "measurement_rejected": {
      const contributor = context.contributorUid?.trim();
      if (!contributor) {
        return [];
      }
      const measurementId = activity.related.measurementId ?? activity.subjectId;
      return [
        {
          recipientUid: contributor,
          destination: {
            kind: "contribution_review",
            projectId,
            measurementId,
          },
        },
      ];
    }

    case "agent_evidence_requested": {
      const agentRunId = activity.related.agentRunId ?? activity.subjectId;
      const destination: NotificationDestination = {
        kind: "agent_run",
        projectId,
        agentRunId,
      };
      const instructions: NotificationRecipientInstruction[] = [
        {
          recipientUid: owner,
          destination,
        },
      ];
      const member = context.assignedMemberUid?.trim();
      if (member && member !== owner) {
        instructions.push({
          recipientUid: member,
          destination,
        });
      }
      return instructions;
    }

    case "agent_completed":
    case "agent_escalated": {
      const agentRunId = activity.related.agentRunId ?? activity.subjectId;
      return [
        {
          recipientUid: owner,
          destination: { kind: "agent_run", projectId, agentRunId },
        },
      ];
    }

    case "member_removed": {
      const removed = context.removedMemberUid?.trim();
      if (!removed) {
        return [];
      }
      return [
        {
          recipientUid: removed,
          destination: { kind: "project", projectId },
        },
      ];
    }

    case "assignment_accepted":
    case "assignment_started":
    case "assignment_continued":
    case "assignment_cancelled":
    case "delta_created":
      return [];

    default:
      return [];
  }
}
