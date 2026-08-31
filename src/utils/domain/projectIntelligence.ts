import type { Delta, DeltaStatus } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Normalize -0 to 0 for display-safe aggregates. */
function normalizeSigned(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function addFinite(sum: number, value: unknown): number {
  if (!isFiniteNumber(value)) {
    return sum;
  }

  return normalizeSigned(sum + value);
}

export type ProjectIntelligenceDisposition = {
  open: number;
  accepted: number;
  rejected: number;
  resolved: number;
};

export type ProjectIntelligenceCostLabor = {
  costImpact: number;
  laborImpactHours: number;
};

export type ProjectIntelligenceScheduleSummary = {
  /** Signed scheduleImpactDays of the delta with largest |scheduleImpactDays|. */
  largestRecordedVarianceDays: number;
  deltasWithScheduleImpact: number;
};

export type ProjectIntelligenceEvidenceCoverage = {
  total: number;
  project: number;
  measurement: number;
  delta: number;
  deltasWithEvidence: number;
  openDeltasWithEvidence: number;
  totalDeltas: number;
  openDeltas: number;
};

export type ProjectIntelligenceOpenDelta = {
  id: string;
  label: string;
  difference: number;
  unit: string;
  costImpact: number;
  evidenceCount: number;
  createdAt: string;
};

/** Read-only variance row derived from authoritative Delta records. */
export type ProjectIntelligenceVariance = {
  id: string;
  label: string;
  /** Recorded field quantity stored on the Delta (from Measurement at documentation time). */
  recordedFieldQuantity: number;
  difference: number;
  unit: string;
  status: DeltaStatus;
  dispositionReason: string;
  costImpact: number;
  laborImpactHours: number;
  scheduleImpactDays: number;
  createdAt: string;
};

export type ProjectIntelligenceActivityKind =
  | "measurement"
  | "delta"
  | "delta_disposition"
  | "evidence_photo"
  | "evidence_note";

export type ProjectIntelligenceActivityItem = {
  id: string;
  kind: ProjectIntelligenceActivityKind;
  title: string;
  subtitle: string;
  at: string;
  measurementId?: string;
  deltaId?: string;
};

export type ProjectIntelligenceSummary = {
  measurements: number;
  deltas: number;
  evidence: number;
  disposition: ProjectIntelligenceDisposition;
  openImpact: ProjectIntelligenceCostLabor;
  documentedImpact: ProjectIntelligenceCostLabor;
  openSchedule: ProjectIntelligenceScheduleSummary;
  documentedSchedule: ProjectIntelligenceScheduleSummary;
  evidenceCoverage: ProjectIntelligenceEvidenceCoverage;
  needsAttention: ProjectIntelligenceOpenDelta[];
  /** Newest variances across every disposition (read-only Delta snapshot). */
  recentVariances: ProjectIntelligenceVariance[];
  recentActivity: ProjectIntelligenceActivityItem[];
};

function toVarianceRow(
  delta: Delta,
  planItemsById: Map<string, PlanItem>,
): ProjectIntelligenceVariance {
  return {
    id: delta.id,
    label: resolvePlanLabel(planItemsById, delta.planItemId),
    recordedFieldQuantity: isFiniteNumber(delta.actualValue)
      ? normalizeSigned(delta.actualValue)
      : 0,
    difference: isFiniteNumber(delta.difference)
      ? normalizeSigned(delta.difference)
      : 0,
    unit: delta.unit,
    status: delta.status,
    dispositionReason: delta.dispositionReason,
    costImpact: isFiniteNumber(delta.costImpact)
      ? normalizeSigned(delta.costImpact)
      : 0,
    laborImpactHours: isFiniteNumber(delta.laborImpactHours)
      ? normalizeSigned(delta.laborImpactHours)
      : 0,
    scheduleImpactDays: isFiniteNumber(delta.scheduleImpactDays)
      ? normalizeSigned(delta.scheduleImpactDays)
      : 0,
    createdAt: delta.createdAt,
  };
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

function buildScheduleSummary(
  deltas: Delta[],
): ProjectIntelligenceScheduleSummary {
  let largestAbs = 0;
  let largestSigned = 0;
  let withImpact = 0;

  for (const delta of deltas) {
    if (!isFiniteNumber(delta.scheduleImpactDays)) {
      continue;
    }

    const value = normalizeSigned(delta.scheduleImpactDays);

    if (value !== 0) {
      withImpact += 1;
    }

    const abs = Math.abs(value);

    if (abs > largestAbs) {
      largestAbs = abs;
      largestSigned = value;
    }
  }

  return {
    largestRecordedVarianceDays: largestSigned,
    deltasWithScheduleImpact: withImpact,
  };
}

function buildCostLaborImpact(deltas: Delta[]): ProjectIntelligenceCostLabor {
  let costImpact = 0;
  let laborImpactHours = 0;

  for (const delta of deltas) {
    costImpact = addFinite(costImpact, delta.costImpact);
    laborImpactHours = addFinite(laborImpactHours, delta.laborImpactHours);
  }

  return {
    costImpact: normalizeSigned(costImpact),
    laborImpactHours: normalizeSigned(laborImpactHours),
  };
}

function dispositionTitle(status: DeltaStatus): string {
  switch (status) {
    case "accepted":
      return "DELTA ACCEPTED";
    case "rejected":
      return "DELTA REJECTED";
    case "resolved":
      return "DELTA RESOLVED";
    default:
      return "DELTA";
  }
}

/**
 * Pure project field-intelligence aggregation.
 * Inputs must already be owner- and project-scoped.
 */
export function buildProjectIntelligence(input: {
  measurements: Measurement[];
  deltas: Delta[];
  evidence: Evidence[];
  planItems: PlanItem[];
  activityLimit?: number;
  needsAttentionLimit?: number;
  recentVariancesLimit?: number;
}): ProjectIntelligenceSummary {
  const activityLimit = input.activityLimit ?? 8;
  const needsAttentionLimit = input.needsAttentionLimit ?? 5;
  const recentVariancesLimit = input.recentVariancesLimit ?? 8;

  const planItemsById = new Map(
    input.planItems.map((item) => [item.id, item]),
  );
  const measurementsById = new Map(
    input.measurements.map((item) => [item.id, item]),
  );

  const disposition: ProjectIntelligenceDisposition = {
    open: 0,
    accepted: 0,
    rejected: 0,
    resolved: 0,
  };

  for (const delta of input.deltas) {
    if (delta.status === "open") {
      disposition.open += 1;
    } else if (delta.status === "accepted") {
      disposition.accepted += 1;
    } else if (delta.status === "rejected") {
      disposition.rejected += 1;
    } else if (delta.status === "resolved") {
      disposition.resolved += 1;
    }
  }

  const openDeltas = input.deltas.filter((delta) => delta.status === "open");

  const evidenceByDeltaId = new Map<string, number>();
  let projectEvidence = 0;
  let measurementEvidence = 0;
  let deltaEvidence = 0;

  for (const item of input.evidence) {
    if (item.deltaId) {
      deltaEvidence += 1;
      evidenceByDeltaId.set(
        item.deltaId,
        (evidenceByDeltaId.get(item.deltaId) ?? 0) + 1,
      );
    } else if (item.measurementId) {
      measurementEvidence += 1;
    } else {
      projectEvidence += 1;
    }
  }

  let deltasWithEvidence = 0;
  let openDeltasWithEvidence = 0;

  for (const delta of input.deltas) {
    if ((evidenceByDeltaId.get(delta.id) ?? 0) > 0) {
      deltasWithEvidence += 1;

      if (delta.status === "open") {
        openDeltasWithEvidence += 1;
      }
    }
  }

  const needsAttention: ProjectIntelligenceOpenDelta[] = [...openDeltas]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, needsAttentionLimit)
    .map((delta) => {
      const cost = isFiniteNumber(delta.costImpact)
        ? normalizeSigned(delta.costImpact)
        : 0;
      const difference = isFiniteNumber(delta.difference)
        ? normalizeSigned(delta.difference)
        : 0;

      return {
        id: delta.id,
        label: resolvePlanLabel(planItemsById, delta.planItemId),
        difference,
        unit: delta.unit,
        costImpact: cost,
        evidenceCount: evidenceByDeltaId.get(delta.id) ?? 0,
        createdAt: delta.createdAt,
      };
    });

  const activity: ProjectIntelligenceActivityItem[] = [];

  for (const measurement of input.measurements) {
    const value = isFiniteNumber(measurement.value)
      ? measurement.value
      : null;
    const label = resolveMeasurementLabel(
      measurementsById,
      planItemsById,
      measurement.id,
    );

    activity.push({
      id: `measurement:${measurement.id}`,
      kind: "measurement",
      title: "MEASUREMENT",
      subtitle:
        value === null
          ? label
          : `${label} · ${value.toFixed(2)} ${measurement.unit}`,
      at: measurement.createdAt,
      measurementId: measurement.id,
    });
  }

  for (const delta of input.deltas) {
    const label = resolvePlanLabel(planItemsById, delta.planItemId);
    const difference = isFiniteNumber(delta.difference)
      ? normalizeSigned(delta.difference)
      : null;

    activity.push({
      id: `delta:${delta.id}`,
      kind: "delta",
      title: "DELTA",
      subtitle:
        difference === null
          ? label
          : `${label} · ${difference > 0 ? "+" : ""}${difference.toFixed(2)} ${delta.unit}`,
      at: delta.createdAt,
      deltaId: delta.id,
    });

    // Current disposition only — Phase 56 does not store transition history.
    if (delta.status !== "open" && delta.disposedAt) {
      activity.push({
        id: `delta-disposition:${delta.id}`,
        kind: "delta_disposition",
        title: dispositionTitle(delta.status),
        subtitle: label,
        at: delta.disposedAt,
        deltaId: delta.id,
      });
    }
  }

  for (const item of input.evidence) {
    let subtitle = "Project evidence";

    if (item.deltaId) {
      const delta = input.deltas.find((entry) => entry.id === item.deltaId);
      subtitle = delta
        ? resolvePlanLabel(planItemsById, delta.planItemId)
        : "Delta evidence";
    } else if (item.measurementId) {
      subtitle = resolveMeasurementLabel(
        measurementsById,
        planItemsById,
        item.measurementId,
      );
    }

    activity.push({
      id: `evidence:${item.id}`,
      kind: item.type === "photo" ? "evidence_photo" : "evidence_note",
      title: item.type === "photo" ? "PHOTO EVIDENCE" : "NOTE EVIDENCE",
      subtitle,
      at: item.createdAt,
      measurementId: item.measurementId ?? undefined,
      deltaId: item.deltaId ?? undefined,
    });
  }

  const recentActivity = activity
    .filter((item) => typeof item.at === "string" && item.at.trim().length > 0)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, activityLimit);

  const recentVariances = [...input.deltas]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, recentVariancesLimit)
    .map((delta) => toVarianceRow(delta, planItemsById));

  return {
    measurements: input.measurements.length,
    deltas: input.deltas.length,
    evidence: input.evidence.length,
    disposition,
    openImpact: buildCostLaborImpact(openDeltas),
    documentedImpact: buildCostLaborImpact(input.deltas),
    openSchedule: buildScheduleSummary(openDeltas),
    documentedSchedule: buildScheduleSummary(input.deltas),
    evidenceCoverage: {
      total: input.evidence.length,
      project: projectEvidence,
      measurement: measurementEvidence,
      delta: deltaEvidence,
      deltasWithEvidence,
      openDeltasWithEvidence,
      totalDeltas: input.deltas.length,
      openDeltas: disposition.open,
    },
    needsAttention,
    recentVariances,
    recentActivity,
  };
}
