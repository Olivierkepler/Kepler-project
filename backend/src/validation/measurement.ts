import type {
  Measurement,
  MeasurementType,
} from "../domain/measurement.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord,
} from "./primitives.js";

const MEASUREMENT_TYPES: readonly MeasurementType[] = [
  "length",
  "area",
  "count",
  "volume",
];

/**
 * Server-managed contribution fields. Presence in create payloads is rejected
 * so clients cannot spoof review or provenance (Phase 2J.1).
 */
const SERVER_MANAGED_MEASUREMENT_KEYS = [
  "capturedByUid",
  "reviewStatus",
  "reviewedByUid",
  "reviewedAt",
  "reviewNote",
  "capturedByProjectMemberId",
  "submittedAssignmentId",
  "submittedWorkPackageId",
] as const;

function isMeasurementType(value: unknown): value is MeasurementType {
  return (
    typeof value === "string" &&
    (MEASUREMENT_TYPES as readonly string[]).includes(value)
  );
}

function hasServerManagedMeasurementKeys(
  body: Record<string, unknown>,
): boolean {
  return SERVER_MANAGED_MEASUREMENT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(body, key),
  );
}

/**
 * Parses create-only Measurement payloads (POST /api/measurements).
 * Requires localMeasurementId. Client may supply remote id + project/plan IDs.
 * Server-managed review/provenance keys are rejected if present.
 */
export function parseMeasurement(body: unknown): Measurement | null {
  if (!isRecord(body)) {
    return null;
  }

  if (hasServerManagedMeasurementKeys(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.id) ||
    !isNonEmptyString(body.localMeasurementId) ||
    body.localMeasurementId.includes("/") ||
    !isNonEmptyString(body.projectId) ||
    !isNonEmptyString(body.planItemId) ||
    !isMeasurementType(body.type) ||
    !isNonEmptyString(body.label) ||
    !isFiniteNumber(body.value) ||
    !isNonEmptyString(body.unit) ||
    !isNonEmptyString(body.createdAt)
  ) {
    return null;
  }

  return {
    id: body.id,
    localMeasurementId: body.localMeasurementId,
    projectId: body.projectId,
    planItemId: body.planItemId,
    type: body.type,
    label: body.label,
    value: body.value,
    unit: body.unit,
    createdAt: body.createdAt,
  };
}

export type MeasurementBootstrapItemInput = {
  localMeasurementId: string;
  localPlanItemId: string;
  type: MeasurementType;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
};

export function parseMeasurementBootstrapItem(
  body: unknown,
): MeasurementBootstrapItemInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (hasServerManagedMeasurementKeys(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.localMeasurementId) ||
    body.localMeasurementId.includes("/") ||
    !isNonEmptyString(body.localPlanItemId) ||
    body.localPlanItemId.includes("/") ||
    !isMeasurementType(body.type) ||
    !isNonEmptyString(body.label) ||
    !isFiniteNumber(body.value) ||
    !isNonEmptyString(body.unit) ||
    !isNonEmptyString(body.createdAt)
  ) {
    return null;
  }

  return {
    localMeasurementId: body.localMeasurementId,
    localPlanItemId: body.localPlanItemId,
    type: body.type,
    label: body.label,
    value: body.value,
    unit: body.unit,
    createdAt: body.createdAt,
  };
}

export function parseMeasurementBootstrapBody(
  body: unknown,
): MeasurementBootstrapItemInput[] | null {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return null;
  }

  if (body.items.length === 0) {
    return null;
  }

  const items: MeasurementBootstrapItemInput[] = [];

  for (const entry of body.items) {
    const parsed = parseMeasurementBootstrapItem(entry);
    if (!parsed) {
      return null;
    }
    items.push(parsed);
  }

  return items;
}

export type MeasurementContributionReviewInput = {
  status: "accepted" | "rejected";
  note?: string;
};

/**
 * Parses owner review PATCH body.
 * Accepts only status (accepted|rejected) and optional note.
 * Rejects pending and any server attribution fields.
 */
export function parseMeasurementContributionReviewBody(
  body: unknown,
): MeasurementContributionReviewInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const disallowedKeys = [
    "reviewedByUid",
    "reviewedAt",
    "ownerUid",
    "projectId",
    "measurementId",
    "reviewStatus",
    "reviewNote",
    "previousStatus",
    "nextStatus",
    "reviewerUid",
  ] as const;

  for (const key of disallowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return null;
    }
  }

  // status:"pending" is intentionally rejected (not an allowed review mutation).
  if (body.status !== "accepted" && body.status !== "rejected") {
    return null;
  }

  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    return null;
  }

  const result: MeasurementContributionReviewInput = {
    status: body.status,
  };

  if (typeof body.note === "string") {
    result.note = body.note;
  }

  return result;
}
