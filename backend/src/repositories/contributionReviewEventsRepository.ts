import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  createContributionReviewEventId,
  type ContributionReviewEvent,
} from "../domain/contributionReviewEvent.js";
import {
  effectiveMeasurementReviewStatus,
  type Measurement,
  type MeasurementReviewStatus,
} from "../domain/measurement.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
}

const REVIEW_NOTE_MAX_LENGTH = 2000;

/**
 * Trims note; empty → undefined; enforces max length.
 * Returns null when note exceeds max length (invalid input).
 */
export function normalizeContributionReviewNote(
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

  if (trimmed.length > REVIEW_NOTE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function contributionReviewEventsCollection() {
  return db.collection(COLLECTIONS.contributionReviewEvents);
}

function measurementsCollection() {
  return db.collection(COLLECTIONS.measurements);
}

/**
 * Append-only create. Callers normally use applyMeasurementContributionReview.
 */
export async function createContributionReviewEvent(
  event: ContributionReviewEvent,
): Promise<void> {
  requireId(event.id, "event.id");
  requireId(event.projectId, "event.projectId");
  requireId(event.measurementId, "event.measurementId");
  requireId(event.reviewerUid, "event.reviewerUid");

  await contributionReviewEventsCollection()
    .doc(event.id)
    .create(event);
}

/**
 * Lists review events for a Measurement, oldest first (append order by createdAt).
 */
export async function listContributionReviewEventsForMeasurement(
  projectId: string,
  measurementId: string,
): Promise<ContributionReviewEvent[]> {
  requireId(projectId, "projectId");
  requireId(measurementId, "measurementId");

  const snapshot = await contributionReviewEventsCollection()
    .where("projectId", "==", projectId)
    .where("measurementId", "==", measurementId)
    .get();

  const events = snapshot.docs.map(
    (doc) => doc.data() as ContributionReviewEvent,
  );

  return events.sort((a, b) => {
    const timeCmp = a.createdAt.localeCompare(b.createdAt);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export type ApplyMeasurementContributionReviewInput = {
  projectId: string;
  measurementId: string;
  reviewerUid: string;
  /** Terminal review statuses only — never pending. */
  status: "accepted" | "rejected";
  /** Pre-normalized note (undefined clears reviewNote on state change). */
  note: string | undefined;
};

export type ApplyMeasurementContributionReviewResult =
  | {
      kind: "updated";
      measurement: Measurement;
      event: ContributionReviewEvent;
    }
  | { kind: "idempotent"; measurement: Measurement }
  | { kind: "not_found" };

/**
 * Atomically updates Measurement review fields and appends a
 * ContributionReviewEvent when status changes.
 *
 * Same-status accepted→accepted / rejected→rejected: idempotent no-op
 * (no event, no reviewedAt bump).
 *
 * previousStatus uses effective status (legacy missing → accepted).
 */
export async function applyMeasurementContributionReview(
  input: ApplyMeasurementContributionReviewInput,
): Promise<ApplyMeasurementContributionReviewResult> {
  requireId(input.projectId, "projectId");
  requireId(input.measurementId, "measurementId");
  requireId(input.reviewerUid, "reviewerUid");

  const measurementRef = measurementsCollection().doc(input.measurementId);
  const eventId = createContributionReviewEventId();
  const eventRef = contributionReviewEventsCollection().doc(eventId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(measurementRef);

    if (!snapshot.exists) {
      return { kind: "not_found" as const };
    }

    const current = snapshot.data() as Measurement;

    if (current.projectId !== input.projectId) {
      return { kind: "not_found" as const };
    }

    const previousStatus: MeasurementReviewStatus =
      effectiveMeasurementReviewStatus(current);

    if (previousStatus === input.status) {
      return { kind: "idempotent" as const, measurement: current };
    }

    const updated: Measurement = {
      ...current,
      reviewStatus: input.status,
      reviewedByUid: input.reviewerUid,
      reviewedAt: nowIso,
      reviewNote: input.note,
    };

    // Explicitly clear reviewNote when undefined so Firestore does not retain
    // a prior rejection note after accept-without-note.
    if (input.note === undefined) {
      delete updated.reviewNote;
    }

    const event: ContributionReviewEvent = {
      id: eventId,
      projectId: input.projectId,
      measurementId: input.measurementId,
      previousStatus,
      nextStatus: input.status,
      reviewerUid: input.reviewerUid,
      createdAt: nowIso,
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    tx.set(measurementRef, updated, { merge: false });
    tx.create(eventRef, event);

    return { kind: "updated" as const, measurement: updated, event };
  });
}
