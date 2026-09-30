import type {
  ProjectProgressBaselinePoint,
} from "../domain/projectProgress.js";
import { isFiniteNumber, isRecord } from "./primitives.js";

export type ProjectProgressBaselineInput = Pick<
  ProjectProgressBaselinePoint,
  "effectiveDate" | "plannedPercent"
>;

export type ProjectProgressSnapshotInput = {
  capturedAt: string;
  actualPercent: number;
};

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isPercent(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

export function parseProjectProgressBaselineInput(
  value: unknown,
): ProjectProgressBaselineInput | null {
  if (!isRecord(value)) return null;
  if (!isValidDateOnly(value.effectiveDate) || !isPercent(value.plannedPercent)) {
    return null;
  }

  return {
    effectiveDate: value.effectiveDate,
    plannedPercent: value.plannedPercent,
  };
}

export function parseProjectProgressSnapshotInput(
  value: unknown,
): ProjectProgressSnapshotInput | null {
  if (!isRecord(value)) return null;
  if (!isCanonicalIsoTimestamp(value.capturedAt) || !isPercent(value.actualPercent)) {
    return null;
  }

  return {
    capturedAt: value.capturedAt,
    actualPercent: value.actualPercent,
  };
}
