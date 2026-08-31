/**
 * Phase 60.1 project activity aggregation self-check.
 * Run: npx tsx src/utils/domain/projectActivity.selftest.ts
 */

import type { Delta } from "../../types/delta";
import type { Evidence } from "../../types/evidence";
import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { SavedFieldReport } from "../../types/savedFieldReport";
import type { FieldReport } from "./fieldReport";
import {
  buildProjectActivity,
  compareProjectActivityItems,
  countProjectActivityByFilter,
  filterProjectActivity,
  type ProjectActivityItem,
} from "./projectActivity";

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
  createdAt: "2026-08-21T14:42:00.000Z",
};

const delta: Delta = {
  id: "d-1",
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
  costImpact: -485.63,
  productionRatePerDay: 40,
  scheduleImpactDays: -2.7,
  laborHoursPerUnit: 0.15,
  laborImpactHours: -16.19,
  status: "open",
  dispositionReason: "",
  disposedAt: null,
  createdAt: "2026-08-21T14:45:00.000Z",
};

const noteEvidence: Evidence = {
  id: "e-note",
  projectId: "proj-1",
  type: "note",
  note: "Measured at north wall",
  photoUri: null,
  createdAt: "2026-08-21T15:18:00.000Z",
  measurementId: "m-1",
  deltaId: null,
};

const photoEvidence: Evidence = {
  id: "e-photo",
  projectId: "proj-1",
  type: "photo",
  note: "",
  photoUri: "file://photo.jpg",
  createdAt: "2026-08-21T16:06:00.000Z",
  measurementId: null,
  deltaId: "d-1",
};

const snapshot: FieldReport = {
  projectId: "proj-1",
  projectName: "Boston Office Renovation",
  projectLocation: "Boston, MA",
  periodLabel: "Today",
  startAt: "2026-08-21T04:00:00.000Z",
  endAt: "2026-08-22T04:00:00.000Z",
  generatedAt: "2026-08-22T05:13:00.000Z",
  hasPeriodActivity: true,
  activity: { measurements: 0, deltas: 0, evidence: 1 },
  measurements: [],
  deltasDocumented: [],
  openFieldDifferences: [],
  documentedImpact: {
    costImpact: 0,
    laborImpactHours: 0,
    largestRecordedVarianceDays: 0,
    deltasWithScheduleImpact: 0,
  },
  evidence: [],
  currentDisposition: { open: 0, accepted: 0, rejected: 0, resolved: 0 },
  projectIntelligence: {
    totalVariances: 0,
    disposition: { open: 0, accepted: 0, rejected: 0, resolved: 0 },
    documentedImpact: {
      costImpact: 0,
      laborImpactHours: 0,
      largestRecordedVarianceDays: 0,
      deltasWithScheduleImpact: 0,
    },
    recentVariances: [],
  },
};

const savedReport: SavedFieldReport = {
  schemaVersion: 1,
  id: "saved-1",
  projectId: "proj-1",
  savedAt: "2026-08-22T17:06:00.000Z",
  snapshot,
};

const otherProjectMeasurement: Measurement = {
  ...measurement,
  id: "m-other",
  projectId: "proj-2",
};

const activity = buildProjectActivity({
  projectId: "proj-1",
  measurements: [measurement, otherProjectMeasurement],
  deltas: [delta],
  evidence: [noteEvidence, photoEvidence],
  planItems: [planItem],
  savedReports: [savedReport],
});

assert(activity.length === 5, "five activity items");

const measurementItem = activity.find((item) => item.kind === "measurement");
assert(measurementItem?.measurementId === "m-1", "measurement activity");
assert(
  measurementItem?.occurredAt === measurement.createdAt,
  "measurement timestamp",
);

const deltaItem = activity.find((item) => item.kind === "delta");
assert(deltaItem?.deltaId === "d-1", "delta activity");
assert(deltaItem?.occurredAt === delta.createdAt, "delta timestamp");
assert(
  activity.filter((item) => item.kind === "delta").length === 1,
  "no disposition events",
);

const noteItem = activity.find(
  (item): item is Extract<ProjectActivityItem, { kind: "evidence" }> =>
    item.kind === "evidence" && item.evidenceType === "note",
);
assert(noteItem?.evidenceId === "e-note", "note evidence activity");

const photoItem = activity.find(
  (item): item is Extract<ProjectActivityItem, { kind: "evidence" }> =>
    item.kind === "evidence" && item.evidenceType === "photo",
);
assert(photoItem?.photoUri === "file://photo.jpg", "photo evidence activity");

const savedItem = activity.find((item) => item.kind === "savedReport");
assert(savedItem?.savedReportId === "saved-1", "saved report activity");
assert(savedItem?.occurredAt === savedReport.savedAt, "savedAt timestamp");
assert(
  savedItem?.occurredAt !== snapshot.generatedAt,
  "saved report not generatedAt",
);

