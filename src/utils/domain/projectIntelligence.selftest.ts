/**
 * Lightweight Phase 57 self-check for pure aggregation.
 * Run: npx tsx src/utils/domain/projectIntelligence.selftest.ts
 */

import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import { buildProjectIntelligence } from "./projectIntelligence";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const planItem: PlanItem = {
  id: "plan-1",
  projectId: "proj-1",
  type: "length",
  label: "Main conduit run",
  plannedValue: 120,
  unit: "ft",
  unitCost: 4.5,
  productionRatePerDay: 40,
  laborHoursPerUnit: 0.15,
};

const measurement: Measurement = {
  id: "m-1",
  projectId: "proj-1",
  planItemId: "plan-1",
  type: "length",
  label: "Main conduit run",
  value: 12.08,
  unit: "ft",
  createdAt: "2026-08-21T18:17:00.000Z",
};

const openDelta: Delta = {
  id: "d-open",
  projectId: "proj-1",
  planItemId: "plan-1",
  measurementId: "m-1",
  type: "length",
  plannedValue: 120,
  actualValue: 12.08,
  difference: -107.92,
  percentDifference: -89.9,
  unit: "ft",
  unitCost: 4.5,
  costImpact: -485.64,
  productionRatePerDay: 40,
  scheduleImpactDays: -2.7,
  laborHoursPerUnit: 0.15,
  laborImpactHours: -16.19,
  status: "open",
  dispositionReason: "",
  disposedAt: null,
  createdAt: "2026-08-21T18:18:00.000Z",
};

const resolvedDelta: Delta = {
  ...openDelta,
  id: "d-resolved",
  costImpact: -100,
  laborImpactHours: -4,
  scheduleImpactDays: -1,
  status: "resolved",
  dispositionReason: "Field coordinated",
  disposedAt: "2026-08-21T18:25:00.000Z",
  createdAt: "2026-08-21T17:00:00.000Z",
};

const evidenceDelta: Evidence = {
  id: "e-1",
  projectId: "proj-1",
  type: "photo",
  note: "",
  photoUri: "file://photo.jpg",
  createdAt: "2026-08-21T18:26:00.000Z",
  measurementId: null,
  deltaId: "d-open",
};

const evidenceProject: Evidence = {
  id: "e-2",
  projectId: "proj-1",
  type: "note",
  note: "General site note",
  photoUri: null,
  createdAt: "2026-08-21T18:10:00.000Z",
  measurementId: null,
  deltaId: null,
};

const summary = buildProjectIntelligence({
  measurements: [measurement],
  deltas: [openDelta, resolvedDelta],
  evidence: [evidenceDelta, evidenceProject],
  planItems: [planItem],
});

assert(summary.measurements === 1, "measurements count");
assert(summary.deltas === 2, "deltas count");
assert(summary.evidence === 2, "evidence count");
assert(summary.disposition.open === 1, "open disposition");
assert(summary.disposition.resolved === 1, "resolved disposition");
assert(
  Math.abs(summary.openImpact.costImpact - -485.64) < 0.001,
  "open cost impact",
);
assert(
  Math.abs(summary.documentedImpact.costImpact - -585.64) < 0.001,
  "documented cost includes all statuses",
);
assert(
  summary.openSchedule.largestRecordedVarianceDays === -2.7,
  "open largest schedule variance",
);
assert(
  summary.documentedSchedule.deltasWithScheduleImpact === 2,
  "documented schedule count",
);
assert(summary.evidenceCoverage.project === 1, "project evidence");
assert(summary.evidenceCoverage.delta === 1, "delta evidence");
assert(
  summary.evidenceCoverage.openDeltasWithEvidence === 1,
  "open with evidence",
);
assert(summary.needsAttention.length === 1, "needs attention open only");
assert(summary.recentVariances.length === 2, "recent variances include all statuses");
assert(
  summary.recentVariances[0]?.id === "d-open",
  "recent variances newest first",
);
assert(
  summary.recentVariances[0]?.recordedFieldQuantity === 12.08,
  "recorded field quantity from Delta actualValue",
);
assert(
  summary.recentVariances.find((item) => item.id === "d-resolved")?.status ===
    "resolved",
  "resolved variance remains available historically",
);
assert(
  summary.recentVariances.find((item) => item.id === "d-resolved")
    ?.costImpact === -100,
  "resolved variance uses stored Delta impact",
);
assert(
  summary.recentVariances.find((item) => item.id === "d-open") != null,
  "open variance remains in recent list",
);
assert(
  Math.abs(
    summary.documentedImpact.costImpact -
      (openDelta.costImpact + resolvedDelta.costImpact),
  ) < 0.001,
  "documented impact sums stored Delta impacts",
);

const deterministicA = buildProjectIntelligence({
  measurements: [measurement],
  deltas: [openDelta, resolvedDelta],
  evidence: [evidenceDelta, evidenceProject],
  planItems: [planItem],
});
const deterministicB = buildProjectIntelligence({
  measurements: [measurement],
  deltas: [openDelta, resolvedDelta],
  evidence: [evidenceDelta, evidenceProject],
  planItems: [planItem],
});
assert(
  JSON.stringify(deterministicA.recentVariances) ===
    JSON.stringify(deterministicB.recentVariances),
  "project intelligence deterministic for same records",
);

const beforeMutation = { ...openDelta };
buildProjectIntelligence({
  measurements: [measurement],
  deltas: [openDelta, resolvedDelta],
  evidence: [],
  planItems: [planItem],
});
assert(
  openDelta.costImpact === beforeMutation.costImpact &&
    openDelta.actualValue === beforeMutation.actualValue &&
    openDelta.status === beforeMutation.status,
  "aggregation does not mutate Delta",
);

assert(
  summary.recentActivity[0]?.kind === "evidence_photo",
  "newest activity first",
);

const malformed = buildProjectIntelligence({
  measurements: [],
  deltas: [
    {
      ...openDelta,
      costImpact: Number.NaN,
      laborImpactHours: Number.POSITIVE_INFINITY,
      scheduleImpactDays: Number.NaN,
    },
  ],
  evidence: [],
  planItems: [planItem],
});

assert(malformed.openImpact.costImpact === 0, "ignore NaN cost");
assert(malformed.openImpact.laborImpactHours === 0, "ignore non-finite labor");
assert(
  malformed.openSchedule.largestRecordedVarianceDays === 0,
  "ignore NaN schedule",
);

const empty = buildProjectIntelligence({
  measurements: [],
  deltas: [],
  evidence: [],
  planItems: [],
});

assert(empty.measurements === 0 && empty.recentActivity.length === 0, "empty");

console.log("projectIntelligence.selftest: PASS");
