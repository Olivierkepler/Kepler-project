import assert from "node:assert/strict";
import type {
  ProjectProgressBaselinePoint,
  ProjectProgressSeries,
  ProjectProgressSnapshot,
} from "../../types/projectProgress";
import { summarizeProjectProgress } from "./projectProgressSummary";

function baseline(
  id: string,
  effectiveDate: string,
  plannedPercent: number,
): ProjectProgressBaselinePoint {
  return {
    id,
    projectId: "project-1",
    effectiveDate,
    plannedPercent,
    createdAt: `${effectiveDate}T12:00:00.000Z`,
    updatedAt: `${effectiveDate}T12:00:00.000Z`,
  };
}

function actual(
  id: string,
  capturedAt: string,
  actualPercent: number,
): ProjectProgressSnapshot {
  return {
    id,
    projectId: "project-1",
    capturedAt,
    actualPercent,
    source: "manual",
    createdAt: capturedAt,
  };
}

const empty: ProjectProgressSeries = { baseline: [], actual: [] };
assert.deepEqual(summarizeProjectProgress(empty, "2026-10-15"), {
  currentPlannedPercent: null,
  currentActualPercent: null,
  variancePercent: null,
});

assert.deepEqual(
  summarizeProjectProgress(
    { baseline: [], actual: [actual("a", "2026-10-14T10:00:00Z", 32)] },
    "2026-10-15",
  ),
  { currentPlannedPercent: null, currentActualPercent: 32, variancePercent: null },
);

assert.deepEqual(
  summarizeProjectProgress(
    { baseline: [baseline("b", "2026-10-14", 40)], actual: [] },
    "2026-10-15",
  ),
  { currentPlannedPercent: 40, currentActualPercent: null, variancePercent: null },
);

const mixed: ProjectProgressSeries = {
  baseline: [
    baseline("future", "2026-10-16", 70),
    baseline("today", "2026-10-15", 40),
    baseline("past", "2026-10-01", 20),
  ],
  actual: [
    actual("latest", "2026-10-15T16:00:00Z", 32),
    actual("earlier", "2026-10-13T08:00:00Z", 25),
  ],
};
const summary = summarizeProjectProgress(mixed, "2026-10-15");
assert.equal(summary.currentPlannedPercent, 40);
assert.equal(summary.currentActualPercent, 32);
assert.equal(summary.variancePercent, -8);

assert.equal(
  summarizeProjectProgress(
    { baseline: [baseline("b", "2026-10-15", 40)], actual: [actual("a", "2026-10-15T00:00:00Z", 45)] },
    "2026-10-15",
  ).variancePercent,
  5,
);

assert.equal(
  summarizeProjectProgress(
    { baseline: [baseline("b", "2026-10-15", 40)], actual: [actual("a", "2026-10-15T00:00:00Z", 40), actual("later", "2026-10-15T01:00:00Z", 31)] },
    "2026-10-15",
  ).currentActualPercent,
  31,
  "later actual correction may decrease progress",
);

assert.equal(
  summarizeProjectProgress(
    {
      baseline: [baseline("later", "2026-10-12", 50), baseline("earlier", "2026-10-05", 15)],
      actual: [actual("later", "2026-10-12T08:00:00Z", 60), actual("earlier", "2026-10-06T08:00:00Z", 10)],
    },
    "2026-10-15",
  ).variancePercent,
  10,
  "unsorted input still selects latest values",
);

console.log("Project progress summary self-tests passed.");
