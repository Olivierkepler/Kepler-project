import type { DeltaStatus } from "../../types/delta";
import type { SavedFieldReport } from "../../types/savedFieldReport";
import type {
  FieldReport,
  FieldReportEvidenceContext,
} from "./fieldReport";

export const SAVED_FIELD_REPORT_SCHEMA_VERSION = 1 as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEvidenceContext(value: unknown): value is FieldReportEvidenceContext {
  return value === "project" || value === "measurement" || value === "delta";
}

function isDeltaStatus(value: unknown): value is DeltaStatus {
  return (
    value === "open" ||
    value === "accepted" ||
    value === "rejected" ||
    value === "resolved"
  );
}

function normalizeFieldReport(value: unknown): FieldReport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.projectId !== "string" ||
    record.projectId.trim().length === 0 ||
    typeof record.projectName !== "string" ||
    typeof record.projectLocation !== "string" ||
    typeof record.periodLabel !== "string" ||
    typeof record.startAt !== "string" ||
    typeof record.endAt !== "string" ||
    typeof record.generatedAt !== "string" ||
    typeof record.hasPeriodActivity !== "boolean" ||
    typeof record.activity !== "object" ||
    record.activity === null ||
    !Array.isArray(record.measurements) ||
    !Array.isArray(record.deltasDocumented) ||
    !Array.isArray(record.openFieldDifferences) ||
    typeof record.documentedImpact !== "object" ||
    record.documentedImpact === null ||
    !Array.isArray(record.evidence) ||
    typeof record.currentDisposition !== "object" ||
    record.currentDisposition === null
  ) {
    return null;
  }

  const activity = record.activity as Record<string, unknown>;
  const documentedImpact = record.documentedImpact as Record<string, unknown>;
  const currentDisposition = record.currentDisposition as Record<string, unknown>;

  if (
    !isFiniteNumber(activity.measurements) ||
    !isFiniteNumber(activity.deltas) ||
    !isFiniteNumber(activity.evidence) ||
    !isFiniteNumber(documentedImpact.costImpact) ||
    !isFiniteNumber(documentedImpact.laborImpactHours) ||
    !isFiniteNumber(documentedImpact.largestRecordedVarianceDays) ||
    !isFiniteNumber(documentedImpact.deltasWithScheduleImpact) ||
    !isFiniteNumber(currentDisposition.open) ||
    !isFiniteNumber(currentDisposition.accepted) ||
    !isFiniteNumber(currentDisposition.rejected) ||
    !isFiniteNumber(currentDisposition.resolved)
  ) {
    return null;
  }

  for (const item of record.measurements) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const row = item as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.label !== "string" ||
      !isFiniteNumber(row.value) ||
      typeof row.unit !== "string" ||
      typeof row.createdAt !== "string"
    ) {
      return null;
    }
  }

  for (const item of [
    ...record.deltasDocumented,
    ...record.openFieldDifferences,
  ]) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const row = item as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.label !== "string" ||
      !isFiniteNumber(row.plannedValue) ||
      !isFiniteNumber(row.actualValue) ||
      !isFiniteNumber(row.difference) ||
      (row.percentDifference !== null && !isFiniteNumber(row.percentDifference)) ||
      typeof row.unit !== "string" ||
      !isFiniteNumber(row.costImpact) ||
      !isFiniteNumber(row.laborImpactHours) ||
      !isFiniteNumber(row.scheduleImpactDays) ||
      !isDeltaStatus(row.status) ||
      typeof row.dispositionReason !== "string" ||
      (row.disposedAt !== null && typeof row.disposedAt !== "string") ||
      typeof row.createdAt !== "string" ||
      typeof row.dispositionOccurredInPeriod !== "boolean"
    ) {
      return null;
    }
  }

  for (const item of record.evidence) {
    if (typeof item !== "object" || item === null) {
      return null;
    }

    const row = item as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      (row.type !== "photo" && row.type !== "note") ||
      !isEvidenceContext(row.context) ||
      typeof row.relatedLabel !== "string" ||
      typeof row.note !== "string" ||
      (row.photoUri !== null && typeof row.photoUri !== "string") ||
      typeof row.createdAt !== "string" ||
      (row.measurementId !== null && typeof row.measurementId !== "string") ||
      (row.deltaId !== null && typeof row.deltaId !== "string")
    ) {
      return null;
    }
  }

  let projectIntelligence: FieldReport["projectIntelligence"] | undefined;

  if (
    typeof record.projectIntelligence === "object" &&
    record.projectIntelligence !== null
  ) {
    const intel = record.projectIntelligence as Record<string, unknown>;
    const intelDisposition = intel.disposition as Record<string, unknown>;
    const intelImpact = intel.documentedImpact as Record<string, unknown>;

    if (
      !isFiniteNumber(intel.totalVariances) ||
      typeof intelDisposition !== "object" ||
      intelDisposition === null ||
      typeof intelImpact !== "object" ||
      intelImpact === null ||
      !isFiniteNumber(intelDisposition.open) ||
      !isFiniteNumber(intelDisposition.accepted) ||
      !isFiniteNumber(intelDisposition.rejected) ||
      !isFiniteNumber(intelDisposition.resolved) ||
      !isFiniteNumber(intelImpact.costImpact) ||
      !isFiniteNumber(intelImpact.laborImpactHours) ||
      !isFiniteNumber(intelImpact.largestRecordedVarianceDays) ||
      !isFiniteNumber(intelImpact.deltasWithScheduleImpact) ||
      !Array.isArray(intel.recentVariances)
    ) {
      return null;
    }

    for (const item of intel.recentVariances) {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const row = item as Record<string, unknown>;

      if (
        typeof row.id !== "string" ||
        typeof row.label !== "string" ||
        !isFiniteNumber(row.recordedFieldQuantity) ||
        !isFiniteNumber(row.difference) ||
        typeof row.unit !== "string" ||
        !isDeltaStatus(row.status) ||
        typeof row.dispositionReason !== "string" ||
        !isFiniteNumber(row.costImpact) ||
        !isFiniteNumber(row.laborImpactHours) ||
        !isFiniteNumber(row.scheduleImpactDays) ||
        typeof row.createdAt !== "string"
      ) {
        return null;
      }
    }

    projectIntelligence = intel as FieldReport["projectIntelligence"];
  }

  return {
    ...(record as FieldReport),
    projectIntelligence:
      projectIntelligence ??
      ({
        totalVariances:
          (currentDisposition.open as number) +
          (currentDisposition.accepted as number) +
          (currentDisposition.rejected as number) +
          (currentDisposition.resolved as number),
        disposition: {
          open: currentDisposition.open as number,
          accepted: currentDisposition.accepted as number,
          rejected: currentDisposition.rejected as number,
          resolved: currentDisposition.resolved as number,
        },
        documentedImpact: {
          costImpact: 0,
          laborImpactHours: 0,
          largestRecordedVarianceDays: 0,
          deltasWithScheduleImpact: 0,
        },
        recentVariances: [],
      } satisfies FieldReport["projectIntelligence"]),
  } as FieldReport;
}

