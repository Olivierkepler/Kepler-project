/**
 * Phase 58B field-report HTML/filename self-check.
 * Run: npx tsx src/utils/reports/fieldReportHtml.selftest.ts
 */

import type { FieldReport } from "../domain/fieldReport";
import { escapeHtml } from "../html";
import { buildFieldReportPdfFilename } from "./fieldReportFilename";
import {
  buildFieldReportHtml,
  PHOTO_UNAVAILABLE,
} from "./fieldReportHtml";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const baseReport: FieldReport = {
  projectId: "proj-1",
  projectName: "Boston Office Renovation",
  projectLocation: "Boston, MA",
  periodLabel: "Today",
  startAt: "2026-08-21T04:00:00.000Z",
  endAt: "2026-08-22T04:00:00.000Z",
  generatedAt: "2026-08-22T05:13:00.000Z",
  hasPeriodActivity: true,
  activity: {
    measurements: 2,
    deltas: 2,
    evidence: 9,
  },
  measurements: [
    {
      id: "m-1",
      label: "Main conduit run",
      value: 12.08,
      unit: "ft",
      createdAt: "2026-08-21T06:26:00.000Z",
    },
  ],
  deltasDocumented: [
    {
      id: "d-1",
      label: "Main conduit run",
      plannedValue: 120,
      actualValue: 12.08,
      difference: -107.92,
      percentDifference: -89.9,
      unit: "ft",
      costImpact: -485.63,
      laborImpactHours: -16.19,
      scheduleImpactDays: -2.7,
      status: "open",
      dispositionReason: "",
      disposedAt: null,
      createdAt: "2026-08-21T06:26:00.000Z",
      dispositionOccurredInPeriod: false,
    },
  ],
  openFieldDifferences: [
    {
      id: "d-1",
      label: "Main conduit run",
      plannedValue: 120,
      actualValue: 12.08,
      difference: -107.92,
      percentDifference: -89.9,
      unit: "ft",
      costImpact: -485.63,
      laborImpactHours: -16.19,
      scheduleImpactDays: -2.7,
      status: "open",
      dispositionReason: "",
      disposedAt: null,
      createdAt: "2026-08-21T06:26:00.000Z",
      dispositionOccurredInPeriod: false,
    },
  ],
  documentedImpact: {
    costImpact: -979.88,
    laborImpactHours: -32.66,
    largestRecordedVarianceDays: -2.75,
    deltasWithScheduleImpact: 2,
  },
  evidence: [
    {
      id: "e-photo",
      type: "photo",
      context: "delta",
      relatedLabel: "Main conduit run",
      note: "",
      photoUri: "file://photo.jpg",
      createdAt: "2026-08-21T06:26:00.000Z",
      measurementId: null,
      deltaId: "d-1",
    },
    {
      id: "e-note",
      type: "note",
      context: "delta",
      relatedLabel: "Main conduit run",
      note: "Delta evidence test",
      photoUri: null,
      createdAt: "2026-08-21T06:26:00.000Z",
      measurementId: null,
      deltaId: "d-1",
    },
  ],
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
      costImpact: -971.26,
      laborImpactHours: -32.38,
      largestRecordedVarianceDays: -2.7,
      deltasWithScheduleImpact: 1,
    },
    recentVariances: [
      {
        id: "d-1",
        label: "Main conduit run",
        recordedFieldQuantity: 12.08,
        difference: -107.92,
        unit: "ft",
        status: "open",
        dispositionReason: "",
        costImpact: -485.63,
        laborImpactHours: -16.19,
        scheduleImpactDays: -2.7,
        createdAt: "2026-08-21T06:26:00.000Z",
      },
    ],
  },
};

assert(
  escapeHtml(`Tom & Jerry <script>"'`) ===
    "Tom &amp; Jerry &lt;script&gt;&quot;&#39;",
  "escapeHtml",
);

assert(
  buildFieldReportPdfFilename(baseReport) ===
    "Boston-Office-Renovation-Field-Report-2026-08-21.pdf",
  "single-day filename",
);

const rangeReport: FieldReport = {
  ...baseReport,
  periodLabel: "2026-08-15 → 2026-08-21",
  startAt: "2026-08-15T04:00:00.000Z",
  endAt: "2026-08-22T04:00:00.000Z",
};

