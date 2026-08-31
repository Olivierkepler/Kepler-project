import assert from "node:assert/strict";

import type { PlanItem } from "../../types/plan";
import type { ProjectMember } from "../../types/projectMember";
import type { WorkPackage } from "../../types/workPackage";
import type { WorkPackageAssignment } from "../../types/workPackageAssignment";
import {
  buildTeamMemberWorkDetail,
  buildTeamMemberWorkSummaries,
  buildTeamProjectWorkMaps,
  formatWorkPackageNamesSummary,
} from "./teamMemberWork";

const projectId = "project-001";

const memberA: ProjectMember = {
  id: `${projectId}_user-a`,
  projectId,
  userId: "user-a",
  role: "field_member",
  status: "active",
  invitedBy: "owner",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const memberB: ProjectMember = {
  id: `${projectId}_user-b`,
  projectId,
  userId: "user-b",
  role: "contractor",
  status: "active",
  invitedBy: "owner",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const planItem1: PlanItem = {
  id: "pi-1",
  projectId,
  label: "Conference room wall",
  type: "length",
  unit: "ft",
  plannedValue: 40,
  unitCost: 0,
  productionRatePerDay: 0,
  laborHoursPerUnit: 0,
};

const planItem2: PlanItem = {
  id: "pi-2",
  projectId,
  label: "Duplex Receptacle",
  type: "count",
  unit: "ea",
  plannedValue: 48,
  unitCost: 0,
  productionRatePerDay: 0,
  laborHoursPerUnit: 0,
};

const wpElectrical: WorkPackage = {
  id: "wp-electrical",
  projectId,
  name: "Electrical Rough-In",
  status: "ready",
  planItemIds: ["pi-1", "pi-2"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const wpLighting: WorkPackage = {
  id: "wp-lighting",
  projectId,
  name: "Lighting & Controls",
  status: "ready",
  planItemIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const assignmentA1: WorkPackageAssignment = {
  id: "wa-1",
  projectId,
  workPackageId: wpElectrical.id,
  projectMemberId: memberA.id,
  status: "accepted",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const assignmentA2: WorkPackageAssignment = {
  id: "wa-2",
  projectId,
  workPackageId: wpLighting.id,
  projectMemberId: memberA.id,
  status: "assigned",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const maps = buildTeamProjectWorkMaps({
  workPackages: [wpElectrical, wpLighting],
  assignments: [assignmentA1, assignmentA2],
  planItems: [planItem1, planItem2],
});

const summaries = buildTeamMemberWorkSummaries({
  members: [memberA, memberB],
  maps,
  measurements: [
    {
      id: "m-1",
      projectId,
      planItemId: "pi-1",
      type: "length",
      label: "Conference room wall",
      value: 12.08,
      unit: "ft",
      createdAt: "2026-01-02T00:00:00.000Z",
      localMeasurementId: "lm-1",
      reviewStatus: "accepted",
    },
  ],
});

const summaryA = summaries.get(memberA.id)!;
assert.equal(summaryA.workPackageCount, 2);
assert.equal(summaryA.planItemCount, 2);
assert.equal(summaryA.measuredCount, 1);
assert.equal(summaryA.pendingCount, 1);
assert.equal(
  formatWorkPackageNamesSummary(["Electrical Rough-In", "Lighting & Controls"]),
  "Electrical Rough-In + 1 more",
);

const detailA = buildTeamMemberWorkDetail({
  member: memberA,
  maps,
  measurements: [
    {
      id: "m-1",
      projectId,
      planItemId: "pi-1",
      type: "length",
      label: "Conference room wall",
      value: 12.08,
      unit: "ft",
      createdAt: "2026-01-02T00:00:00.000Z",
      localMeasurementId: "lm-1",
      reviewStatus: "accepted",
    },
  ],
});

assert.equal(detailA.workPackageGroups.length, 2);
assert.equal(detailA.workPackageGroups[0]?.items.length, 2);
assert.equal(detailA.workPackageGroups[1]?.items.length, 0);

const summaryB = summaries.get(memberB.id)!;
assert.equal(summaryB.hasAssignedWork, false);
assert.equal(summaryB.planItemCount, 0);

console.log("teamMemberWork.selftest: ok");
