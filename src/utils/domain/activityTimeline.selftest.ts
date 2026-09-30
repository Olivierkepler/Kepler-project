import {
  activityCategoryForEventType,
  filterActivityTimeline,
  groupActivityTimeline,
  matchesActivitySearch,
  type ActivityTimelineRecord,
} from "./activityTimeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type RecordItem = ActivityTimelineRecord & { label: string };
const now = new Date(2026, 8, 30, 12);
const records: RecordItem[] = [
  { id: "old", occurredAt: "2026-09-28T12:00:00.000Z", category: "assignments", searchableText: "Michelle Electrical Team Electrical Rough-In", label: "older" },
  { id: "yesterday", occurredAt: "2026-09-29T12:00:00.000Z", category: "measurements", searchableText: "Olivier Conference Wall", label: "yesterday" },
  { id: "evidence", occurredAt: "2026-09-30T10:30:00.000Z", category: "evidence", searchableText: "Project member Electrical Rough-In Main conduit caption concrete pour", label: "evidence" },
  { id: "today-new", occurredAt: "2026-09-30T11:00:00.000Z", category: "variances", searchableText: "Main conduit run", label: "newest" },
  { id: "today-old", occurredAt: "2026-09-30T09:00:00.000Z", category: "agent", searchableText: "BuildSigma analysis", label: "today" },
  { id: "bad-date", occurredAt: "bad timestamp", category: "other", searchableText: "", label: "invalid" },
];

const groups = groupActivityTimeline(records, now);
assert(groups[0]?.title === "Today", "today group");
assert(groups[1]?.title === "Yesterday", "yesterday group");
assert(groups[2]?.title === "Monday, September 28", "older local date group");
assert(groups[0]?.items[0]?.id === "today-new", "newest event first");
assert(groups[3]?.title === "Date unavailable", "invalid timestamp is safe");

assert(activityCategoryForEventType("assignment_created") === "assignments", "member assignment category");
assert(activityCategoryForEventType("team_assignment_created") === "assignments", "team assignment category");
assert(activityCategoryForEventType("measurement_submitted") === "measurements", "measurement category");
assert(activityCategoryForEventType("evidence_created") === "evidence", "evidence category");
assert(activityCategoryForEventType("delta_created") === "variances", "variance category");
assert(activityCategoryForEventType("agent_completed") === "agent", "agent category");
assert(activityCategoryForEventType("future_event") === "other", "unknown category");

assert(matchesActivitySearch(records[0]!, "  ELECTRICAL "), "case-insensitive trimmed search");
assert(matchesActivitySearch(records[0]!, "michelle"), "actor search input");
assert(matchesActivitySearch(records[0]!, "electrical rough-in"), "work package search input");
assert(matchesActivitySearch(records[1]!, "conference wall"), "plan item search input");
assert(matchesActivitySearch(records[0]!, "electrical team"), "team search input");
assert(!matchesActivitySearch(records[0]!, "not present"), "no fabricated search match");

assert(filterActivityTimeline({ records, category: "all", query: "" }).length === records.length, "All filter");
assert(filterActivityTimeline({ records, category: "assignments", query: "" }).length === 1, "Assignments filter");
assert(filterActivityTimeline({ records, category: "measurements", query: "" }).length === 1, "Measurements filter");
assert(filterActivityTimeline({ records, category: "evidence", query: "" }).length === 1, "Evidence filter");
assert(filterActivityTimeline({ records, category: "assignments", query: "" }).every((record) => record.id !== "evidence"), "other filters exclude evidence");
assert(matchesActivitySearch(records.find((record) => record.id === "evidence")!, "main conduit"), "evidence presentation is searchable");
assert(filterActivityTimeline({ records, category: "variances", query: "" }).length === 1, "Variances filter");
assert(filterActivityTimeline({ records, category: "agent", query: "" }).length === 1, "Agent filter");
assert(filterActivityTimeline({ records, category: "assignments", query: "electrical" }).length === 1, "search and filter compose");

console.log("activityTimeline.selftest: ok");
