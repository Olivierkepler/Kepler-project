import type { Project, ProjectStatus } from "../domain/project.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
} from "./primitives.js";

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "planning",
  "completed",
  "on-hold",
];

function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

export type ProjectWriteInput = Omit<Project, "id" | "ownerUid">;

export type ProjectUpdateInput = {
  name?: string;
  location?: string;
  status?: ProjectStatus;
};

/**
 * Parses project create/bootstrap payload.
 * Requires localProjectId. Ignores client id/ownerUid.
 */
export function parseProjectWriteInput(
  body: unknown,
): ProjectWriteInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.localProjectId) ||
    body.localProjectId.includes("/") ||
    !isNonEmptyString(body.name) ||
    !isNonEmptyString(body.location) ||
    !isProjectStatus(body.status) ||
    !isFiniteNumber(body.progress) ||
    !isFiniteNumber(body.openDeltas) ||
    !isFiniteNumber(body.assignedTasks)
  ) {
    return null;
  }

  return {
    localProjectId: body.localProjectId,
    name: body.name,
    location: body.location,
    status: body.status,
    progress: body.progress,
    openDeltas: body.openDeltas,
    assignedTasks: body.assignedTasks,
  };
}

/**
 * Parses narrow Project PATCH body.
 * At least one editable field required. Ignores id/ownerUid/localProjectId.
 */
export function parseProjectUpdateInput(
  body: unknown,
): ProjectUpdateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const update: ProjectUpdateInput = {};

  if ("name" in body) {
    if (!isNonEmptyString(body.name)) {
      return null;
    }
    update.name = body.name;
  }

  if ("location" in body) {
    if (!isNonEmptyString(body.location)) {
      return null;
    }
    update.location = body.location;
  }

  if ("status" in body) {
    if (!isProjectStatus(body.status)) {
      return null;
    }
    update.status = body.status;
  }

  if (
    update.name === undefined &&
    update.location === undefined &&
    update.status === undefined
  ) {
    return null;
  }

  return update;
}
