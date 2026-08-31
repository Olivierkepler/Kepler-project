import type { Delta } from "../../types/delta";

export type DeltaSummary = {
  openCount: number;
  reviewedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  resolvedCount: number;
  totalCostImpact: number;
  totalScheduleImpactDays: number;
  totalLaborImpactHours: number;
};

export function summarizeDeltas(deltas: Delta[]): DeltaSummary {
  return deltas.reduce<DeltaSummary>(
    (summary, delta) => {
      if (delta.status === "open") {
        summary.openCount += 1;
      } else if (delta.status === "accepted") {
        summary.acceptedCount += 1;
        summary.reviewedCount += 1;
      } else if (delta.status === "rejected") {
        summary.rejectedCount += 1;
      } else if (delta.status === "resolved") {
        summary.resolvedCount += 1;
      }

      summary.totalCostImpact += delta.costImpact;
      summary.totalScheduleImpactDays += delta.scheduleImpactDays;
      summary.totalLaborImpactHours += delta.laborImpactHours;

      return summary;
    },
    {
      openCount: 0,
      reviewedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      resolvedCount: 0,
      totalCostImpact: 0,
      totalScheduleImpactDays: 0,
      totalLaborImpactHours: 0,
    },
  );
}
