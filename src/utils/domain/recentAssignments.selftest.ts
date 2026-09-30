import type { RemoteActivityEvent } from "../../types/activityEvent";
import { projectRecentAssignments } from "./recentAssignments";

function event(input: Partial<RemoteActivityEvent> & Pick<RemoteActivityEvent, "id" | "type" | "sourceType" | "createdAt">): RemoteActivityEvent {
  return {
    id: input.id,
    projectId: input.projectId ?? "project",
    type: input.type,
    actorType: input.actorType ?? "human",
    subjectType: input.subjectType ?? "assignment",
    subjectId: input.subjectId ?? input.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? input.id,
    related: input.related ?? {},
    createdAt: input.createdAt,
  };
}

const memberCreated = event({
  id: "member-event", type: "assignment_created", sourceType: "assignment_create",
  related: { workPackageId: "wp", projectMemberId: "member" }, createdAt: "2026-09-29T12:00:00Z",
});
const teamCreated = event({
  id: "team-event", type: "team_assignment_created", sourceType: "team_assignment_create",
  related: { workPackageId: "wp", teamId: "team" }, createdAt: "2026-09-30T12:00:00Z",
});
const names = {
  workPackageNames: new Map([["wp", "Electrical Rough-In"]]),
  memberNames: new Map([["member", "Olivier Kepler"]]),
  teamNames: new Map([["team", "Electrical Team"]]),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const empty = projectRecentAssignments({ events: [], ...names });
assert(empty.length === 0, "empty activity must not produce assignments");

const rows = projectRecentAssignments({ events: [memberCreated, teamCreated], ...names });
assert(rows.length === 2, "member and Team creation events should be included");
assert(rows[0].id === "team-event", "newest assignment must be first");
assert(rows[0].targetType === "team" && rows[0].targetName === "Electrical Team", "Team target should resolve by Team ID");
assert(rows[1].targetType === "member" && rows[1].targetName === "Olivier Kepler", "member target should resolve by ProjectMember ID");
assert(rows[1].workPackageName === "Electrical Rough-In", "Work Package name should resolve by ID");

const excludedTypes = [
  event({ id: "removed", type: "team_assignment_removed", sourceType: "team_assignment_remove", related: { workPackageId: "wp", teamId: "team" }, createdAt: "2026-10-02T12:00:00Z" }),
  event({ id: "status", type: "assignment_completed", sourceType: "assignment_progress_event", related: { workPackageId: "wp", projectMemberId: "member" }, createdAt: "2026-10-01T12:00:00Z" }),
  event({ id: "wrong-source", type: "assignment_created", sourceType: "assignment_progress_event", related: { workPackageId: "wp", projectMemberId: "member" }, createdAt: "2026-10-01T12:00:00Z" }),
];
assert(projectRecentAssignments({ events: excludedTypes, ...names }).length === 0, "removals, lifecycle changes, and mismatched sources must be excluded");

const fallback = projectRecentAssignments({
  events: [event({ id: "fallback", type: "team_assignment_created", sourceType: "team_assignment_create", related: { workPackageId: "missing-wp", teamId: "missing-team" }, createdAt: "2026-09-30T12:00:00Z" })],
  workPackageNames: new Map(), memberNames: new Map(), teamNames: new Map(),
});
assert(fallback[0]?.targetName === "Team" && fallback[0]?.workPackageName === "Work package", "missing presentation must use safe labels without IDs");

const limited = projectRecentAssignments({ events: [memberCreated, teamCreated, teamCreated], ...names, limit: 1 });
assert(limited.length === 1 && limited[0].id === "team-event", "limit applies after newest-first deduplication");
assert(projectRecentAssignments({ events: [memberCreated, memberCreated], ...names }).length === 1, "duplicate Activity IDs must not be repeated");
assert(projectRecentAssignments({ events: [event({ id: "invalid-date", type: "assignment_created", sourceType: "assignment_create", related: { workPackageId: "wp", projectMemberId: "member" }, createdAt: "invalid" })], ...names }).length === 0, "invalid timestamps must be excluded");

// A pre-filtered subset stays a subset: projection never retrieves or infers events.
assert(projectRecentAssignments({ events: [memberCreated], ...names }).every((row) => row.id === "member-event"), "access-filtered input must remain filtered");

console.log("recentAssignments.selftest: ok");
