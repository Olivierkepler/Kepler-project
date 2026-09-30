/**
 * Cloud ActivityEvent DTO (Phase 2M.2) — mirrors backend closed MVP.
 */

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
  | "agent_run";

export type ActivitySourceType =
  | "assignment_progress_event"
  | "contribution_review_event"
  | "measurement_create"
  | "assignment_create"
  | "team_assignment_create"
  | "team_assignment_remove"
  | "evidence_create"
  | "delta_create"
  | "invitation_create"
  | "invitation_accept"
  | "member_status_change"
  | "agent_run_state";

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
  | "evidence_created";

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
  "evidence_created",
] as const;

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
  | { kind: "agent_completed"; summaryId: string; outcomeKind?: string }
  | { kind: "agent_escalated"; summaryId?: string; outcomeKind?: string }
  | { kind: "invitation"; role: string }
  | { kind: "agent_evidence_requested"; requestId: string };

export type RemoteActivityEvent = {
  id: string;
  projectId: string;
  type: ActivityEventType | string;
  actorType: ActivityActorType | string;
  actorUid?: string;
  subjectType: ActivitySubjectType | string;
  subjectId: string;
  sourceType: ActivitySourceType | string;
  sourceId: string;
  related: ActivityRelatedRefs;
  metadata?: ActivityMetadata | Record<string, unknown>;
  scopeWorkPackageIds?: string[];
  scopePlanItemIds?: string[];
  createdAt: string;
};

export type RemoteActivityPage = {
  items: RemoteActivityEvent[];
  nextCursor: string | null;
};