assert(activity[0]?.kind === "savedReport", "newest first");
assert(
  activity[activity.length - 1]?.kind === "measurement",
  "oldest measurement last",
);

const tieTime = "2026-08-21T12:00:00.000Z";
const tied = buildProjectActivity({
  projectId: "proj-1",
  measurements: [{ ...measurement, id: "m-tie", createdAt: tieTime }],
  deltas: [{ ...delta, id: "d-tie", createdAt: tieTime }],
  evidence: [
    { ...noteEvidence, id: "e-tie", createdAt: tieTime },
  ],
  planItems: [planItem],
  savedReports: [
    {
      ...savedReport,
      id: "saved-tie",
      savedAt: tieTime,
    },
  ],
});

assert(tied[0]?.kind === "savedReport", "tie savedReport first");
assert(tied[1]?.kind === "evidence", "tie evidence second");
assert(tied[2]?.kind === "delta", "tie delta third");
assert(tied[3]?.kind === "measurement", "tie measurement fourth");

assert(
  compareProjectActivityItems(tied[0], tied[1]) < 0,
  "compare prefers savedReport on tie",
);

const isolated = buildProjectActivity({
  projectId: "proj-1",
  measurements: [otherProjectMeasurement],
  deltas: [],
  evidence: [],
  planItems: [planItem],
  savedReports: [],
});

assert(isolated.length === 0, "other project excluded");

assert(
  buildProjectActivity({
    projectId: "proj-1",
    measurements: [],
    deltas: [],
    evidence: [],
    planItems: [],
    savedReports: [],
  }).length === 0,
  "empty input",
);

const ids = activity.map((item) => item.id);
assert(new Set(ids).size === ids.length, "unique activity ids");

const sparseNote = buildProjectActivity({
  projectId: "proj-1",
  measurements: [],
  deltas: [],
  evidence: [
    {
      ...noteEvidence,
      id: "e-sparse",
      note: "",
      photoUri: null,
    },
  ],
  planItems: [planItem],
  savedReports: [],
});

assert(sparseNote.length === 1, "sparse evidence handled");
assert(sparseNote[0]?.kind === "evidence", "sparse evidence kind");

const filterSource = activity;
const originalOrder = filterSource.map((item) => item.id);

assert(
  filterProjectActivity(filterSource, "all").length === filterSource.length,
  "all filter returns everything",
);
assert(
  filterProjectActivity(filterSource, "measurement").every(
    (item) => item.kind === "measurement",
  ),
  "measurement filter only",
);
assert(
  filterProjectActivity(filterSource, "delta").every(
    (item) => item.kind === "delta",
  ),
  "delta filter only",
);
assert(
  filterProjectActivity(filterSource, "evidence").length === 2,
  "evidence filter includes note and photo",
);
assert(
  filterProjectActivity(filterSource, "savedReport").every(
    (item) => item.kind === "savedReport",
  ),
  "saved report filter only",
);

const filteredEvidence = filterProjectActivity(filterSource, "evidence");
assert(
  filteredEvidence.map((item) => item.id).join(",") ===
    filterSource
      .filter((item) => item.kind === "evidence")
      .map((item) => item.id)
      .join(","),
  "filter preserves order",
);

assert(
  filterProjectActivity(filterSource, "measurement")[0]?.id === originalOrder[4],
  "filtered order matches sorted source",
);

assert(
  filterProjectActivity([], "delta").length === 0,
  "empty category returns empty",
);

assert(
  filterSource.length === originalOrder.length,
  "source input not mutated by filter",
);

const counts = countProjectActivityByFilter(filterSource);
assert(counts.all === 5, "all count");
assert(counts.measurement === 1, "measurement count");
assert(counts.delta === 1, "delta count");
assert(counts.evidence === 2, "evidence count");
assert(counts.savedReport === 1, "saved report count");

assert(
  measurementItem?.kind === "measurement" &&
    measurementItem.relatedDeltaCount === 1,
  "measurement relatedDeltaCount",
);
assert(
  measurementItem?.kind === "measurement" &&
    measurementItem.relatedEvidenceCount === 1,
  "measurement direct relatedEvidenceCount",
);
assert(
  deltaItem?.kind === "delta" && deltaItem.measurementId === "m-1",
  "delta retains measurementId",
);
assert(
  deltaItem?.kind === "delta" && deltaItem.relatedEvidenceCount === 1,
  "delta relatedEvidenceCount",
);
assert(
  deltaItem?.kind === "delta" &&
    deltaItem.sourceMeasurementValue === 12.08 &&
    deltaItem.sourceMeasurementUnit === "ft",
  "delta source measurement context",
);

const deltaEvidenceNotDirect = buildProjectActivity({
  projectId: "proj-1",
  measurements: [measurement],
  deltas: [delta],
  evidence: [
    {
      ...photoEvidence,
      id: "e-delta-only",
      measurementId: null,
      deltaId: "d-1",
    },
  ],
  planItems: [planItem],
  savedReports: [],
});

