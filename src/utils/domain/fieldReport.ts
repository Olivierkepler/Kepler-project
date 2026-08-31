import type { Delta, DeltaStatus } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { Project } from "../../types/project";
import {
  buildProjectIntelligence,
  type ProjectIntelligenceVariance,
} from "./projectIntelligence";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSigned(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function addFinite(sum: number, value: unknown): number {
  if (!isFiniteNumber(value)) {
    return sum;
  }

  return normalizeSigned(sum + value);
}

/** YYYY-MM-DD only. */
export function isValidLocalDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const probe = new Date(year, month - 1, day);

  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local midnight for a calendar day as ISO instant. */
export function localDateInputToStartIso(dateInput: string): string {
  if (!isValidLocalDateInput(dateInput)) {
    throw new Error("Invalid local date input.");
  }

  const [yearText, monthText, dayText] = dateInput.split("-");
  const date = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    0,
    0,
    0,
    0,
  );

  return date.toISOString();
}

/** Exclusive end = local midnight of the day after dateInput. */
export function localDateInputToExclusiveEndIso(dateInput: string): string {
  if (!isValidLocalDateInput(dateInput)) {
    throw new Error("Invalid local date input.");
  }

  const [yearText, monthText, dayText] = dateInput.split("-");
  const date = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText) + 1,
    0,
    0,
    0,
    0,
  );

  return date.toISOString();
}

export type FieldReportPeriodPreset = "today" | "last7" | "custom";

/**
 * Inclusive local start day → exclusive next-midnight end.
 * Today: [today 00:00, tomorrow 00:00)
 * Last 7: [today-6 00:00, tomorrow 00:00)
 */
export function resolveFieldReportRange(
  preset: Exclude<FieldReportPeriodPreset, "custom">,
  now: Date = new Date(),
): { startAt: string; endAt: string; label: string } {
  const todayLocal = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const tomorrowLocal = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );

  if (preset === "today") {
    return {
      startAt: todayLocal.toISOString(),
      endAt: tomorrowLocal.toISOString(),
      label: "Today",
    };
  }

  const startLocal = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
    0,
    0,
    0,
    0,
  );

  return {
    startAt: startLocal.toISOString(),
    endAt: tomorrowLocal.toISOString(),
    label: "Last 7 Days",
  };
}

export function resolveCustomFieldReportRange(
  startDateInput: string,
  endDateInput: string,
):
  | { ok: true; startAt: string; endAt: string; label: string }
  | { ok: false; error: string } {
  if (
    !isValidLocalDateInput(startDateInput) ||
    !isValidLocalDateInput(endDateInput)
  ) {
    return {
      ok: false,
      error: "Enter dates as YYYY-MM-DD.",
    };
  }

  if (endDateInput < startDateInput) {
    return {
      ok: false,
      error: "End date must be on or after start date.",
    };
  }

  return {
    ok: true,
    startAt: localDateInputToStartIso(startDateInput),
    endAt: localDateInputToExclusiveEndIso(endDateInput),
    label: `${startDateInput} → ${endDateInput}`,
  };
}

export function isTimestampInRange(
  timestamp: string,
  startAt: string,
  endAt: string,
): boolean {
  if (typeof timestamp !== "string" || timestamp.trim().length === 0) {
    return false;
  }

  const value = Date.parse(timestamp);
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);

  if (
    !Number.isFinite(value) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return false;
  }

  return value >= start && value < end;
}

export type FieldReportEvidenceContext =
  | "project"
  | "measurement"
  | "delta";

export type FieldReportDispositionCounts = {
  open: number;
  accepted: number;
  rejected: number;
  resolved: number;
};

export type FieldReportDocumentedImpact = {
  costImpact: number;
  laborImpactHours: number;
  largestRecordedVarianceDays: number;
  deltasWithScheduleImpact: number;
};

export type FieldReportProjectIntelligence = {
  totalVariances: number;
  disposition: FieldReportDispositionCounts;
  documentedImpact: FieldReportDocumentedImpact;
  recentVariances: ProjectIntelligenceVariance[];
};

export type FieldReportMeasurementRow = {
  id: string;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
};

export type FieldReportDeltaRow = {
  id: string;
  label: string;
  plannedValue: number;
  actualValue: number;
  difference: number;
  percentDifference: number | null;
  unit: string;
  costImpact: number;
  laborImpactHours: number;
  scheduleImpactDays: number;
  status: DeltaStatus;
  dispositionReason: string;
  disposedAt: string | null;
  createdAt: string;
  dispositionOccurredInPeriod: boolean;
};

export type FieldReportEvidenceRow = {
  id: string;
  type: "photo" | "note";
  context: FieldReportEvidenceContext;
  relatedLabel: string;
  note: string;
  photoUri: string | null;
  createdAt: string;
  measurementId: string | null;
  deltaId: string | null;
};

