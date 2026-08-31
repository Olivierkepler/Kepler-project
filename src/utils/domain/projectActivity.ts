import type { Delta, DeltaStatus } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { SavedFieldReport } from "../../types/savedFieldReport";

export type ProjectActivityEvidenceContext =
  | "project"
  | "measurement"
  | "delta";

export type ProjectActivityKind =
  | "savedReport"
  | "evidence"
  | "delta"
  | "measurement";

export type ProjectActivityItem =
  | {
      kind: "measurement";
      id: string;
      projectId: string;
      occurredAt: string;
      measurementId: string;
      label: string;
      value: number;
      unit: string;
      relatedDeltaCount: number;
      relatedEvidenceCount: number;
    }
  | {
      kind: "delta";
      id: string;
      projectId: string;
      occurredAt: string;
      deltaId: string;
      label: string;
      difference: number;
      unit: string;
      status: DeltaStatus;
      costImpact: number;
      laborImpactHours: number;
      scheduleImpactDays: number;
      measurementId: string | null;
      sourceMeasurementValue: number | null;
      sourceMeasurementUnit: string | null;
      relatedEvidenceCount: number;
    }
  | {
      kind: "evidence";
      id: string;
      projectId: string;
      occurredAt: string;
      evidenceId: string;
      evidenceType: "photo" | "note";
      context: ProjectActivityEvidenceContext;
      relatedLabel: string;
      note: string;
      photoUri: string | null;
    }
  | {
      kind: "savedReport";
      id: string;
      projectId: string;
      occurredAt: string;
      savedReportId: string;
      periodLabel: string;
      measurements: number;
      deltas: number;
      evidence: number;
    };