export function createSavedFieldReportId(now: number = Date.now()): string {
  return `saved-report-${now}-${Math.floor(Math.random() * 100000)}`;
}

export function normalizeSavedFieldReport(
  value: unknown,
): SavedFieldReport | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    record.schemaVersion !== SAVED_FIELD_REPORT_SCHEMA_VERSION ||
    typeof record.id !== "string" ||
    record.id.trim().length === 0 ||
    typeof record.projectId !== "string" ||
    record.projectId.trim().length === 0 ||
    typeof record.savedAt !== "string" ||
    record.savedAt.trim().length === 0
  ) {
    return null;
  }

  const snapshot = normalizeFieldReport(record.snapshot);

  if (!snapshot) {
    return null;
  }

  if (snapshot.projectId !== record.projectId) {
    return null;
  }

  return {
    schemaVersion: SAVED_FIELD_REPORT_SCHEMA_VERSION,
    id: record.id,
    projectId: record.projectId,
    savedAt: record.savedAt,
    snapshot,
  };
}

export function sortSavedFieldReportsNewestFirst(
  items: SavedFieldReport[],
): SavedFieldReport[] {
  return [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function buildSavedFieldReport(input: {
  snapshot: FieldReport;
  savedAt?: string;
  id?: string;
}): SavedFieldReport {
  return {
    schemaVersion: SAVED_FIELD_REPORT_SCHEMA_VERSION,
    id: input.id ?? createSavedFieldReportId(),
    projectId: input.snapshot.projectId,
    savedAt: input.savedAt ?? new Date().toISOString(),
    snapshot: input.snapshot,
  };
}
