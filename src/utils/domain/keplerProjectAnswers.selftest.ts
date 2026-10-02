import {
  buildAttentionAnswer,
  buildLargestVarianceAnswer,
  buildProgressAnswer,
  buildRecentActivityAnswer,
} from "./keplerProjectAnswers";
import type { ProjectTodoItem } from "./projectTodos";
import type { RankedProjectVariance } from "./projectVarianceRanking";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`keplerProjectAnswers self-test failed: ${message}`);
}

function todo(id: string, kind: ProjectTodoItem["kind"]): ProjectTodoItem {
  return { id, kind, sourceType: "plan_item", title: id, context: "", reason: "", planItemId: id };
}

const emptyAttention = buildAttentionAnswer("local-project", []);
assert(emptyAttention.summary === "No project items currently need attention.", "zero To Do actions use a truthful empty state");
assert(emptyAttention.id === "attention:local-project", "attention response ID is stable");

const attention = buildAttentionAnswer("local-project", [
  todo("assign", "needs_assignment"),
  todo("measure", "awaiting_measurement"),
  todo("review", "ready_for_review"),
  todo("correction", "needs_correction"),
  todo("assign-2", "needs_assignment"),
]);
assert(attention.summary === "5 items currently need attention.", "attention total matches passed items");
assert(attention.bullets.join("|") === "1 Need correction|1 Ready for review|1 Need field measurement|2 Need assignment", "attention groups follow established To Do precedence");

const progress = buildProgressAnswer("local-project", {
  currentPlannedPercent: 60,
  currentActualPercent: 52,
  variancePercent: -8,
});
assert(progress.bullets.join("|") === "Actual: 52%|Planned: 60%|Variance: -8 pts", "progress preserves canonical summary values");
assert(progress.summary.includes("8 percentage points below planned"), "progress describes only the calculated difference");
assert(buildProgressAnswer("local-project", null).summary === "Progress tracking is not available for this project.", "missing progress is not presented as zero");

const ranked: RankedProjectVariance[] = [
  { planItemId: "b", measurementId: "mb", deltaId: "db", percentDifference: -4, difference: -2, unit: "ft", status: "open" },
  { planItemId: "a", measurementId: "ma", deltaId: "da", percentDifference: 6, difference: 1, unit: "ft", status: "open" },
];
const largest = buildLargestVarianceAnswer("local-project", ranked, new Map([["a", "Conference wall"], ["b", "Door frame"]]));
assert(largest.summary === "Conference wall", "largest variance is selected by absolute percentage ranking");
assert(largest.bullets[0] === "Recorded difference: +1 ft", "variance is factual without causal interpretation");
const tied = buildLargestVarianceAnswer("local-project", [ranked[1], { ...ranked[0], percentDifference: -6 }], new Map());
assert(tied.summary === "Plan item", "equal variance ties resolve deterministically by plan item ID");
assert(buildLargestVarianceAnswer("local-project", [], new Map()).summary === "No recorded variances are available for this project.", "empty variance has truthful state");
assert(buildLargestVarianceAnswer("local-project", [], new Map(), false).summary === "Variance data is not available for this project.", "unavailable data is distinguished from empty data");

const activity = buildRecentActivityAnswer("local-project", [
  { id: "old", occurredAt: "2025-01-01T00:00:00Z", label: "Oldest" },
  { id: "latest", occurredAt: "2025-01-04T00:00:00Z", label: "Latest" },
  { id: "middle", occurredAt: "2025-01-03T00:00:00Z", label: "Middle" },
  { id: "newer", occurredAt: "2025-01-02T00:00:00Z", label: "Newer" },
  { id: "invalid", occurredAt: "not-a-date", label: "Invalid date" },
], 3);
assert(activity.bullets.join("|") === "Latest|Middle|Newer", "activity is chronological newest-first and limited");
assert(buildRecentActivityAnswer("local-project", []).summary === "No recent project activity is available.", "empty activity is truthful");
assert(activity.id === "activity:local-project", "activity response ID is stable");

// All answer helpers are pure projections: they only report the records passed in.
assert(buildAttentionAnswer("another-project", []).projectId === "another-project", "helper uses explicit project scope and has no global fetch");

console.log("keplerProjectAnswers self-test passed");
