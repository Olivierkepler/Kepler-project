import type { AgentRunSummary } from "../../types/agentRun";
import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem, PlanItemType } from "../../types/plan";

/**
 * Read-only helpers that resolve PlanItem ↔ Measurement ↔ Delta ↔ Evidence ↔ AgentRun
 * from existing records. Does not invent variance or mutate domain state.
 */

export function formatPlanItemTypeLabel(type: PlanItemType): string {
  switch (type) {
    case "length":
      return "LENGTH";
    case "area":
      return "AREA";
    case "count":
      return "COUNT";
    case "volume":
      return "VOLUME";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Matches MeasurementScreen eligibility: length PlanItems in feet only.
 */
export function canMeasureAgainstPlanItem(planItem: PlanItem): boolean {
  return planItem.type === "length" && planItem.unit === "ft";
}

export function getMeasurementsForPlanItem(
  measurements: readonly Measurement[],
  planItemId: string,
): Measurement[] {
  return measurements
    .filter((item) => item.planItemId === planItemId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLatestMeasurementForPlanItem(
  measurements: readonly Measurement[],
  planItemId: string,
): Measurement | null {
  const items = getMeasurementsForPlanItem(measurements, planItemId);
  return items[0] ?? null;
}

export function getDeltasForPlanItem(
  deltas: readonly Delta[],
  planItemId: string,
): Delta[] {
  return deltas
    .filter((item) => item.planItemId === planItemId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLatestDeltaForPlanItem(
  deltas: readonly Delta[],
  planItemId: string,
): Delta | null {
  const items = getDeltasForPlanItem(deltas, planItemId);
  return items[0] ?? null;
}

/**
 * Collects Measurement identity keys for Plan Item evidence correlation.
 * Supports owner/local (`id`) and shared/cloud (`id` + `localMeasurementId`).
 */
export function collectPlanItemMeasurementCorrelationIds(
  measurements: readonly Measurement[],
  planItemId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of getMeasurementsForPlanItem(measurements, planItemId)) {
    const id = item.id.trim();
    if (id) {
      ids.add(id);
    }
    const localId = item.localMeasurementId?.trim();
    if (localId) {
      ids.add(localId);
    }
  }
  return ids;
}

/**
 * Collects Delta identity keys for Plan Item evidence correlation.
 * Supports owner/local (`id`) and shared/cloud (`id` + `localDeltaId`).
 */
export function collectPlanItemDeltaCorrelationIds(
  deltas: readonly Delta[],
  planItemId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of getDeltasForPlanItem(deltas, planItemId)) {
    const id = item.id.trim();
    if (id) {
      ids.add(id);
    }
    const localId = item.localDeltaId?.trim();
    if (localId) {
      ids.add(localId);
    }
  }
  return ids;
}

/**
 * Evidence is linked to Measurement XOR Delta — never directly to PlanItem.
 * Matches evidence.measurementId / evidence.deltaId against either the
 * loaded record's primary id or its local* key when present (shared/cloud).
 */
export function getEvidenceRelatedToPlanItem(
  evidence: readonly Evidence[],
  measurements: readonly Measurement[],
  deltas: readonly Delta[],
  planItemId: string,
): Evidence[] {
  const measurementIds = collectPlanItemMeasurementCorrelationIds(
    measurements,
    planItemId,
  );
  const deltaIds = collectPlanItemDeltaCorrelationIds(deltas, planItemId);

  return evidence
    .filter((item) => {
      const measurementId = item.measurementId?.trim() ?? "";
      if (measurementId.length > 0 && measurementIds.has(measurementId)) {
        return true;
      }
      const deltaId = item.deltaId?.trim() ?? "";
      if (deltaId.length > 0 && deltaIds.has(deltaId)) {
        return true;
      }
      return false;
    })
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * True when a Plan Item's loaded Delta.id matches the AgentRun delta context
 * in either ID space used by this app:
 * - owner/local: Delta.id === localDeltaId
 * - shared/cloud: Delta.id === remoteDeltaId
 */
export function agentRunMatchesPlanItemDeltaId(
  run: AgentRunSummary,
  deltaId: string,
): boolean {
  const id = deltaId.trim();
  if (!id) {
    return false;
  }

  const localDeltaId = run.deltaContext.localDeltaId.trim();
  const remoteDeltaId = run.deltaContext.remoteDeltaId.trim();

  if (localDeltaId.length > 0 && localDeltaId === id) {
    return true;
  }
  if (remoteDeltaId.length > 0 && remoteDeltaId === id) {
    return true;
  }
  return false;
}

export function getAgentRunsRelatedToPlanItem(
  runs: readonly AgentRunSummary[],
  deltas: readonly Delta[],
  planItemId: string,
): AgentRunSummary[] {
  const planItemDeltas = getDeltasForPlanItem(deltas, planItemId);

  return runs
    .filter((run) =>
      planItemDeltas.some((delta) =>
        agentRunMatchesPlanItemDeltaId(run, delta.id),
      ),
    )
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLatestAgentRunForPlanItem(
  runs: readonly AgentRunSummary[],
  deltas: readonly Delta[],
  planItemId: string,
): AgentRunSummary | null {
  const items = getAgentRunsRelatedToPlanItem(runs, deltas, planItemId);
  return items[0] ?? null;
}