assert(
  buildFieldReportPdfFilename(rangeReport) ===
    "Boston-Office-Renovation-Field-Report-2026-08-15-to-2026-08-21.pdf",
  "range filename",
);

assert(
  buildFieldReportPdfFilename({
    ...baseReport,
    projectName: 'Bad:/Name??',
  }).endsWith("-Field-Report-2026-08-21.pdf"),
  "unsafe filename chars removed",
);

const html = buildFieldReportHtml(baseReport);

assert(html.includes("ACTIVITY SUMMARY"), "activity section");
assert(html.includes("MEASUREMENTS RECORDED"), "measurements section");
assert(html.includes("DELTAS DOCUMENTED"), "deltas section");
assert(html.includes("OPEN FIELD DIFFERENCES"), "open section");
assert(html.includes("DOCUMENTED IMPACT"), "impact section");
assert(html.includes("FIELD EVIDENCE"), "evidence section");
assert(html.includes("CURRENT DELTA STATUS"), "status section");
assert(html.includes("PROJECT FIELD INTELLIGENCE"), "project intelligence section");
assert(html.includes("RECENT VARIANCES"), "recent variances section");
assert(html.includes("Measurements recorded"), "activity label");
assert(
  html.includes(
    "Current project disposition counts (not limited to this reporting period).",
  ),
  "current status hint",
);
assert(html.includes("Recorded cost impact"), "recorded cost label");
assert(html.includes("Recorded labor impact"), "recorded labor label");
assert(html.includes("Largest recorded schedule variance"), "schedule label");
assert(html.includes("Delta evidence"), "delta evidence context");
assert(html.includes("Delta evidence test"), "note text");
assert(html.includes(">2<"), "measurement count");
assert(html.includes(">-979.88<") || html.includes("-$979.88"), "impact value");
assert(!html.includes("project delay"), "no project delay");
assert(!html.includes("approved cost"), "no approved cost");
assert(!html.includes("change order value"), "no change order value");
assert(!html.includes("contractual exposure"), "no contractual exposure");
assert(!html.includes("final cost"), "no final cost");

const escapedReport: FieldReport = {
  ...baseReport,
  projectName: `<img src=x onerror=alert(1)>`,
  evidence: [
    {
      ...baseReport.evidence[1],
      note: `<script>alert("x")</script>`,
    },
  ],
};

const escapedHtml = buildFieldReportHtml(escapedReport);
assert(!escapedHtml.includes("<script>alert"), "user note escaped");
assert(escapedHtml.includes("&lt;img"), "project name escaped");

const emptyReport: FieldReport = {
  ...baseReport,
  hasPeriodActivity: false,
  activity: { measurements: 0, deltas: 0, evidence: 0 },
  measurements: [],
  deltasDocumented: [],
  openFieldDifferences: [],
  evidence: [],
  documentedImpact: {
    costImpact: 0,
    laborImpactHours: 0,
    largestRecordedVarianceDays: 0,
    deltasWithScheduleImpact: 0,
  },
};

const emptyHtml = buildFieldReportHtml(emptyReport);
assert(
  emptyHtml.includes(
    "No documented field activity for this reporting period.",
  ),
  "empty period banner",
);
assert(emptyHtml.includes("CURRENT DELTA STATUS"), "empty still has status");

const missingPhotoHtml = buildFieldReportHtml(baseReport, new Map([["e-photo", null]]));
assert(
  missingPhotoHtml.includes(PHOTO_UNAVAILABLE),
  "missing photo placeholder",
);

const embeddedHtml = buildFieldReportHtml(
  baseReport,
  new Map([["e-photo", "data:image/jpeg;base64,abc123"]]),
);
assert(
  embeddedHtml.includes('src="data:image/jpeg;base64,abc123"'),
  "embedded photo src",
);

assert(html.includes("break-after: avoid"), "section title orphan guard");
assert(html.includes(".summary-card"), "summary card selector");
assert(
  html.includes(".item-card.evidence-card") &&
    html.includes("break-inside: auto"),
  "evidence cards break naturally",
);
assert(html.includes(".evidence-meta"), "evidence meta grouping");
assert(html.includes(".delta-card"), "delta card selector");

console.log("fieldReportHtml.selftest: PASS");