export type FieldReport = {
  projectId: string;
  projectName: string;
  projectLocation: string;
  periodLabel: string;
  startAt: string;
  endAt: string;
  generatedAt: string;
  hasPeriodActivity: boolean;
  activity: {
    measurements: number;
    deltas: number;
    evidence: number;
  };
  measurements: FieldReportMeasurementRow[];
  deltasDocumented: FieldReportDeltaRow[];
  openFieldDifferences: FieldReportDeltaRow[];
  documentedImpact: FieldReportDocumentedImpact;
  evidence: FieldReportEvidenceRow[];
  currentDisposition: FieldReportDispositionCounts;
  /** Read-only project-level intelligence from all authoritative Delta records. */
  projectIntelligence: FieldReportProjectIntelligence;
};

function resolvePlanLabel(
  planItemsById: Map<string, PlanItem>,
  planItemId: string,
): string {
  return planItemsById.get(planItemId)?.label ?? "Untitled plan item";
}

function resolveMeasurementLabel(
  measurementsById: Map<string, Measurement>,
  planItemsById: Map<string, PlanItem>,
  measurementId: string,
): string {
  const measurement = measurementsById.get(measurementId);

  if (!measurement) {
    return "Measurement";
  }

  if (measurement.label.trim().length > 0) {
    return measurement.label;
  }

  return resolvePlanLabel(planItemsById, measurement.planItemId);
}

function classifyEvidence(item: Evidence): FieldReportEvidenceContext {
  if (item.deltaId) {
    return "delta";
  }

  if (item.measurementId) {
    return "measurement";
  }

  return "project";
}

function buildDocumentedImpact(deltas: Delta[]): FieldReportDocumentedImpact {
  let costImpact = 0;
  let laborImpactHours = 0;
  let largestAbs = 0;
  let largestSigned = 0;
  let withSchedule = 0;

  for (const delta of deltas) {
    costImpact = addFinite(costImpact, delta.costImpact);
    laborImpactHours = addFinite(laborImpactHours, delta.laborImpactHours);

    if (!isFiniteNumber(delta.scheduleImpactDays)) {
      continue;
    }

    const schedule = normalizeSigned(delta.scheduleImpactDays);

    if (schedule !== 0) {
      withSchedule += 1;
    }

    const abs = Math.abs(schedule);

    if (abs > largestAbs) {
      largestAbs = abs;
      largestSigned = schedule;
    }
  }

  return {
    costImpact: normalizeSigned(costImpact),
    laborImpactHours: normalizeSigned(laborImpactHours),
    largestRecordedVarianceDays: largestSigned,
    deltasWithScheduleImpact: withSchedule,
  };
}

function countDisposition(deltas: Delta[]): FieldReportDispositionCounts {
  const counts: FieldReportDispositionCounts = {
    open: 0,
    accepted: 0,
    rejected: 0,
    resolved: 0,
  };

  for (const delta of deltas) {
    if (delta.status === "open") {
      counts.open += 1;
    } else if (delta.status === "accepted") {
      counts.accepted += 1;
    } else if (delta.status === "rejected") {
      counts.rejected += 1;
    } else if (delta.status === "resolved") {
      counts.resolved += 1;
    }
  }

  return counts;
}

function buildFieldReportProjectIntelligence(input: {
  measurements: Measurement[];
  deltas: Delta[];
  evidence: Evidence[];
  planItems: PlanItem[];
}): FieldReportProjectIntelligence {
  const intelligence = buildProjectIntelligence({
    measurements: input.measurements,
    deltas: input.deltas,
    evidence: input.evidence,
    planItems: input.planItems,
    recentVariancesLimit: 8,
  });

  return {
    totalVariances: intelligence.deltas,
    disposition: { ...intelligence.disposition },
    documentedImpact: {
      costImpact: intelligence.documentedImpact.costImpact,
      laborImpactHours: intelligence.documentedImpact.laborImpactHours,
      largestRecordedVarianceDays:
        intelligence.documentedSchedule.largestRecordedVarianceDays,
      deltasWithScheduleImpact:
        intelligence.documentedSchedule.deltasWithScheduleImpact,
    },
    recentVariances: intelligence.recentVariances,
  };
}

