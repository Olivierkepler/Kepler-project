/**
 * Phase 2P.4 — Plan Import review util self-check (mobile).
 * Run from repo root: npx tsx src/scripts/phase2P4PlanImportReviewUtilTest.ts
 */

import {
  candidateNeedsAttention,
  confidenceBand,
  filterPlanImportCandidates,
  isPlanImportApprovalReady,
  summarizePlanImportReview,
  type PlanImportReviewCandidateLike,
} from "../utils/planImportReview";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function baseCandidate(
  overrides: Partial<PlanImportReviewCandidateLike> = {},
): PlanImportReviewCandidateLike {
  return {
    label: "Main duct run",
    type: "length",
    plannedValue: 120,
    unit: "ft",
    confidence: 0.9,
    sourceFileId: "file-1",
    sourcePage: 2,
    sourceReference: "Sheet M-101",
    selected: true,
    reviewStatus: "reviewed",
    ...overrides,
  };
}

assert(confidenceBand(0.9) === "High", "high confidence band");
assert(confidenceBand(0.7) === "Medium", "medium confidence band");
assert(confidenceBand(0.4) === "Low", "low confidence band");

assert(
  !candidateNeedsAttention(baseCandidate()),
  "healthy candidate does not need attention",
);
assert(
  candidateNeedsAttention(baseCandidate({ confidence: 0.5 })),
  "low confidence needs attention",
);
assert(
  candidateNeedsAttention(
    baseCandidate({ sourcePage: null, sourceReference: null }),
  ),
  "missing page and reference needs attention",
);
assert(
  candidateNeedsAttention(baseCandidate({ label: "  " })),
  "empty label needs attention",
);
assert(
  candidateNeedsAttention(
    baseCandidate({ plannedValue: null, unit: null }),
  ),
  "missing measurable fields need attention",
);

const mixed: PlanImportReviewCandidateLike[] = [
  baseCandidate({
    label: "A",
    selected: true,
    reviewStatus: "reviewed",
    confidence: 0.9,
  }),
  baseCandidate({
    label: "B",
    selected: false,
    reviewStatus: "unreviewed",
    confidence: 0.4,
    sourcePage: null,
    sourceReference: null,
  }),
  baseCandidate({
    label: "C",
    selected: true,
    reviewStatus: "unreviewed",
    confidence: 0.8,
  }),
];

assert(
  filterPlanImportCandidates(mixed, "selected").length === 2,
  "selected filter",
);
assert(
  filterPlanImportCandidates(mixed, "needs_attention").length === 1,
  "needs_attention filter",
);
assert(
  filterPlanImportCandidates(mixed, "reviewed").length === 1,
  "reviewed filter",
);
assert(
  filterPlanImportCandidates(mixed, "all").length === 3,
  "all filter",
);

const summary = summarizePlanImportReview(mixed);
assert(summary.total === 3, "summary total");
assert(summary.selected === 2, "summary selected");
assert(summary.reviewed === 1, "summary reviewed");
assert(summary.needsAttention === 1, "summary needs attention");

const notReady = isPlanImportApprovalReady(mixed);
assert(!notReady.ready, "mixed set is not approval-ready");
assert(
  notReady.reasons.some((r) => r.includes("Review every selected")),
  "readiness reason for unreviewed selected",
);

const readySet: PlanImportReviewCandidateLike[] = [
  baseCandidate({
    label: "Ready one",
    selected: true,
    reviewStatus: "reviewed",
  }),
  baseCandidate({
    label: "Skipped",
    selected: false,
    reviewStatus: "unreviewed",
    confidence: 0.5,
  }),
];
const ready = isPlanImportApprovalReady(readySet);
assert(ready.ready, "selected reviewed set is approval-ready");
assert(ready.reasons.length === 0, "no readiness reasons when ready");

const noneSelected = isPlanImportApprovalReady([
  baseCandidate({ selected: false, reviewStatus: "reviewed" }),
]);
assert(!noneSelected.ready, "zero selected is not ready");

console.log("PASS phase2P4PlanImportReviewUtilTest");
