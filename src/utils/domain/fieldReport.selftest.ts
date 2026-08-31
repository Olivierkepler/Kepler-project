/**
 * Phase 58A field-report derivation self-check.
 * Run: npx tsx src/utils/domain/fieldReport.selftest.ts
 */

import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { Project } from "../../types/project";
import {
  buildFieldReport,
  isTimestampInRange,
  isValidLocalDateInput,
  resolveCustomFieldReportRange,
  resolveFieldReportRange,
} from "./fieldReport";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const project: Project = {
  id: "proj-1",
  name: "Boston Office Renovation",
  location: "Boston, MA",
  status: "active",
  progress: 42,
  openDeltas: 1,
  assignedTasks: 3,
};

const otherProject: Project = {
  ...project,
  id: "proj-2",
  name: "Other Project",
};

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

const measurementIn: Measurement = {
  id: "m-in",
  projectId: "proj-1",
  planItemId: "plan-1",
  type: "length",
  label: "Main conduit run",
  value: 12.08,
  unit: "ft",
  createdAt: "2026-08-21T15:00:00.000Z",
};

const measurementOut: Measurement = {
  ...measurementIn,
  id: "m-out",
  createdAt: "2026-08-10T15:00:00.000Z",
};

const measurementOtherProject: Measurement = {
  ...measurementIn,
  id: "m-other",
  projectId: "proj-2",
  createdAt: "2026-08-21T16:00:00.000Z",
};

const openDeltaIn: Delta = {
  id: "d-open",
  projectId: "proj-1",
  planItemId: "plan-1",
  measurementId: "m-in",
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
  createdAt: "2026-08-21T15:10:00.000Z",
};

const resolvedDeltaIn: Delta = {
  ...openDeltaIn,
  id: "d-resolved",
  costImpact: -100,
  laborImpactHours: -4,
  scheduleImpactDays: -1,
  status: "resolved",
  dispositionReason: "Field coordinated",
  disposedAt: "2026-08-21T18:00:00.000Z",
  createdAt: "2026-08-21T14:00:00.000Z",
};

const deltaOut: Delta = {
  ...openDeltaIn,
  id: "d-out",
  status: "accepted",
  disposedAt: "2026-08-11T12:00:00.000Z",
  createdAt: "2026-08-10T12:00:00.000Z",
};

const evidenceDelta: Evidence = {
  id: "e-delta",
  projectId: "proj-1",
  type: "photo",
  note: "",
  photoUri: "file://photo.jpg",
  createdAt: "2026-08-21T15:20:00.000Z",
  measurementId: null,
  deltaId: "d-open",
};

const evidenceMeasurement: Evidence = {
  id: "e-meas",
  projectId: "proj-1",
  type: "note",
  note: "Measured at north wall",
  photoUri: null,
  createdAt: "2026-08-21T15:05:00.000Z",
  measurementId: "m-in",
  deltaId: null,
};

const evidenceProject: Evidence = {
  id: "e-proj",
  projectId: "proj-1",
  type: "note",
  note: "General site note",
  photoUri: null,
  createdAt: "2026-08-21T15:30:00.000Z",
  measurementId: null,
  deltaId: null,
};

const evidenceOut: Evidence = {
  ...evidenceProject,
  id: "e-out",
  createdAt: "2026-08-01T12:00:00.000Z",
};

const startAt = "2026-08-21T04:00:00.000Z";
const endAt = "2026-08-22T04:00:00.000Z";

assert(isValidLocalDateInput("2026-08-21"), "valid date");
assert(!isValidLocalDateInput("2026-13-40"), "invalid date");
assert(!isValidLocalDateInput("08/21/2026"), "wrong format");

assert(
  isTimestampInRange("2026-08-21T12:00:00.000Z", startAt, endAt),
  "inside range",
);
assert(
  !isTimestampInRange("2026-08-22T04:00:00.000Z", startAt, endAt),
  "exclusive end",
);
assert(
  !isTimestampInRange("2026-08-21T03:59:59.000Z", startAt, endAt),
  "before start",
);

const inverted = resolveCustomFieldReportRange("2026-08-22", "2026-08-21");
assert(!inverted.ok, "inverted custom rejected");
if (!inverted.ok) {
  assert(
    inverted.error === "End date must be on or after start date.",
    `inverted message: ${inverted.error}`,
  );
}

const customOk = resolveCustomFieldReportRange("2026-08-21", "2026-08-21");
assert(customOk.ok, "same-day custom ok");

const frozenNow = new Date(2026, 7, 21, 15, 30, 0);
const todayRange = resolveFieldReportRange("today", frozenNow);
assert(todayRange.label === "Today", "today label");
assert(
  todayRange.startAt === new Date(2026, 7, 21).toISOString(),
  "today start",
);
assert(
  todayRange.endAt === new Date(2026, 7, 22).toISOString(),
  "today end exclusive",
);

