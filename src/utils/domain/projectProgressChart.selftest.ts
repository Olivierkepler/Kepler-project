import assert from "node:assert/strict";
import type {
  ProjectProgressBaselinePoint,
  ProjectProgressSeries,
  ProjectProgressSnapshot,
} from "../../types/projectProgress";
import { buildProjectProgressChartData } from "./projectProgressChart";

function baseline(id: string, effectiveDate: string, plannedPercent: number): ProjectProgressBaselinePoint {
  return {
    id,
    projectId: "project-1",
    effectiveDate,
    plannedPercent,
    createdAt: `${effectiveDate}T12:00:00.000Z`,
    updatedAt: `${effectiveDate}T12:00:00.000Z`,
  };
}

function actual(id: string, capturedAt: string, actualPercent: number): ProjectProgressSnapshot {
  return {
    id,
    projectId: "project-1",
    capturedAt,
    actualPercent,
    source: "manual",
    createdAt: capturedAt,
  };
}

const empty = buildProjectProgressChartData({ baseline: [], actual: [] });
assert.deepEqual(empty.baseline, []);
assert.deepEqual(empty.actual, []);
assert.deepEqual(empty.ticks, []);
assert.equal(empty.minX, null);
assert.equal(empty.maxX, null);

const baselineOnly = buildProjectProgressChartData({
  baseline: [baseline("b", "2026-10-15", 40)],
  actual: [],
});
assert.equal(baselineOnly.baseline.length, 1);
assert.equal(baselineOnly.actual.length, 0);

const actualOnly = buildProjectProgressChartData({
  baseline: [],
  actual: [actual("a", "2026-10-15T12:00:00.000Z", 48)],
});
assert.equal(actualOnly.actual.length, 1);
assert.equal(actualOnly.baseline.length, 0);

const both = buildProjectProgressChartData({
  baseline: [baseline("b", "2026-10-15", 62)],
  actual: [actual("a", "2026-10-15T10:00:00.000Z", 48)],
});
assert.equal(both.baseline.length, 1);
assert.equal(both.actual.length, 1);
assert.deepEqual(both.ticks.map((tick) => tick.date), ["2026-10-15"]);

const unsorted = buildProjectProgressChartData({
  baseline: [
    baseline("b2", "2026-10-15", 62),
    baseline("b1", "2026-09-01", 20),
  ],
  actual: [
    actual("a2", "2026-10-15T12:00:00.000Z", 48),
    actual("a1", "2026-09-01T12:00:00.000Z", 18),
  ],
});
assert.deepEqual(unsorted.ticks.map((tick) => tick.date), ["2026-09-01", "2026-10-15"]);
assert.deepEqual(unsorted.baseline.map((point) => point.id), ["b1", "b2"]);
assert.deepEqual(unsorted.actual.map((point) => point.id), ["a1", "a2"]);

const sameDay = buildProjectProgressChartData({
  baseline: [baseline("b", "2026-10-15", 50)],
  actual: [actual("a", "2026-10-15T14:00:00.000Z", 45)],
});
assert.equal(sameDay.ticks.length, 1);
assert.equal(sameDay.ticks[0].date, "2026-10-15");

const multipleSameDay = buildProjectProgressChartData({
  baseline: [],
  actual: [
    actual("later", "2026-10-15T15:00:00.000Z", 40),
    actual("earlier", "2026-10-15T08:00:00.000Z", 35),
  ],
});
assert.equal(multipleSameDay.actual.length, 2);
assert.deepEqual(multipleSameDay.actual.map((point) => point.id), ["earlier", "later"]);
assert.ok(multipleSameDay.actual[0].x < multipleSameDay.actual[1].x);
assert.equal(multipleSameDay.actual[0].label, multipleSameDay.actual[1].label);

const oneActual = buildProjectProgressChartData({
  baseline: [],
  actual: [actual("a", "2026-10-15T12:00:00.000Z", 48)],
});
assert.equal(oneActual.actual.length, 1);

const oneBaseline = buildProjectProgressChartData({
  baseline: [baseline("b", "2026-10-15", 62)],
  actual: [],
});
assert.equal(oneBaseline.baseline.length, 1);

const bounds = buildProjectProgressChartData({
  baseline: [baseline("zero", "2026-09-01", 0), baseline("full", "2026-10-15", 100)],
  actual: [actual("actual-zero", "2026-09-01T08:00:00.000Z", 0), actual("actual-full", "2026-10-15T08:00:00.000Z", 100)],
});
assert.deepEqual(bounds.baseline.map((point) => point.percent), [0, 100]);
assert.deepEqual(bounds.actual.map((point) => point.percent), [0, 100]);

const futureBaseline = buildProjectProgressChartData({
  baseline: [baseline("future", "2027-01-01", 90)],
  actual: [actual("actual", "2026-10-15T12:00:00.000Z", 45)],
});
assert.equal(futureBaseline.baseline.length, 1);
assert.equal(futureBaseline.baseline[0].date, "2027-01-01");
assert.deepEqual(futureBaseline.ticks.map((tick) => tick.date), ["2026-10-15", "2027-01-01"]);

const storedSeries: ProjectProgressSeries = {
  baseline: [baseline("b1", "2026-09-01", 20), baseline("b2", "2026-10-15", 62)],
  actual: [actual("a1", "2026-09-01T12:00:00.000Z", 18)],
};
const chartData = buildProjectProgressChartData(storedSeries);
assert.equal(
  chartData.baseline.length + chartData.actual.length,
  storedSeries.baseline.length + storedSeries.actual.length,
  "chart helper creates no points",
);

console.log("Project progress chart self-tests passed.");
