/**
 * Phase 59 saved field report domain self-check.
 * Run: npx tsx src/utils/domain/savedFieldReport.selftest.ts
 */

import type { FieldReport } from "./fieldReport";
import {
  buildSavedFieldReport,
  createSavedFieldReportId,
  normalizeSavedFieldReport,
  sortSavedFieldReportsNewestFirst,
} from "./savedFieldReport";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const snapshot: FieldReport = {
  projectId: "proj-1",
  projectName: "Boston Office Renovation",
  projectLocation: "Boston, MA",
  periodLabel: "2026-08-21 → 2026-08-21",
  startAt: "2026-08-21T04:00:00.000Z",
  endAt: "2026-08-22T04:00:00.000Z",
  generatedAt: "2026-08-22T05:13:00.000Z",
  hasPeriodActivity: true,
  activity: {
    measurements: 2,
    deltas: 2,
    evidence: 9,
  },
  measurements: [],
  deltasDocumented: [],
  openFieldDifferences: [],
  documentedImpact: {
    costImpact: -979.88,
    laborImpactHours: -32.66,
    largestRecordedVarianceDays: -2.75,
    deltasWithScheduleImpact: 2,
  },
  evidence: [],
  currentDisposition: {
    open: 2,
    accepted: 0,
    rejected: 0,
    resolved: 0,
  },
  projectIntelligence: {
    totalVariances: 2,
    disposition: {
      open: 2,
      accepted: 0,
      rejected: 0,
      resolved: 0,
    },
    documentedImpact: {
      costImpact: -979.88,
      laborImpactHours: -32.66,
      largestRecordedVarianceDays: -2.75,
      deltasWithScheduleImpact: 2,
    },
    recentVariances: [],
  },
};

const saved = buildSavedFieldReport({
  id: "saved-report-test-1",
  savedAt: "2026-08-22T05:15:00.000Z",
  snapshot,
});

assert(saved.schemaVersion === 1, "schema version");
assert(saved.projectId === "proj-1", "project id");
assert(saved.snapshot.generatedAt === snapshot.generatedAt, "snapshot generatedAt");

const normalized = normalizeSavedFieldReport(saved);
assert(normalized != null, "normalize valid record");
assert(normalized?.id === saved.id, "normalize id");

assert(
  normalizeSavedFieldReport({ ...saved, schemaVersion: 2 }) === null,
  "reject unknown schema version",
);

assert(
  normalizeSavedFieldReport({
    ...saved,
    projectId: "proj-2",
  }) === null,
  "reject projectId mismatch",
);

assert(
  normalizeSavedFieldReport({
    ...saved,
    snapshot: { ...snapshot, projectId: "proj-2" },
  }) === null,
  "reject snapshot project mismatch",
);

const legacySnapshot = { ...snapshot };
delete (legacySnapshot as { projectIntelligence?: unknown }).projectIntelligence;
const legacyNormalized = normalizeSavedFieldReport(
  buildSavedFieldReport({ snapshot: legacySnapshot as FieldReport }),
);
assert(legacyNormalized != null, "legacy snapshot without projectIntelligence");
assert(
  legacyNormalized?.snapshot.projectIntelligence.totalVariances === 2,
  "legacy snapshot synthesizes project intelligence counts",
);
assert(
  legacyNormalized?.snapshot.projectIntelligence.recentVariances.length === 0,
  "legacy snapshot has empty recent variances",
);

assert(
  normalizeSavedFieldReport({ not: "a record" }) === null,
  "reject malformed record",
);

const emptySnapshot: FieldReport = {
  ...snapshot,
  hasPeriodActivity: false,
  activity: { measurements: 0, deltas: 0, evidence: 0 },
};

assert(
  normalizeSavedFieldReport(buildSavedFieldReport({ snapshot: emptySnapshot })) !=
    null,
  "empty report snapshot saveable",
);

const sorted = sortSavedFieldReportsNewestFirst([
  buildSavedFieldReport({
    id: "older",
    savedAt: "2026-08-21T10:00:00.000Z",
    snapshot,
  }),
  buildSavedFieldReport({
    id: "newer",
    savedAt: "2026-08-22T10:00:00.000Z",
    snapshot,
  }),
]);

assert(sorted[0]?.id === "newer", "newest savedAt first");
assert(sorted[1]?.id === "older", "older second");

const originalStatus = snapshot.currentDisposition.open;
const mutatedSnapshot: FieldReport = {
  ...snapshot,
  currentDisposition: {
    ...snapshot.currentDisposition,
    open: 99,
  },
};

const stored = buildSavedFieldReport({
  id: "immutable-test",
  savedAt: "2026-08-22T06:00:00.000Z",
  snapshot,
});

mutatedSnapshot.currentDisposition.open = 99;
assert(
  stored.snapshot.currentDisposition.open === originalStatus,
  "stored snapshot unchanged by external mutation",
);

assert(createSavedFieldReportId(123).startsWith("saved-report-123-"), "id format");

console.log("savedFieldReport.selftest: PASS");
