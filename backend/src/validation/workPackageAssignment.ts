import {
  BLOCKING_ASSIGNMENT_STATUSES,
  WORK_PACKAGE_ASSIGNMENT_STATUSES,
  type WorkPackageAssignment,
  type WorkPackageAssignmentStatus,
} from "../domain/workPackageAssignment.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function isWorkPackageAssignmentStatus(
  value: unknown,
): value is WorkPackageAssignmentStatus {
  return (
    typeof value === "string" &&
    (WORK_PACKAGE_ASSIGNMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function isBlockingAssignmentStatus(
  status: WorkPackageAssignmentStatus,
): boolean {
  return (BLOCKING_ASSIGNMENT_STATUSES as readonly string[]).includes(status);
}

export type WorkPackageAssignmentCreateInput = {
  workPackageId: string;
  projectMemberId: string;
  status: WorkPackageAssignmentStatus;
};

export type WorkPackageAssignmentUpdateInput = {
  status: WorkPackageAssignmentStatus;
  note?: string;
};

/**
 * Create body: workPackageId + projectMemberId required.
 * Optional status (default assigned).
 * Ignores client id / projectId / createdAt / updatedAt / userId.
 */
export function parseWorkPackageAssignmentCreateInput(
  body: unknown,
): WorkPackageAssignmentCreateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.workPackageId) ||
    !isNonEmptyString(body.projectMemberId)
  ) {
    return null;
  }

  let status: WorkPackageAssignmentStatus = "assigned";

  if ("status" in body) {
    if (!isWorkPackageAssignmentStatus(body.status)) {
      return null;
    }
    status = body.status;
  }

  return {
    workPackageId: body.workPackageId.trim(),
    projectMemberId: body.projectMemberId.trim(),
    status,
  };
}

/**
 * Narrow PATCH body: status + optional note (Phase 2K.1).
 * Rejects client-supplied attribution / identity spoof fields.
 */
export function parseWorkPackageAssignmentUpdateInput(
  body: unknown,
): WorkPackageAssignmentUpdateInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const disallowedKeys = [
    "actorUid",
    "projectMemberId",
    "workPackageId",
    "ownerUid",
    "statusUpdatedByUid",
    "statusUpdatedAt",
    "projectId",
    "assignmentId",
    "id",
    "previousStatus",
    "nextStatus",
  ] as const;

  for (const key of disallowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return null;
    }
  }

  if (!("status" in body) || !isWorkPackageAssignmentStatus(body.status)) {
    return null;
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    return null;
  }

  const result: WorkPackageAssignmentUpdateInput = {
    status: body.status,
  };

  if (typeof body.note === "string") {
    result.note = body.note;
  }

  return result;
}

/**
 * Normalizes a Firestore WorkPackageAssignment document.
 * Invalid / incomplete docs are rejected (undefined).
 */
export function normalizeWorkPackageAssignmentDocument(
  data: unknown,
): WorkPackageAssignment | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (
    !isNonEmptyString(data.id) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.workPackageId) ||
    !isNonEmptyString(data.projectMemberId) ||
    !isWorkPackageAssignmentStatus(data.status) ||
    !isNonEmptyString(data.createdAt) ||
    !isNonEmptyString(data.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: data.id.trim(),
    projectId: data.projectId.trim(),
    workPackageId: data.workPackageId.trim(),
    projectMemberId: data.projectMemberId.trim(),
    status: data.status,
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
  };
}
