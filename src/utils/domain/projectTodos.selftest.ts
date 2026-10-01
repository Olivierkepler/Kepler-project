import type { Measurement } from "../../types/measurement";
import type { PlanItem } from "../../types/plan";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  deriveProjectTodos,
  filterProjectTodosByKind,
  filterProjectTodosByScope,
  type ProjectTodoItem,
} from "./projectTodos";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`projectTodos self-test failed: ${message}`);
}

const lengthItem: PlanItem = {
  id: "plan-1", projectId: "project-1", type: "length", label: "Ceiling Fan",
  plannedValue: 10, unit: "ft", unitCost: 1, productionRatePerDay: 1, laborHoursPerUnit: 1,
};
const lengthItem2: PlanItem = { ...lengthItem, id: "plan-2", label: "Switch" };
const countItem: PlanItem = { ...lengthItem, id: "plan-count", type: "count", unit: "EA", label: "Receptacle" };
const package1: WorkPackage = {
  id: "wp-1", projectId: "project-1", name: "Electrical", status: "ready",
  planItemIds: ["plan-1", "plan-1"], createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const memberAssignment: WorkPackageAssignment = {
  id: "assignment-1", projectId: "project-1", workPackageId: "wp-1", projectMemberId: "member-1",
  status: "assigned", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const teamAssignment: TeamWorkPackageAssignment = {
  id: "team-assignment-1", projectId: "project-1", workPackageId: "wp-1", teamId: "team-1",
  status: "assigned", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const measurement = (id: string, reviewStatus?: Measurement["reviewStatus"]): Measurement => ({
  id, projectId: "project-1", planItemId: "plan-1", type: "length", label: "Ceiling Fan",
  value: 8, unit: "ft", createdAt: id === "newer" ? "2026-02-02" : "2026-02-01", reviewStatus,
});

const base = {
  planItems: [lengthItem, lengthItem2, countItem],
  workPackages: [package1],
  memberAssignments: [],
  teamAssignments: [],
  measurements: [],
};

const unassigned = deriveProjectTodos(base);
assert(unassigned.some((item) => item.id === "needs_assignment:work_package:wp-1"), "unassigned package produces one assignment action");
assert(unassigned.filter((item) => item.id === "needs_assignment:work_package:wp-1").length === 1, "duplicate source Plan Item ids do not duplicate package action");
assert(unassigned.some((item) => item.id === "needs_assignment:plan_item:plan-2"), "ungrouped Plan Item needs assignment");
assert(!unassigned.some((item) => item.id === "awaiting_measurement:plan_item:plan-count"), "unsupported count measurement is not inferred");

const assigned = deriveProjectTodos({ ...base, memberAssignments: [memberAssignment] });
assert(!assigned.some((item) => item.id === "needs_assignment:work_package:wp-1"), "member assigned package has no needs-assignment action");
const teamAssigned = deriveProjectTodos({ ...base, teamAssignments: [teamAssignment] });
assert(!teamAssigned.some((item) => item.id === "needs_assignment:work_package:wp-1"), "Team assigned package has no needs-assignment action");

const awaiting = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [] });
assert(awaiting.some((item) => item.kind === "awaiting_measurement"), "measurable item without measurement awaits field measurement");
const resolved = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [measurement("accepted", "accepted")] });
assert(!resolved.some((item) => item.kind === "awaiting_measurement"), "accepted measurement resolves awaiting action");
const legacyResolved = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [measurement("legacy")] });
assert(!legacyResolved.some((item) => item.kind === "awaiting_measurement"), "legacy measurement with no review status is accepted");

const pending = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [measurement("pending", "pending")] });
assert(pending.some((item) => item.kind === "ready_for_review"), "pending measurement is ready for review");
const correction = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [measurement("rejected", "rejected")] });
assert(correction.some((item) => item.kind === "needs_correction"), "rejected latest measurement needs correction");

const readyAssignment: WorkPackageAssignment = { ...memberAssignment, id: "ready", status: "ready_for_review" };
const review = deriveProjectTodos({ ...base, memberAssignments: [readyAssignment] });
assert(review.some((item) => item.kind === "ready_for_review" && item.workPackageId === "wp-1"), "explicit assignment review state is represented");
const combinedReview = deriveProjectTodos({
  ...base,
  memberAssignments: [readyAssignment],
  measurements: [measurement("pending", "pending")],
});
assert(combinedReview.filter((item) => item.kind === "ready_for_review" && item.planItemId === lengthItem.id).length === 1, "assignment and measurement paths do not duplicate one Plan Item review condition");

const ordered = deriveProjectTodos({
  ...base,
  planItems: [lengthItem],
  workPackages: [],
  measurements: [measurement("pending", "pending")],
});
assert(ordered.map((item) => item.kind).join(",") === "ready_for_review,needs_assignment", "output ordering is deterministic by action priority");
assert(deriveProjectTodos(base).map((item) => item.id).join("|") === deriveProjectTodos(base).map((item) => item.id).join("|"), "ids are deterministic");

