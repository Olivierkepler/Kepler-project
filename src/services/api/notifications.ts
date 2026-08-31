import type {
  NotificationDestination,
  RemoteNotification,
  RemoteNotificationPage,
} from "../../types/notification";
import { authenticatedFetch } from "./client";

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).error === "string"
  ) {
    return (body as Record<string, unknown>).error as string;
  }
  return fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseDestination(value: unknown): NotificationDestination | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;

  if (kind === "project" && isNonEmptyString(record.projectId)) {
    return { kind: "project", projectId: record.projectId.trim() };
  }

  if (
    kind === "work_progress" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.workPackageId)
  ) {
    return {
      kind: "work_progress",
      projectId: record.projectId.trim(),
      workPackageId: record.workPackageId.trim(),
    };
  }

  if (
    kind === "contribution_review" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.measurementId)
  ) {
    return {
      kind: "contribution_review",
      projectId: record.projectId.trim(),
      measurementId: record.measurementId.trim(),
    };
  }

  if (
    kind === "delta" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.deltaId)
  ) {
    return {
      kind: "delta",
      projectId: record.projectId.trim(),
      deltaId: record.deltaId.trim(),
    };
  }

  if (
    kind === "agent_run" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.agentRunId)
  ) {
    return {
      kind: "agent_run",
      projectId: record.projectId.trim(),
      agentRunId: record.agentRunId.trim(),
    };
  }

  if (kind === "team" && isNonEmptyString(record.projectId)) {
    return { kind: "team", projectId: record.projectId.trim() };
  }

  if (
    kind === "feed_post" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.postId)
  ) {
    return {
      kind: "feed_post",
      projectId: record.projectId.trim(),
      postId: record.postId.trim(),
    };
  }

  if (
    kind === "feed_comment" &&
    isNonEmptyString(record.projectId) &&
    isNonEmptyString(record.postId) &&
    isNonEmptyString(record.commentId)
  ) {
    return {
      kind: "feed_comment",
      projectId: record.projectId.trim(),
      postId: record.postId.trim(),
      commentId: record.commentId.trim(),
    };
  }

  return null;
}

function parseOptionalString(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }
  return value.trim();
}

function parseOptionalNullableString(
  value: unknown,
): string | null | undefined {
  if (value === null) {
    return null;
  }
  return parseOptionalString(value);
}

export function parseRemoteNotification(
  value: unknown,
): RemoteNotification | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.recipientUid) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.activityEventId) ||
    !isNonEmptyString(record.type) ||
    typeof record.isRead !== "boolean" ||
    !isNonEmptyString(record.createdAt)
  ) {
    return null;
  }

  if (record.isRead) {
    if (!isNonEmptyString(record.readAt)) {
      return null;
    }
  } else if (record.readAt !== null && record.readAt !== undefined) {
    return null;
  }

  const destination = parseDestination(record.destination);
  if (!destination) {
    return null;
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
    type: record.type.trim(),
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

/**
 * GET /api/me/notifications?limit=&cursor=
 */
export async function getNotifications(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<RemoteNotificationPage> {
  const params = new URLSearchParams();
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();
  const path = `/api/me/notifications${query ? `?${query}` : ""}`;

  const response = await authenticatedFetch(path);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Notifications could not be loaded."),
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Notifications could not be loaded.");
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new Error("Notifications could not be loaded.");
  }

  const items: RemoteNotification[] = [];
  for (const entry of record.items) {
    const parsed = parseRemoteNotification(entry);
    if (!parsed) {
      throw new Error("Notifications could not be loaded.");
    }
    items.push(parsed);
  }

  const nextCursor =
    typeof record.nextCursor === "string" && record.nextCursor.trim()
      ? record.nextCursor.trim()
      : null;

  return { items, nextCursor };
}

/**
 * GET /api/me/notifications/unread-count
 */
export async function getNotificationUnreadCount(): Promise<number> {
  const response = await authenticatedFetch(
    "/api/me/notifications/unread-count",
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Unread count could not be loaded."),
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).count !== "number" ||
    !Number.isFinite((body as Record<string, unknown>).count as number)
  ) {
    throw new Error("Unread count could not be loaded.");
  }

  return Math.max(0, Math.floor((body as { count: number }).count));
}

/**
 * GET /api/me/notifications/:notificationId
 */
export async function getNotificationById(
  notificationId: string,
): Promise<RemoteNotification> {
  const id = notificationId.trim();
  if (!id) {
    throw new Error("notificationId is required");
  }

  const response = await authenticatedFetch(
    `/api/me/notifications/${encodeURIComponent(id)}`,
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Notification could not be loaded."),
    );
  }

  const parsed = parseRemoteNotification(body);
  if (!parsed) {
    throw new Error("Notification could not be loaded.");
  }

  return parsed;
}

/**
 * PATCH /api/me/notifications/:notificationId/read
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<RemoteNotification> {
  const id = notificationId.trim();
  if (!id) {
    throw new Error("notificationId is required");
  }

  const response = await authenticatedFetch(
    `/api/me/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Notification could not be marked read."),
    );
  }

  const parsed = parseRemoteNotification(body);
  if (!parsed) {
    throw new Error("Notification could not be marked read.");
  }

  return parsed;
}

/**
 * POST /api/me/notifications/read-all
 */
export async function markAllNotificationsRead(): Promise<number> {
  const response = await authenticatedFetch(
    "/api/me/notifications/read-all",
    { method: "POST" },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Notifications could not be marked read."),
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).updated !== "number"
  ) {
    throw new Error("Notifications could not be marked read.");
  }

  return Math.max(0, Math.floor((body as { updated: number }).updated));
}