const isolatedMeasurement = deltaEvidenceNotDirect.find(
  (item) => item.kind === "measurement",
);
assert(
  isolatedMeasurement?.kind === "measurement" &&
    isolatedMeasurement.relatedEvidenceCount === 0,
  "delta evidence not counted as direct measurement evidence",
);

const multipleDeltas = buildProjectActivity({
  projectId: "proj-1",
  measurements: [measurement],
  deltas: [
    delta,
    {
      ...delta,
      id: "d-2",
      createdAt: "2026-08-21T14:46:00.000Z",
    },
  ],
  evidence: [],
  planItems: [planItem],
  savedReports: [],
});

const multiMeasurement = multipleDeltas.find(
  (item) => item.kind === "measurement",
);
assert(
  multiMeasurement?.kind === "measurement" &&
    multiMeasurement.relatedDeltaCount === 2,
  "multiple deltas count correctly",
);

const missingMeasurement = buildProjectActivity({
  projectId: "proj-1",
  measurements: [],
  deltas: [
    {
      ...delta,
      id: "d-missing",
      measurementId: "missing-m",
    },
  ],
  evidence: [],
  planItems: [planItem],
  savedReports: [],
});

const missingMeasurementDelta = missingMeasurement.find(
  (item) => item.kind === "delta",
);
assert(
  missingMeasurementDelta?.kind === "delta" &&
    missingMeasurementDelta.measurementId === "missing-m" &&
    missingMeasurementDelta.sourceMeasurementValue === null &&
    missingMeasurementDelta.sourceMeasurementUnit === null,
  "missing referenced measurement does not crash",
);

const zeroRelationships = buildProjectActivity({
  projectId: "proj-1",
  measurements: [
    {
      ...measurement,
      id: "m-zero",
      createdAt: "2026-08-21T10:00:00.000Z",
    },
  ],
  deltas: [],
  evidence: [],
  planItems: [planItem],
  savedReports: [],
});

const zeroMeasurement = zeroRelationships.find(
  (item) => item.kind === "measurement",
);
assert(
  zeroMeasurement?.kind === "measurement" &&
    zeroMeasurement.relatedDeltaCount === 0 &&
    zeroMeasurement.relatedEvidenceCount === 0,
  "zero relationship counts handled",
);

const unrelatedEvidence = buildProjectActivity({
  projectId: "proj-1",
  measurements: [
    measurement,
    {
      ...measurement,
      id: "m-2",
      value: 10.17,
      createdAt: "2026-08-21T13:00:00.000Z",
    },
  ],
  deltas: [delta],
  evidence: [
    noteEvidence,
    {
      ...noteEvidence,
      id: "e-m2",
      measurementId: "m-2",
      createdAt: "2026-08-21T15:30:00.000Z",
    },
  ],
  planItems: [planItem],
  savedReports: [],
});

const unrelatedMeasurement = unrelatedEvidence.find(
  (item) => item.kind === "measurement" && item.measurementId === "m-1",
);
assert(
  unrelatedMeasurement?.kind === "measurement" &&
    unrelatedMeasurement.relatedEvidenceCount === 1,
  "unrelated measurement evidence excluded from counts",
);

const sourceMeasurements = [measurement, otherProjectMeasurement];
const sourceDeltas = [delta];
const sourceEvidence = [noteEvidence, photoEvidence];
const sourcePlanItems = [planItem];
const sourceSavedReports = [savedReport];

buildProjectActivity({
  projectId: "proj-1",
  measurements: sourceMeasurements,
  deltas: sourceDeltas,
  evidence: sourceEvidence,
  planItems: sourcePlanItems,
  savedReports: sourceSavedReports,
});

assert(
  sourceMeasurements.length === 2 &&
    sourceDeltas.length === 1 &&
    sourceEvidence.length === 2 &&
    sourcePlanItems.length === 1 &&
    sourceSavedReports.length === 1,
  "source arrays not mutated",
);

const relationshipFilterSource = buildProjectActivity({
  projectId: "proj-1",
  measurements: [measurement],
  deltas: [delta],
  evidence: [noteEvidence, photoEvidence],
  planItems: [planItem],
  savedReports: [savedReport],
});

const relationshipCounts = countProjectActivityByFilter(
  relationshipFilterSource,
);
assert(relationshipCounts.all === 5, "relationship counts do not change filters");
assert(
  relationshipCounts.measurement === 1 &&
    relationshipCounts.delta === 1 &&
    relationshipCounts.evidence === 2,
  "filter counts remain activity item counts",
);

const relationshipSorted = relationshipFilterSource.map((item) => item.id);
assert(
  relationshipSorted.join(",") === activity.map((item) => item.id).join(","),
  "sorting unchanged with relationships",
);

console.log("projectActivity.selftest: PASS");
