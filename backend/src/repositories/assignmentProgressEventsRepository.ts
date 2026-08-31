import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  createAssignmentProgressEventId,
  type AssignmentProgressEvent,
} from "../domain/assignmentProgressEvent.js";
import type {
  WorkPackageAssignment,
  WorkPackageAssignmentStatus,
} from "../domain/workPackageAssignment.js";
import { normalizeWorkPackageAssignmentDocument } from "../validation/workPackageAssignment.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

const PROGRESS_NOTE_MAX_LENGTH = 2000;

/**
 * Trims note; empty → undefined; enforces max length.
 * Returns null when note exceeds max length or is non-string.
 */
export function normalizeAssignmentProgressNote(
  note: unknown,
): string | undefined | null {
  if (note === undefined || note === null) {
    return undefined;
  }

  if (typeof note !== "string") {
    return null;
  }

  const trimmed = note.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > PROGRESS_NOTE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function assignmentProgressEventsCollection() {
  return db.collection(COLLECTIONS.assignmentProgressEvents);
}

function assignmentsCollection() {
  return db.collection(COLLECTIONS.workPackageAssignments);
}

/**
 * Lists progress events for an Assignment, oldest first.
 */
export async function listAssignmentProgressEventsForAssignment(
  projectId: string,
  assignmentId: string,
): Promise<AssignmentProgressEvent[]> {
  requireId(projectId, "projectId");
  requireId(assignmentId, "assignmentId");

  const snapshot = await assignmentProgressEventsCollection()
    .where("projectId", "==", projectId)
    .where("assignmentId", "==", assignmentId)
    .get();

  const events = snapshot.docs.map(
    (doc) => doc.data() as AssignmentProgressEvent,
  );

  return events.sort((a, b) => {
    const timeCmp = a.createdAt.localeCompare(b.createdAt);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export type ApplyAssignmentProgressTransitionInput = {
  projectId: string;
  assignmentId: string;
  actorUid: string;
  nextStatus: WorkPackageAssignmentStatus;
  /** Pre-normalized note (undefined = omit from event). */
  note: string | undefined;
};

export type ApplyAssignmentProgressTransitionResult =
  | {
      kind: "updated";
      assignment: WorkPackageAssignment;
      event: AssignmentProgressEvent;
    }
  | { kind: "idempotent"; assignment: WorkPackageAssignment }
  | { kind: "not_found" };

/**
 * Atomically updates Assignment.status and appends AssignmentProgressEvent
 * when status changes.
 *
 * Same-status: idempotent no-op (no event, no updatedAt bump).
 * previousStatus is the assignment's current status (legacy-safe).
 */
export async function applyAssignmentProgressTransition(
  input: ApplyAssignmentProgressTransitionInput,
): Promise<ApplyAssignmentProgressTransitionResult> {
  requireId(input.projectId, "projectId");
  requireId(input.assignmentId, "assignmentId");
  requireId(input.actorUid, "actorUid");

  const assignmentRef = assignmentsCollection().doc(input.assignmentId);
  const eventId = createAssignmentProgressEventId();
  const eventRef = assignmentProgressEventsCollection().doc(eventId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(assignmentRef);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = normalizeWorkPackageAssignmentDocument(snapshot.data());

    if (!current || current.projectId !== input.projectId) {
      return { kind: "not_found" as const };
    }

    if (current.status === input.nextStatus) {
      return { kind: "idempotent" as const, assignment: current };
    }

    const previousStatus: WorkPackageAssignmentStatus = current.status;

    const updated: WorkPackageAssignment = {
      ...current,
      status: input.nextStatus,
      updatedAt: nowIso,
    };

    const event: AssignmentProgressEvent = {
      id: eventId,
      projectId: current.projectId,
      assignmentId: current.id,
      workPackageId: current.workPackageId,
      projectMemberId: current.projectMemberId,
      previousStatus,
      nextStatus: input.nextStatus,
      actorUid: input.actorUid,
      createdAt: nowIso,
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    tx.update(assignmentRef, {
      status: input.nextStatus,
      updatedAt: nowIso,
    });
    tx.create(eventRef, event);

    return { kind: "updated" as const, assignment: updated, event };
  });
}