function toDeltaRow(
  delta: Delta,
  planItemsById: Map<string, PlanItem>,
  startAt: string,
  endAt: string,
): FieldReportDeltaRow {
  return {
    id: delta.id,
    label: resolvePlanLabel(planItemsById, delta.planItemId),
    plannedValue: isFiniteNumber(delta.plannedValue) ? delta.plannedValue : 0,
    actualValue: isFiniteNumber(delta.actualValue) ? delta.actualValue : 0,
    difference: isFiniteNumber(delta.difference)
      ? normalizeSigned(delta.difference)
      : 0,
    percentDifference:
      delta.percentDifference === null ||
      !isFiniteNumber(delta.percentDifference)
        ? null
        : normalizeSigned(delta.percentDifference),
    unit: delta.unit,
    costImpact: isFiniteNumber(delta.costImpact)
      ? normalizeSigned(delta.costImpact)
      : 0,
    laborImpactHours: isFiniteNumber(delta.laborImpactHours)
      ? normalizeSigned(delta.laborImpactHours)
      : 0,
    scheduleImpactDays: isFiniteNumber(delta.scheduleImpactDays)
      ? normalizeSigned(delta.scheduleImpactDays)
      : 0,
    status: delta.status,
    dispositionReason: delta.dispositionReason,
    disposedAt: delta.disposedAt,
    createdAt: delta.createdAt,
    dispositionOccurredInPeriod:
      delta.disposedAt != null &&
      isTimestampInRange(delta.disposedAt, startAt, endAt),
  };
}

/**
 * Pure field-report builder.
 * Inputs must already be owner-scoped; builder also re-filters by projectId.
 * Period activity uses createdAt in [startAt, endAt).
 */
export function buildFieldReport(input: {
  project: Project;
  measurements: Measurement[];
  deltas: Delta[];
  evidence: Evidence[];
  planItems: PlanItem[];
  startAt: string;
  endAt: string;
  periodLabel: string;
  generatedAt: string;
}): FieldReport {
  const projectId = input.project.id;

  const measurements = input.measurements.filter(
    (item) => item.projectId === projectId,
  );
  const deltas = input.deltas.filter((item) => item.projectId === projectId);
  const evidence = input.evidence.filter(
    (item) => item.projectId === projectId,
  );
  const planItems = input.planItems.filter(
    (item) => item.projectId === projectId,
  );

  const planItemsById = new Map(planItems.map((item) => [item.id, item]));
  const measurementsById = new Map(
    measurements.map((item) => [item.id, item]),
  );

  const periodMeasurements = measurements
    .filter((item) =>
      isTimestampInRange(item.createdAt, input.startAt, input.endAt),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const periodDeltas = deltas
    .filter((item) =>
      isTimestampInRange(item.createdAt, input.startAt, input.endAt),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const periodEvidence = evidence
    .filter((item) =>
      isTimestampInRange(item.createdAt, input.startAt, input.endAt),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const measurementRows: FieldReportMeasurementRow[] = periodMeasurements.map(
    (item) => ({
      id: item.id,
      label:
        item.label.trim().length > 0
          ? item.label
          : resolvePlanLabel(planItemsById, item.planItemId),
      value: isFiniteNumber(item.value) ? item.value : 0,
      unit: item.unit,
      createdAt: item.createdAt,
    }),
  );

  const deltaRows = periodDeltas.map((delta) =>
    toDeltaRow(delta, planItemsById, input.startAt, input.endAt),
  );

  const openFieldDifferences = deltaRows.filter(
    (delta) => delta.status === "open",
  );

  const evidenceRows: FieldReportEvidenceRow[] = periodEvidence.map((item) => {
    const context = classifyEvidence(item);
    let relatedLabel = "Project evidence";

    if (context === "delta" && item.deltaId) {
      const delta = deltas.find((entry) => entry.id === item.deltaId);
      relatedLabel = delta
        ? resolvePlanLabel(planItemsById, delta.planItemId)
        : "Delta evidence";
    } else if (context === "measurement" && item.measurementId) {
      relatedLabel = resolveMeasurementLabel(
        measurementsById,
        planItemsById,
        item.measurementId,
      );
    }

    return {
      id: item.id,
      type: item.type,
      context,
      relatedLabel,
      note: item.note,
      photoUri: item.photoUri,
      createdAt: item.createdAt,
      measurementId: item.measurementId,
      deltaId: item.deltaId,
    };
  });

  const hasPeriodActivity =
    measurementRows.length > 0 ||
    deltaRows.length > 0 ||
    evidenceRows.length > 0;

  return {
    projectId: input.project.id,
    projectName: input.project.name,
    projectLocation: input.project.location,
    periodLabel: input.periodLabel,
    startAt: input.startAt,
    endAt: input.endAt,
    generatedAt: input.generatedAt,
    hasPeriodActivity,
    activity: {
      measurements: measurementRows.length,
      deltas: deltaRows.length,
      evidence: evidenceRows.length,
    },
    measurements: measurementRows,
    deltasDocumented: deltaRows,
    openFieldDifferences,
    documentedImpact: buildDocumentedImpact(periodDeltas),
    evidence: evidenceRows,
    currentDisposition: countDisposition(deltas),
    projectIntelligence: buildFieldReportProjectIntelligence({
      measurements,
      deltas,
      evidence,
      planItems,
    }),
  };
}
