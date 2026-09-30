import {
  ACTIVITY_EVENT_TYPES,
  type ActivityActorType,
  type ActivityEvent,
  type ActivityEventType,
  type ActivityMetadata,
  type ActivityRelatedRefs,
  type ActivitySourceType,
  type ActivitySubjectType,
} from "../domain/activityEvent.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { PROJECT_MEMBER_ROLES } from "../domain/projectMember.js";

const ACTOR_TYPES: ReadonlySet<string> = new Set([
  "human",
  "agent",
  "system",
]);

const SUBJECT_TYPES: ReadonlySet<string> = new Set([
  "project",
  "project_invitation",
  "project_member",
  "work_package",
  "assignment",
  "team_assignment",
  "measurement",
  "evidence",
  "delta",
  "agent_run",
  "feed_post",
]);

const SOURCE_TYPES: ReadonlySet<string> = new Set([
  "assignment_progress_event",
  "contribution_review_event",
  "measurement_create",
  "assignment_create",
  "team_assignment_create",
  "team_assignment_remove",
  "delta_create",
  "invitation_create",
  "invitation_accept",
  "member_status_change",
  "agent_run_state",
  "feed_post_edit",
  "feed_post_delete",
]);

const RELATED_KEYS: readonly (keyof ActivityRelatedRefs)[] = [
  "workPackageId",
  "teamId",
  "assignmentId",
  "projectMemberId",
  "planItemId",
  "measurementId",
  "evidenceId",
  "deltaId",
  "agentRunId",
  "invitationId",
];

const FORBIDDEN_METADATA_KEYS = new Set([
  "email",
  "phone",
  "fullName",
  "name",
  "displayName",
  "reviewNote",
  "note",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseIdArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const ids: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      return undefined;
    }
    ids.push(entry.trim());
  }

  return ids;
}

function parseRelated(value: unknown): ActivityRelatedRefs | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(RELATED_KEYS as readonly string[]).includes(key)) {
      return undefined;
    }
  }

  const related: ActivityRelatedRefs = {};

  for (const key of RELATED_KEYS) {
    const entry = record[key];
    if (entry === undefined) {
      continue;
    }
    if (!isNonEmptyString(entry)) {
      return undefined;
    }
    related[key] = entry.trim();
  }

  return related;
}

function parseMetadata(value: unknown): ActivityMetadata | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      return null;
    }
  }

  const kind = record.kind;

  if (kind === "measurement_rejected") {
    if (typeof record.hasNote !== "boolean") {
      return null;
    }
    return { kind: "measurement_rejected", hasNote: record.hasNote };
  }

  if (kind === "agent_completed") {
    if (!isNonEmptyString(record.summaryId)) {
      return null;
    }
    return {
      kind: "agent_completed",
      summaryId: record.summaryId.trim(),
      ...(isNonEmptyString(record.outcomeKind)
        ? { outcomeKind: record.outcomeKind.trim() }
        : {}),
    };
  }

  if (kind === "agent_escalated") {
    return {
      kind: "agent_escalated",
      ...(isNonEmptyString(record.summaryId)
        ? { summaryId: record.summaryId.trim() }
        : {}),
      ...(isNonEmptyString(record.outcomeKind)
        ? { outcomeKind: record.outcomeKind.trim() }
        : {}),
    };
  }

  if (kind === "invitation") {
    if (
      typeof record.role !== "string" ||
      !(PROJECT_MEMBER_ROLES as readonly string[]).includes(record.role)
    ) {
      return null;
    }
    return {
      kind: "invitation",
      role: record.role as ProjectMemberRole,
    };
  }

  if (kind === "agent_evidence_requested") {
    if (!isNonEmptyString(record.requestId)) {
      return null;
    }
    const requestedProjectMemberId = isNonEmptyString(
      record.requestedProjectMemberId,
    )
      ? record.requestedProjectMemberId.trim()
      : undefined;
    return {
      kind: "agent_evidence_requested",
      requestId: record.requestId.trim(),
      ...(requestedProjectMemberId ? { requestedProjectMemberId } : {}),
    };
  }

  return null;
}

/**
 * Normalizes / validates an ActivityEvent document.
 * Returns undefined when invalid.
 */
export function normalizeActivityEventDocument(
  data: unknown,
): ActivityEvent | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (!isNonEmptyString(record.id) || !isNonEmptyString(record.projectId)) {
    return undefined;
  }

  if (
    typeof record.type !== "string" ||
    !(ACTIVITY_EVENT_TYPES as readonly string[]).includes(record.type)
  ) {
    return undefined;
  }

  if (
    typeof record.actorType !== "string" ||
    !ACTOR_TYPES.has(record.actorType)
  ) {
    return undefined;
  }

  const actorType = record.actorType as ActivityActorType;

  if (actorType === "human") {
    if (!isNonEmptyString(record.actorUid)) {
      return undefined;
    }
  } else if (record.actorUid !== undefined) {
    // agent/system must not carry a fake human actorUid
    return undefined;
  }

  if (
    typeof record.subjectType !== "string" ||
    !SUBJECT_TYPES.has(record.subjectType) ||
    !isNonEmptyString(record.subjectId)
  ) {
    return undefined;
  }

  if (
    typeof record.sourceType !== "string" ||
    !SOURCE_TYPES.has(record.sourceType) ||
    !isNonEmptyString(record.sourceId)
  ) {
    return undefined;
  }

  const related = parseRelated(record.related);
  if (related === undefined) {
    return undefined;
  }

  const metadata = parseMetadata(record.metadata);
  if (metadata === null) {
    return undefined;
  }

  if (!isNonEmptyString(record.createdAt)) {
    return undefined;
  }

  const scopeWorkPackageIds = parseIdArray(record.scopeWorkPackageIds);
  if (record.scopeWorkPackageIds !== undefined && !scopeWorkPackageIds) {
    return undefined;
  }

  const scopePlanItemIds = parseIdArray(record.scopePlanItemIds);
  if (record.scopePlanItemIds !== undefined && !scopePlanItemIds) {
    return undefined;
  }

  const event: ActivityEvent = {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    type: record.type as ActivityEventType,
    actorType,
    subjectType: record.subjectType as ActivitySubjectType,
    subjectId: record.subjectId.trim(),
    sourceType: record.sourceType as ActivitySourceType,
    sourceId: record.sourceId.trim(),
    related,
    createdAt: record.createdAt.trim(),
  };

  if (actorType === "human" && isNonEmptyString(record.actorUid)) {
    event.actorUid = record.actorUid.trim();
  }

  if (metadata !== undefined) {
    event.metadata = metadata;
  }

  if (scopeWorkPackageIds && scopeWorkPackageIds.length > 0) {
    event.scopeWorkPackageIds = scopeWorkPackageIds;
  }

  if (scopePlanItemIds && scopePlanItemIds.length > 0) {
    event.scopePlanItemIds = scopePlanItemIds;
  }

  return event;
}