const KIND_SORT_RANK: Record<ProjectActivityKind, number> = {
  savedReport: 0,
  evidence: 1,
  delta: 2,
  measurement: 3,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSigned(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

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

function classifyEvidence(item: Evidence): ProjectActivityEvidenceContext {
  if (item.deltaId) {
    return "delta";
  }

  if (item.measurementId) {
    return "measurement";
  }

  return "project";
}

export function compareProjectActivityItems(
  a: ProjectActivityItem,
  b: ProjectActivityItem,
): number {
  const timeDiff = parseTimestamp(b.occurredAt) - parseTimestamp(a.occurredAt);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const kindDiff = KIND_SORT_RANK[a.kind] - KIND_SORT_RANK[b.kind];

  if (kindDiff !== 0) {
    return kindDiff;
  }

  return a.id.localeCompare(b.id);
}

export function sortProjectActivityItems(
  items: ProjectActivityItem[],
): ProjectActivityItem[] {
  return [...items].sort(compareProjectActivityItems);
}

export function buildProjectActivity(input: {
  projectId: string;
  measurements: Measurement[];
  deltas: Delta[];
  evidence: Evidence[];
  planItems: PlanItem[];
  savedReports: SavedFieldReport[];
}): ProjectActivityItem[] {
  const projectId = input.projectId.trim();

  if (!projectId) {
    return [];
  }

  const measurements = input.measurements.filter(
    (item) => item.projectId === projectId,
  );
  const deltas = input.deltas.filter((item) => item.projectId === projectId);
  const evidence = input.evidence.filter((item) => item.projectId === projectId);
  const planItems = input.planItems.filter(
    (item) => item.projectId === projectId,
  );
  const savedReports = input.savedReports.filter(
    (item) => item.projectId === projectId,
  );

  const planItemsById = new Map(planItems.map((item) => [item.id, item]));
  const measurementsById = new Map(
    measurements.map((item) => [item.id, item]),
  );

  const relatedDeltaCountByMeasurementId = new Map<string, number>();
  const relatedEvidenceCountByMeasurementId = new Map<string, number>();
  const relatedEvidenceCountByDeltaId = new Map<string, number>();

  for (const delta of deltas) {
    if (delta.measurementId) {
      relatedDeltaCountByMeasurementId.set(
        delta.measurementId,
        (relatedDeltaCountByMeasurementId.get(delta.measurementId) ?? 0) + 1,
      );
    }
  }

  for (const item of evidence) {
    if (item.measurementId) {
      relatedEvidenceCountByMeasurementId.set(
        item.measurementId,
        (relatedEvidenceCountByMeasurementId.get(item.measurementId) ?? 0) + 1,
      );
    }

    if (item.deltaId) {
      relatedEvidenceCountByDeltaId.set(
        item.deltaId,
        (relatedEvidenceCountByDeltaId.get(item.deltaId) ?? 0) + 1,
      );
    }
  }

  const items: ProjectActivityItem[] = [];

  for (const measurement of measurements) {
    if (typeof measurement.createdAt !== "string") {
      continue;
    }

    items.push({
      kind: "measurement",
      id: `measurement:${measurement.id}`,
      projectId,
      occurredAt: measurement.createdAt,
      measurementId: measurement.id,
      label:
        measurement.label.trim().length > 0
          ? measurement.label
          : resolvePlanLabel(planItemsById, measurement.planItemId),
      value: isFiniteNumber(measurement.value) ? measurement.value : 0,
      unit: measurement.unit,
      relatedDeltaCount:
        relatedDeltaCountByMeasurementId.get(measurement.id) ?? 0,
      relatedEvidenceCount:
        relatedEvidenceCountByMeasurementId.get(measurement.id) ?? 0,
    });
  }

  for (const delta of deltas) {
    if (typeof delta.createdAt !== "string") {
      continue;
    }

    const sourceMeasurement =
      delta.measurementId != null
        ? measurementsById.get(delta.measurementId)
        : undefined;

    items.push({
      kind: "delta",
      id: `delta:${delta.id}`,
      projectId,
      occurredAt: delta.createdAt,
      deltaId: delta.id,
      label: resolvePlanLabel(planItemsById, delta.planItemId),
      difference: isFiniteNumber(delta.difference)
        ? normalizeSigned(delta.difference)
        : 0,
      unit: delta.unit,
      status: delta.status,
      costImpact: isFiniteNumber(delta.costImpact)
        ? normalizeSigned(delta.costImpact)
        : 0,
      laborImpactHours: isFiniteNumber(delta.laborImpactHours)
        ? normalizeSigned(delta.laborImpactHours)
        : 0,
      scheduleImpactDays: isFiniteNumber(delta.scheduleImpactDays)
        ? normalizeSigned(delta.scheduleImpactDays)
        : 0,
      measurementId: delta.measurementId ?? null,
      sourceMeasurementValue:
        sourceMeasurement && isFiniteNumber(sourceMeasurement.value)
          ? sourceMeasurement.value
          : null,
      sourceMeasurementUnit: sourceMeasurement?.unit ?? null,
      relatedEvidenceCount: relatedEvidenceCountByDeltaId.get(delta.id) ?? 0,
    });
  }

  for (const item of evidence) {
    if (typeof item.createdAt !== "string") {
      continue;
    }

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

    items.push({
      kind: "evidence",
      id: `evidence:${item.id}`,
      projectId,
      occurredAt: item.createdAt,
      evidenceId: item.id,
      evidenceType: item.type,
      context,
      relatedLabel,
      note: item.note,
      photoUri: item.photoUri,
    });
  }

  for (const saved of savedReports) {
    if (typeof saved.savedAt !== "string") {
      continue;
    }

    items.push({
      kind: "savedReport",
      id: `savedReport:${saved.id}`,
      projectId,
      occurredAt: saved.savedAt,
      savedReportId: saved.id,
      periodLabel: saved.snapshot.periodLabel,
      measurements: saved.snapshot.activity.measurements,
      deltas: saved.snapshot.activity.deltas,
      evidence: saved.snapshot.activity.evidence,
    });
  }

  return sortProjectActivityItems(items);
}

export type ActivityFilter =
  | "all"
  | "measurement"
  | "delta"
  | "evidence"
  | "savedReport";

export type ProjectActivityCounts = Record<ActivityFilter, number>;

export function countProjectActivityByFilter(
  items: ProjectActivityItem[],
): ProjectActivityCounts {
  let measurements = 0;
  let deltas = 0;
  let evidence = 0;
  let savedReports = 0;

  for (const item of items) {
    if (item.kind === "measurement") {
      measurements += 1;
    } else if (item.kind === "delta") {
      deltas += 1;
    } else if (item.kind === "evidence") {
      evidence += 1;
    } else if (item.kind === "savedReport") {
      savedReports += 1;
    }
  }

  return {
    all: items.length,
    measurement: measurements,
    delta: deltas,
    evidence,
    savedReport: savedReports,
  };
}

export function filterProjectActivity(
  items: ProjectActivityItem[],
  filter: ActivityFilter,
): ProjectActivityItem[] {
  if (filter === "all") {
    return items;
  }

  return items.filter((item) => item.kind === filter);
}