const last7 = resolveFieldReportRange("last7", frozenNow);
assert(
  last7.startAt === new Date(2026, 7, 15).toISOString(),
  "last7 start (today-6)",
);
assert(last7.endAt === new Date(2026, 7, 22).toISOString(), "last7 end");

const report = buildFieldReport({
  project,
  measurements: [measurementIn, measurementOut, measurementOtherProject],
  deltas: [openDeltaIn, resolvedDeltaIn, deltaOut],
  evidence: [
    evidenceDelta,
    evidenceMeasurement,
    evidenceProject,
    evidenceOut,
  ],
  planItems: [planItem],
  startAt,
  endAt,
  periodLabel: "Today",
  generatedAt: "2026-08-21T20:00:00.000Z",
});

assert(report.activity.measurements === 1, "measurement filter");
assert(report.activity.deltas === 2, "delta filter");
assert(report.activity.evidence === 3, "evidence filter");
assert(report.hasPeriodActivity, "has activity");
assert(report.measurements[0]?.id === "m-in", "measurement id");
assert(
  report.openFieldDifferences.length === 1 &&
    report.openFieldDifferences[0]?.id === "d-open",
  "open field differences",
);
assert(
  Math.abs(report.documentedImpact.costImpact - -585.64) < 0.001,
  "documented cost period deltas only",
);
assert(
  report.documentedImpact.largestRecordedVarianceDays === -2.7,
  "largest schedule variance",
);
assert(
  report.evidence.filter((item) => item.context === "project").length === 1,
  "project evidence class",
);
assert(
  report.evidence.filter((item) => item.context === "measurement").length ===
    1,
  "measurement evidence class",
);
assert(
  report.evidence.filter((item) => item.context === "delta").length === 1,
  "delta evidence class",
);
assert(report.currentDisposition.open === 1, "current open");
assert(report.currentDisposition.resolved === 1, "current resolved");
assert(
  report.currentDisposition.accepted === 1,
  "current accepted includes out-of-period",
);
assert(report.projectIntelligence.totalVariances === 3, "project intelligence total");
assert(report.projectIntelligence.disposition.open === 1, "project intelligence open");
assert(report.projectIntelligence.disposition.resolved === 1, "project intelligence resolved");
assert(
  Math.abs(report.projectIntelligence.documentedImpact.costImpact - -1071.28) <
    0.001,
  "project intelligence documented impact uses all project deltas",
);
assert(
  report.projectIntelligence.recentVariances.length === 3,
  "project intelligence recent variances",
);
assert(
  report.projectIntelligence.recentVariances.some(
    (item) => item.id === "d-resolved" && item.status === "resolved",
  ),
  "resolved variance in project intelligence",
);
assert(
  report.projectIntelligence.recentVariances.find((item) => item.id === "d-open")
    ?.recordedFieldQuantity === 12.08,
  "recorded field quantity from Delta actualValue",
);
assert(
  report.documentedImpact.costImpact !==
    report.projectIntelligence.documentedImpact.costImpact,
  "period impact differs from project-wide documented impact",
);

const isolated = buildFieldReport({
  project: otherProject,
  measurements: [measurementIn, measurementOtherProject],
  deltas: [openDeltaIn],
  evidence: [evidenceProject],
  planItems: [planItem],
  startAt,
  endAt,
  periodLabel: "Today",
  generatedAt: "2026-08-21T20:00:00.000Z",
});

assert(isolated.activity.measurements === 1, "other project measurement only");
assert(isolated.activity.deltas === 0, "other project no deltas");
assert(isolated.activity.evidence === 0, "other project no evidence");

const empty = buildFieldReport({
  project,
  measurements: [measurementOut],
  deltas: [deltaOut],
  evidence: [evidenceOut],
  planItems: [planItem],
  startAt,
  endAt,
  periodLabel: "Today",
  generatedAt: "2026-08-21T20:00:00.000Z",
});

assert(!empty.hasPeriodActivity, "empty period");
assert(empty.activity.measurements === 0, "empty measurements");

const malformed = buildFieldReport({
  project,
  measurements: [],
  deltas: [
    {
      ...openDeltaIn,
      costImpact: Number.NaN,
      laborImpactHours: Number.POSITIVE_INFINITY,
      scheduleImpactDays: Number.NaN,
    },
  ],
  evidence: [],
  planItems: [planItem],
  startAt,
  endAt,
  periodLabel: "Today",
  generatedAt: "2026-08-21T20:00:00.000Z",
});

assert(malformed.documentedImpact.costImpact === 0, "ignore NaN cost");
assert(
  malformed.documentedImpact.laborImpactHours === 0,
  "ignore non-finite labor",
);
assert(
  malformed.documentedImpact.largestRecordedVarianceDays === 0,
  "ignore NaN schedule",
);

console.log("fieldReport.selftest: PASS");
