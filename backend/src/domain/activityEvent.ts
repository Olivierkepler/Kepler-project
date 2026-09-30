import type { ProjectMemberRole } from "./projectMember.js";

export type ActivityActorType = "human" | "agent" | "system";

export type ActivitySubjectType =
  | "project"
  | "project_invitation"
  | "project_member"
  | "work_package"
  | "assignment"
  | "team_assignment"
  | "measurement"
  | "evidence"
  | "delta"
  | "agent_run"
  | "feed_post";

export type ActivitySourceType =
  | "assignment_progress_event"
  | "contribution_review_event"
  | "measurement_create"
  | "assignment_create"
  | "team_assignment_create"
  | "team_assignment_remove"
  | "delta_create"
  | "invitation_create"
  | "invitation_accept"
  | "member_status_change"
  | "agent_run_state"
  | "feed_post_edit"
  | "feed_post_delete";

export type ActivityEventType =
  | "assignment_created"
  | "assignment_accepted"
  | "assignment_started"
  | "assignment_ready_for_review"
  | "assignment_sent_back"
  | "assignment_continued"
  | "assignment_completed"
  | "assignment_reopened"
  | "assignment_cancelled"
  | "measurement_submitted"
  | "measurement_accepted"
  | "measurement_rejected"
  | "delta_created"
  | "agent_evidence_requested"
  | "agent_completed"
  | "agent_escalated"
  | "invitation_created"
  | "invitation_accepted"
  | "member_removed"
  | "team_assignment_created"
  | "team_assignment_removed"
  | "feed_post_edited"
  | "feed_post_deleted";

export const ACTIVITY_EVENT_TYPES: readonly ActivityEventType[] = [
  "assignment_created",
  "assignment_accepted",
  "assignment_started",
  "assignment_ready_for_review",
  "assignment_sent_back",
  "assignment_continued",
  "assignment_completed",
  "assignment_reopened",
  "assignment_cancelled",
  "measurement_submitted",
  "measurement_accepted",
  "measurement_rejected",
  "delta_created",
  "agent_evidence_requested",
  "agent_completed",
  "agent_escalated",
  "invitation_created",
  "invitation_accepted",
  "member_removed",
  "team_assignment_created",
  "team_assignment_removed",
  "feed_post_edited",
  "feed_post_deleted",
] as const;

/**
 * Viewer-visible operational Activity types (Phase 2M.1).
 * Assignment / invitation / member staffing events are excluded.
 */
export const VIEWER_VISIBLE_ACTIVITY_TYPES: ReadonlySet<ActivityEventType> =
  new Set<ActivityEventType>([
    "measurement_submitted",
    "measurement_accepted",
    "measurement_rejected",
    "delta_created",
    "agent_evidence_requested",
    "agent_completed",
    "agent_escalated",
  ]);

export type ActivityRelatedRefs = {
  workPackageId?: string;
  teamId?: string;
  assignmentId?: string;
  projectMemberId?: string;
  planItemId?: string;
  measurementId?: string;
  evidenceId?: string;
  deltaId?: string;
  agentRunId?: string;
  invitationId?: string;
};

export type ActivityMetadata =
  | { kind: "measurement_rejected"; hasNote: boolean }
  | {
      kind: "agent_completed";
      summaryId: string;
      outcomeKind?: string;
    }
  | {
      kind: "agent_escalated";
      summaryId?: string;
      outcomeKind?: string;
    }
  | {
      kind: "invitation";
      role: ProjectMemberRole;
    }
  | {
      kind: "agent_evidence_requested";
      requestId: string;
      /** Canonical ProjectMember.id when uniquely resolved. */
      requestedProjectMemberId?: string;
    };

/**
 * Durable project timeline projection (Phase 2M.1).
 * Specialized audits remain authoritative; Activity is user-facing history.
 */
export type ActivityEvent = {
  id: string;
  projectId: string;
  type: ActivityEventType;
  actorType: ActivityActorType;
  actorUid?: string;
  subjectType: ActivitySubjectType;
  subjectId: string;
  sourceType: ActivitySourceType;
  sourceId: string;
  related: ActivityRelatedRefs;
  metadata?: ActivityMetadata;
  scopeWorkPackageIds?: string[];
  scopePlanItemIds?: string[];
  createdAt: string;
};

/**
 * Deterministic Activity document IDs from source events.
 * Colon separators match AgentRun id conventions (field-variance:...).
 */
export function buildActivityEventId(parts: {
  kind:
    | "assignment-progress"
    | "contribution-review"
    | "measurement-create"
    | "assignment-create"
    | "team-assignment-create"
    | "team-assignment-remove"
    | "delta-create"
    | "agent-evidence-requested"
    | "agent-terminal"
    | "invitation"
    | "member-removed"
    | "feed-post-edit"
    | "feed-post-delete";
  sourceId: string;
  suffix?: string;
}): string {
  const source = parts.sourceId.trim();
  if (!source) {
    throw new Error("sourceId is required for ActivityEvent id");
  }

  if (parts.kind === "agent-evidence-requested" || parts.kind === "agent-terminal") {
    const suffix = parts.suffix?.trim();
    if (!suffix) {
      throw new Error("suffix is required for agent ActivityEvent id");
    }
    return `activity:${parts.kind}:${source}:${suffix}`;
  }

  if (parts.kind === "invitation") {
    const suffix = parts.suffix?.trim();
    if (!suffix) {
      throw new Error("suffix is required for invitation ActivityEvent id");
    }
    return `activity:invitation:${source}:${suffix}`;
  }

  if (parts.kind === "feed-post-edit") {
    const suffix = parts.suffix?.trim();
    if (!suffix) {
      throw new Error("suffix is required for feed-post-edit ActivityEvent id");
    }
    return `activity:feed-post-edit:${source}:${suffix}`;
  }

  if (parts.kind === "feed-post-delete") {
    return `activity:feed-post-delete:${source}`;
  }

  return `activity:${parts.kind}:${source}`;
}
