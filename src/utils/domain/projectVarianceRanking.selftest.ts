import assert from "node:assert/strict";
import type { RemoteDelta } from "../../services/api/deltas";
import type { RemoteMeasurement } from "../../services/api/measurements";
import { rankCurrentProjectVariances } from "./projectVarianceRanking";

function measurement(
  id: string,
  planItemId: string,
  createdAt: string,
  reviewStatus: RemoteMeasurement["reviewStatus"] = "accepted",
): RemoteMeasurement {
  return {
    id,
    localMeasurementId: `local-${id}`,
    projectId: "project",
    planItemId,
    type: "length",
    label: "same visible label",
    value: 1,
    unit: "ft",
    createdAt,
    reviewStatus,
  };
}

function delta(
  id: string,
  measurementId: string,
  planItemId: string,
  percentDifference: number | null,
  difference = -1,
  unit = "ft",
  createdAt = "2026-09-01T00:00:00.000Z",
): RemoteDelta {
  return {
    id,
    localDeltaId: `local-${id}`,
    projectId: "project",
    planItemId,
    measurementId,
    type: "length",
    plannedValue: 2,
    actualValue: 1,
    difference,
    percentDifference,
    unit,
    unitCost: 1,
    costImpact: difference,
    productionRatePerDay: 1,
    scheduleImpactDays: 0,
    laborHoursPerUnit: 1,
    laborImpactHours: 0,
    status: "open",
    dispositionReason: "",
    disposedAt: null,
    createdAt,
  };
}

const empty = rankCurrentProjectVariances([], []);
assert.deepEqual(empty, []);

const single = rankCurrentProjectVariances(
  [measurement("m1", "p1", "2026-09-01T00:00:00Z")],
  [delta("d1", "m1", "p1", -50, -3, "ft")],
);
assert.equal(single.length, 1);
assert.equal(single[0].measurementId, "m1");

const latestWins = rankCurrentProjectVariances(
  [
    measurement("old", "p1", "2026-09-01T00:00:00Z"),
    measurement("new", "p1", "2026-09-02T00:00:00Z"),
  ],
  [
    delta("old-delta", "old", "p1", -90),
    delta("new-delta", "new", "p1", -20),
  ],
);
assert.equal(latestWins.length, 1);
assert.equal(latestWins[0].deltaId, "new-delta");

const noResurrection = rankCurrentProjectVariances(
  [
    measurement("old", "p1", "2026-09-01T00:00:00Z"),
    measurement("new-no-delta", "p1", "2026-09-02T00:00:00Z"),
  ],
  [delta("old-delta", "old", "p1", -90)],
);
assert.deepEqual(noResurrection, []);

const pendingDoesNotReplace = rankCurrentProjectVariances(
  [
    measurement("accepted", "p1", "2026-09-01T00:00:00Z"),
    measurement("pending", "p1", "2026-09-03T00:00:00Z", "pending"),
  ],
  [delta("accepted-delta", "accepted", "p1", -10)],
);
assert.equal(pendingDoesNotReplace[0].measurementId, "accepted");

assert.deepEqual(
  rankCurrentProjectVariances(
    [measurement("m", "p", "2026-09-01T00:00:00Z")],
    [delta("d", "m", "p", null)],
  ),
  [],
);

const ranked = rankCurrentProjectVariances(
  [
    measurement("small", "p-small", "2026-09-01T00:00:00Z"),
    measurement("large", "p-large", "2026-09-01T00:00:00Z"),
    measurement("over100", "p-over", "2026-09-01T00:00:00Z"),
    measurement("positive", "p-positive", "2026-09-01T00:00:00Z"),
  ],
  [
    delta("d-small", "small", "p-small", -47.5, -19, "ft"),
    delta("d-large", "large", "p-large", -82.5, -99, "ft"),
    delta("d-over", "over100", "p-over", -150, -3, "count"),
    delta("d-positive", "positive", "p-positive", 90, 4, "sq ft"),
  ],
);
assert.deepEqual(ranked.map((entry) => entry.deltaId), [
  "d-over",
  "d-positive",
  "d-large",
  "d-small",
]);
assert.equal(ranked[0].percentDifference, -150);
assert.equal(ranked[0].difference, -3);
assert.equal(ranked[0].unit, "count");
assert.equal(ranked[1].percentDifference, 90);
assert.equal(ranked[1].difference, 4);

const multiplePlanItems = rankCurrentProjectVariances(
  [
    measurement("m-b", "p-b", "2026-09-02T00:00:00Z"),
    measurement("m-a", "p-a", "2026-09-01T00:00:00Z"),
  ],
  [delta("d-b", "m-b", "p-b", 20), delta("d-a", "m-a", "p-a", -30)],
);
assert.deepEqual(multiplePlanItems.map((entry) => entry.planItemId), ["p-a", "p-b"]);

const duplicateLabelCrossMatch = rankCurrentProjectVariances(
  [
    measurement("m1", "p1", "2026-09-01T00:00:00Z"),
    measurement("m2", "p2", "2026-09-01T00:00:00Z"),
  ],
  [delta("d1", "m1", "p2", -99)],
);
assert.deepEqual(duplicateLabelCrossMatch, []);

console.log("projectVarianceRanking self-test passed");
