import type {
  Notification,
  NotificationDestination,
  NotificationType,
} from "../domain/notification.js";
import { NOTIFICATION_TYPES } from "../domain/notification.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseDestination(
  value: unknown,
): NotificationDestination | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;

  if (kind === "project") {
    if (!isNonEmptyString(record.projectId)) {
      return undefined;
    }
    return { kind: "project", projectId: record.projectId.trim() };
  }

  if (kind === "work_progress") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.workPackageId)
    ) {
      return undefined;
    }
    return {
      kind: "work_progress",
      projectId: record.projectId.trim(),
      workPackageId: record.workPackageId.trim(),
    };
  }

  if (kind === "contribution_review") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.measurementId)
    ) {
      return undefined;
    }
    return {
      kind: "contribution_review",
      projectId: record.projectId.trim(),
      measurementId: record.measurementId.trim(),
    };
  }

  if (kind === "delta") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.deltaId)
    ) {
      return undefined;
    }
    return {
      kind: "delta",
      projectId: record.projectId.trim(),
      deltaId: record.deltaId.trim(),
    };
  }

  if (kind === "agent_run") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.agentRunId)
    ) {
      return undefined;
    }
    return {
      kind: "agent_run",
      projectId: record.projectId.trim(),
      agentRunId: record.agentRunId.trim(),
    };
  }

  if (kind === "team") {
    if (!isNonEmptyString(record.projectId)) {
      return undefined;
    }
    return { kind: "team", projectId: record.projectId.trim() };
  }

  if (kind === "feed_post") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.postId)
    ) {
      return undefined;
    }
    return {
      kind: "feed_post",
      projectId: record.projectId.trim(),
      postId: record.postId.trim(),
    };
  }

  if (kind === "feed_comment") {
    if (
      !isNonEmptyString(record.projectId) ||
      !isNonEmptyString(record.postId) ||
      !isNonEmptyString(record.commentId)
    ) {
      return undefined;
    }
    return {
      kind: "feed_comment",
      projectId: record.projectId.trim(),
      postId: record.postId.trim(),
      commentId: record.commentId.trim(),
    };
  }

  return undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalNullableString(
  value: unknown,
): string | null | undefined {
  if (value === null) {
    return null;
  }
  return parseOptionalString(value);
}

export function normalizeNotificationDocument(
  data: unknown,
): Notification | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.recipientUid) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.activityEventId) ||
    !isNonEmptyString(record.createdAt)
  ) {
    return undefined;
  }

  if (
    typeof record.type !== "string" ||
    !(NOTIFICATION_TYPES as readonly string[]).includes(record.type)
  ) {
    return undefined;
  }

  if (typeof record.isRead !== "boolean") {
    return undefined;
  }

  if (record.isRead) {
    if (!isNonEmptyString(record.readAt)) {
      return undefined;
    }
  } else if (record.readAt !== null && record.readAt !== undefined) {
    return undefined;
  }

  const destination = parseDestination(record.destination);
  if (!destination) {
    return undefined;
  }

  const title = parseOptionalString(record.title);
  const body = parseOptionalString(record.body);
  const actorUid = parseOptionalString(record.actorUid);
  const actorDisplayName = parseOptionalNullableString(
    record.actorDisplayName,
  );
  const projectName = parseOptionalString(record.projectName);

  return {
    id: record.id.trim(),
    recipientUid: record.recipientUid.trim(),
    projectId: record.projectId.trim(),
    activityEventId: record.activityEventId.trim(),
    type: record.type as NotificationType,
    isRead: record.isRead,
    readAt: record.isRead ? (record.readAt as string).trim() : null,
    createdAt: record.createdAt.trim(),
    destination,
    ...(title ? { title } : {}),
    ...(body ? { body } : {}),
    ...(actorUid ? { actorUid } : {}),
    ...(actorDisplayName !== undefined ? { actorDisplayName } : {}),
    ...(projectName ? { projectName } : {}),
  };
}
