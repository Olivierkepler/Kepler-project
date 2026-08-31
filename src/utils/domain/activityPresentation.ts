import type { RemoteActivityEvent } from "../../types/activityEvent";
import { isKnownActivityEventType } from "../../services/api/activity";

export function formatActivityActorLabel(
  actorType: string,
): string {
  switch (actorType) {
    case "agent":
      return "BuildSigma";
    case "system":
      return "BuildSigma";
    case "human":
      return "Project member";
    default:
      return "Project member";
  }
}

export function formatCloudActivityTitle(type: string): string {
  if (!isKnownActivityEventType(type)) {
    return "Project update";
  }

  switch (type) {
    case "assignment_created":
      return "Assignment created";
    case "assignment_accepted":
      return "Assignment accepted";
    case "assignment_started":
      return "Work started";
    case "assignment_ready_for_review":
      return "Ready for review";
    case "assignment_sent_back":
      return "Work sent back";
    case "assignment_continued":
      return "Work continued";
    case "assignment_completed":
      return "Assignment completed";
    case "assignment_reopened":
      return "Assignment reopened";
    case "assignment_cancelled":
      return "Assignment cancelled";
    case "measurement_submitted":
      return "Field submission received";
    case "measurement_accepted":
      return "Field submission accepted";
    case "measurement_rejected":
      return "Field submission rejected";
    case "delta_created":
      return "Plan vs reality variance detected";
    case "agent_evidence_requested":
      return "Additional evidence requested";
    case "agent_completed":
      return "BuildSigma analysis completed";
    case "agent_escalated":
      return "BuildSigma needs attention";
    case "invitation_created":
      return "Invitation sent";
    case "invitation_accepted":
      return "Invitation accepted";
    case "member_removed":
      return "Member removed";
    default:
      return "Project update";
  }
}

/**
 * Safe subtitle from related IDs without exposing raw IDs.
 * Callers may pass resolved labels (work package name, plan label).
 */
export function formatCloudActivitySubtitle(
  event: RemoteActivityEvent,
  resolved?: {
    workPackageName?: string;
    planItemLabel?: string;
  },
): string | null {
  if (resolved?.workPackageName?.trim()) {
    return resolved.workPackageName.trim();
  }
  if (resolved?.planItemLabel?.trim()) {
    return resolved.planItemLabel.trim();
  }

  switch (event.type) {
    case "agent_evidence_requested":
    case "agent_completed":
    case "agent_escalated":
      return "Field variance";
    case "delta_created":
      return "Field difference";
    case "measurement_submitted":
    case "measurement_accepted":
    case "measurement_rejected":
      return "Field measurement";
    case "assignment_created":
    case "assignment_accepted":
    case "assignment_started":
    case "assignment_ready_for_review":
    case "assignment_sent_back":
    case "assignment_continued":
    case "assignment_completed":
    case "assignment_reopened":
    case "assignment_cancelled":
      return "Work package assignment";
    case "invitation_created":
    case "invitation_accepted":
      return "Project team";
    case "member_removed":
      return "Project team";
    default:
      return null;
  }
}

export function formatRelativeActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
