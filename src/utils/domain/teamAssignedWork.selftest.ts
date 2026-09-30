import { deriveTeamAssignedItemCounts } from "./teamAssignedWork";
import type { TeamMembership } from "../../types/teamMembership";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
const memberships: TeamMembership[] = [
  { id: "m1", projectId: "p", teamId: "t", projectMemberId: "pm1", status: "active", createdAt: "x", updatedAt: "x" },
  { id: "m2", projectId: "p", teamId: "t", projectMemberId: "pm1", status: "active", createdAt: "x", updatedAt: "x" },
];
const assignments: TeamWorkPackageAssignment[] = [
  { id: "a1", projectId: "p", workPackageId: "w1", teamId: "t", status: "assigned", createdAt: "x", updatedAt: "x" },
  { id: "a2", projectId: "p", workPackageId: "w2", teamId: "t", status: "assigned", createdAt: "x", updatedAt: "x" },
  { id: "a3", projectId: "p", workPackageId: "w3", teamId: "t", status: "cancelled", createdAt: "x", updatedAt: "x" },
];
const workPackages = [
  { id: "w1", planItemIds: ["i1", "i2"] }, { id: "w2", planItemIds: ["i2", "i3"] }, { id: "w3", planItemIds: ["i4"] },
];
const counts = deriveTeamAssignedItemCounts({ teamIds: ["t"], memberships, assignments, workPackages });
const actual = counts.get("t");
if (actual?.memberCount !== 1 || actual.assignedItemCount !== 3) throw new Error("Team work counts must be distinct active members and Plan Items.");
console.log("teamAssignedWork.selftest: ok");