const unknown = deriveProjectTodos({ ...base, planItems: [countItem], workPackages: [], measurements: [] });
assert(unknown.length === 1 && unknown[0].kind === "needs_assignment", "unsupported condition does not create a measurement action");
const unknownWithoutAssignments = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [], assignmentDataComplete: false });
assert(!unknownWithoutAssignments.some((item) => item.kind === "needs_assignment"), "incomplete assignment data never fabricates an unassigned action");
const noReviewPermission = deriveProjectTodos({ ...base, planItems: [lengthItem], workPackages: [], measurements: [measurement("pending", "pending")], canReviewMeasurements: false });
assert(!noReviewPermission.some((item) => item.kind === "ready_for_review"), "review action respects caller capability");

const actionable: ProjectTodoItem = {
  id: "awaiting_measurement:plan_item:plan-1",
  kind: "awaiting_measurement",
  title: "Ceiling Fan",
  context: "Electrical",
  reason: "Awaiting field measurement",
  planItemId: "plan-1",
  workPackageId: "wp-1",
};
const mineDirectAssignment: WorkPackageAssignment = {
  ...memberAssignment,
  projectMemberId: "current-member",
};
const otherDirectAssignment: WorkPackageAssignment = {
  ...memberAssignment,
  projectMemberId: "other-member",
};
const scopeArgs = {
  items: [actionable],
  memberAssignments: [mineDirectAssignment],
  teamAssignments: [teamAssignment],
  currentProjectMemberIds: ["current-member"],
  activeTeamIds: ["team-1"],
};
assert(filterProjectTodosByScope({ ...scopeArgs, scope: "mine" }).length === 1, "direct member assignment appears in Mine");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [otherDirectAssignment], teamAssignments: [], scope: "mine" }).length === 0, "unrelated direct assignment does not appear in Mine");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [], scope: "mine" }).length === 1, "active Team membership and Team assignment appear in Mine");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [], activeTeamIds: [], scope: "mine" }).length === 0, "removed Team membership is excluded from Mine");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [], scope: "team" }).length === 1, "Team scope includes visible Team responsibility");
assert(filterProjectTodosByScope({ ...scopeArgs, teamAssignments: [], scope: "team" }).length === 0, "Team scope excludes direct member-only responsibility");
assert(filterProjectTodosByScope({ ...scopeArgs, scope: "all" }).length === 1, "All includes authorized derived actions");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [], activeTeamIds: [], scope: "mine" }).length === 0, "owner authorization alone does not make work Mine");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [mineDirectAssignment, mineDirectAssignment], scope: "mine" }).length === 1, "duplicate assignment paths do not duplicate an action");
assert(
  filterProjectTodosByScope({ ...scopeArgs, scope: "mine" }).map((item) => item.id).join("|") ===
    filterProjectTodosByScope({ ...scopeArgs, scope: "mine" }).map((item) => item.id).join("|"),
  "scope result and count ordering are deterministic",
);
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [{ ...mineDirectAssignment, status: "cancelled" }], teamAssignments: [], scope: "mine" }).length === 0, "cancelled direct assignment does not imply Mine responsibility");
assert(filterProjectTodosByScope({ ...scopeArgs, memberAssignments: [], teamAssignments: [{ ...teamAssignment, status: "cancelled" }], scope: "team" }).length === 0, "cancelled Team assignment does not imply Team responsibility");
assert(filterProjectTodosByScope({ ...scopeArgs, items: [], scope: "mine" }).length === 0, "empty selected scope remains empty");
const secondPackage: WorkPackage = { ...package1, id: "wp-2", name: "Mechanical", planItemIds: [lengthItem.id] };
const multiPathActions = deriveProjectTodos({
  ...base,
  planItems: [lengthItem],
  workPackages: [package1, secondPackage],
  memberAssignments: [{ ...mineDirectAssignment, workPackageId: secondPackage.id }],
});
const multiPathMeasurement = multiPathActions.find((item) => item.kind === "awaiting_measurement");
assert(multiPathMeasurement?.workPackageIds?.length === 2, "one Plan Item action retains all containing Work Package paths");
assert(filterProjectTodosByScope({
  items: multiPathMeasurement ? [multiPathMeasurement] : [],
  scope: "mine",
  memberAssignments: [{ ...mineDirectAssignment, workPackageId: secondPackage.id }],
  teamAssignments: [],
  currentProjectMemberIds: ["current-member"],
  activeTeamIds: [],
}).length === 1, "Mine recognizes responsibility through any containing Work Package");
assert(filterProjectTodosByKind([actionable], "all").length === 1, "All actions filter preserves current actions");
assert(filterProjectTodosByKind([actionable], "awaiting_measurement").length === 1, "selected action kind includes matching action");
assert(filterProjectTodosByKind([actionable], "needs_assignment").length === 0, "selected action kind excludes other kinds");

const orderedActions = deriveProjectTodos({
  ...base,
  planItems: [lengthItem, lengthItem2],
  workPackages: [],
  measurements: [
    measurement("rejected", "rejected"),
    { ...measurement("newer", "pending"), planItemId: lengthItem2.id, label: lengthItem2.label },
  ],
});
assert(orderedActions[0]?.kind === "needs_correction", "correction appears before other action kinds");
assert(orderedActions[1]?.kind === "ready_for_review", "review follows correction in deterministic order");

console.log("projectTodos self-test passed");
