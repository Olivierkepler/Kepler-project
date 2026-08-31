import type {
  RemoteActivityEvent,
  RemoteActivityPage,
} from "../../types/activityEvent";
import { ACTIVITY_EVENT_TYPES } from "../../types/activityEvent";
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

function parseRelated(value: unknown): RemoteActivityEvent["related"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const related: RemoteActivityEvent["related"] = {};
  const keys = [
    "workPackageId",
    "assignmentId",
    "projectMemberId",
    "planItemId",
    "measurementId",
    "evidenceId",
    "deltaId",
    "agentRunId",
    "invitationId",
  ] as const;
  for (const key of keys) {
    if (isNonEmptyString(record[key])) {
      related[key] = record[key].trim();
    }
  }
  return related;
}

function parseIdArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value.filter(isNonEmptyString).map((id) => id.trim());
  return ids.length > 0 ? ids : undefined;
}

/**
 * Parses a backend ActivityEvent. Unknown `type` strings are preserved
 * for graceful presentation (not dropped).
 */
export function parseRemoteActivityEvent(
  value: unknown,
): RemoteActivityEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.type) ||
    !isNonEmptyString(record.actorType) ||
    !isNonEmptyString(record.subjectType) ||
    !isNonEmptyString(record.subjectId) ||
    !isNonEmptyString(record.sourceType) ||
    !isNonEmptyString(record.sourceId) ||
    !isNonEmptyString(record.createdAt)
  ) {
    return null;
  }

  const event: RemoteActivityEvent = {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    type: record.type.trim(),
    actorType: record.actorType.trim(),
    subjectType: record.subjectType.trim(),
    subjectId: record.subjectId.trim(),
    sourceType: record.sourceType.trim(),
    sourceId: record.sourceId.trim(),
    related: parseRelated(record.related),
    createdAt: record.createdAt.trim(),
  };

  if (isNonEmptyString(record.actorUid)) {
    event.actorUid = record.actorUid.trim();
  }

  if (record.metadata !== undefined && typeof record.metadata === "object") {
    event.metadata = record.metadata as RemoteActivityEvent["metadata"];
  }

  const scopeWp = parseIdArray(record.scopeWorkPackageIds);
  if (scopeWp) {
    event.scopeWorkPackageIds = scopeWp;
  }

  const scopePlan = parseIdArray(record.scopePlanItemIds);
  if (scopePlan) {
    event.scopePlanItemIds = scopePlan;
  }

  return event;
}

export function isKnownActivityEventType(
  type: string,
): type is (typeof ACTIVITY_EVENT_TYPES)[number] {
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * GET /api/projects/:remoteProjectId/activity?limit=&cursor=
 */
export async function getRemoteProjectActivity(
  remoteProjectId: string,
  options?: { limit?: number; cursor?: string | null },
): Promise<RemoteActivityPage> {
  const projectId = remoteProjectId.trim();
  if (!projectId) {
    throw new Error("projectId is required");
  }

  const params = new URLSearchParams();
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }
  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();
  const path = `/api/projects/${encodeURIComponent(projectId)}/activity${
    query ? `?${query}` : ""
  }`;

  const response = await authenticatedFetch(path);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      parseErrorMessage(body, "Project activity could not be loaded."),
    );
  }

  if (typeof body !== "object" || body === null) {
    throw new Error("Project activity could not be loaded.");
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new Error("Project activity could not be loaded.");
  }

  const items: RemoteActivityEvent[] = [];
  for (const entry of record.items) {
    const parsed = parseRemoteActivityEvent(entry);
    if (!parsed) {
      throw new Error("Project activity could not be loaded.");
    }
    items.push(parsed);
  }

  const nextCursor =
    typeof record.nextCursor === "string" && record.nextCursor.trim()
      ? record.nextCursor.trim()
      : null;

  return { items, nextCursor };
}
