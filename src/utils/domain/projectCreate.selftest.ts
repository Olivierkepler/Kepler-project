/**
 * P3 Project create validation self-check.
 * Run: npx tsx src/utils/domain/projectCreate.selftest.ts
 */

import {
  DEFAULT_PROJECT_CREATE_STATUS,
  PROJECT_CREATE_STATUSES,
  buildProject,
  createLocalProjectId,
  isProjectStatusValue,
  validateProjectCreateInput,
} from "./projectCreate";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const valid = validateProjectCreateInput({
  name: "  Cambridge Retail Fit-Out  ",
  location: "  Cambridge, MA ",
  status: "planning",
});
assert(valid.ok, "valid create accepted");
if (valid.ok) {
  assert(valid.value.name === "Cambridge Retail Fit-Out", "name trimmed");
  assert(valid.value.location === "Cambridge, MA", "location trimmed");
  assert(valid.value.status === "planning", "status preserved");
}

const emptyName = validateProjectCreateInput({
  name: "   ",
  location: "Cambridge, MA",
  status: "planning",
});
assert(!emptyName.ok, "empty name rejected");

const whitespaceName = validateProjectCreateInput({
  name: "\t\n",
  location: "Cambridge, MA",
  status: "planning",
});
assert(!whitespaceName.ok, "whitespace-only name rejected");

const emptyLocation = validateProjectCreateInput({
  name: "Cambridge Retail Fit-Out",
  location: "  ",
  status: "planning",
});
assert(!emptyLocation.ok, "empty location rejected");

assert(
  DEFAULT_PROJECT_CREATE_STATUS === "planning",
  "default status is planning",
);
assert(isProjectStatusValue("planning"), "planning is valid status");
assert(isProjectStatusValue("active"), "active is valid status");
assert(isProjectStatusValue("completed"), "completed is valid status");
assert(isProjectStatusValue("on-hold"), "on-hold is valid status");
assert(!isProjectStatusValue("draft"), "draft is invalid status");
assert(!isProjectStatusValue("on_hold"), "on_hold underscore invalid");

const invalidStatus = validateProjectCreateInput({
  name: "Cambridge Retail Fit-Out",
  location: "Cambridge, MA",
  // @ts-expect-error intentional invalid status
  status: "draft",
});
assert(!invalidStatus.ok, "invalid status rejected");

assert(PROJECT_CREATE_STATUSES.length === 4, "four create statuses");

const id = createLocalProjectId();
assert(id.startsWith("project-"), "local id prefix");
assert(!id.includes("/"), "local id has no slash");
assert(id !== "Cambridge Retail Fit-Out", "id is not the display name");

if (valid.ok) {
  const project = buildProject(id, valid.value);
  assert(project.id === id, "built project id");
  assert(project.name === "Cambridge Retail Fit-Out", "built project name");
  assert(project.location === "Cambridge, MA", "built project location");
  assert(project.status === "planning", "built project status");
  assert(project.progress === 0, "progress starts at 0");
  assert(project.openDeltas === 0, "openDeltas starts at 0");
  assert(project.assignedTasks === 0, "assignedTasks starts at 0");
  assert(project.avatarUri === null, "avatarUri defaults to null");
  assert(
    typeof project.createdAt === "string" &&
      !Number.isNaN(Date.parse(project.createdAt)),
    "createdAt is ISO timestamp",
  );
  assert(
    typeof project.updatedAt === "string" &&
      !Number.isNaN(Date.parse(project.updatedAt)),
    "updatedAt is ISO timestamp",
  );
  assert(
    project.createdAt === project.updatedAt,
    "createdAt and updatedAt match on create",
  );
}

if (valid.ok) {
  const withAvatar = buildProject(id, {
    ...valid.value,
    avatarUri: "file:///tmp/project-avatar.jpg",
  });
  assert(
    withAvatar.avatarUri === "file:///tmp/project-avatar.jpg",
    "avatarUri persisted when provided",
  );
}

// Building a project alone must not imply related domain records.
if (valid.ok) {
  const project = buildProject("project-test-1", valid.value);
  assert(
    !("planItemIds" in project) && !("measurementIds" in project),
    "project create does not attach PlanItems/Measurements",
  );
}

console.log("projectCreate.selftest: PASS");
