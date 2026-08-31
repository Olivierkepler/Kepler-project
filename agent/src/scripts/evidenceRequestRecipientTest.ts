/**
 * Evidence request recipient resolution tests.
 * Run: npx tsx src/scripts/evidenceRequestRecipientTest.ts
 */

import { resolveEvidenceRequestRecipient } from "../domain/evidenceRequestRecipient.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${message}`);
}

const PROJECT = "proj_boston";
const PLAN = "proj_boston_wall";
const WP = "proj_boston_plumber";
const KEPLER = "proj_boston_kepler";
const ROTCHILD = "proj_boston_rotchild";

function wp(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    id: WP,
    projectId: PROJECT,
    name: "Plumber",
    status: "in_progress",
    planItemIds: [PLAN],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as WorkPackage;
}

function assignment(
  memberId: string,
  overrides: Partial<WorkPackageAssignment> = {},
): WorkPackageAssignment {
  return {
    id: `asg_${memberId}`,
    projectId: PROJECT,
    workPackageId: WP,
    projectMemberId: memberId,
    status: "in_progress",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function member(
  id: string,
  overrides: Partial<ProjectMember> = {},
): ProjectMember {
  return {
    id,
    projectId: PROJECT,
    userId: `uid_${id}`,
    role: "field_member",
    status: "active",
    invitedBy: "owner",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: PLAN,
    workPackages: [wp()],
    assignments: [assignment(KEPLER)],
    members: [member(KEPLER)],
  });
  check(
    result.kind === "unique" && result.projectMemberId === KEPLER,
    "A. unique active assignee → Kepler ProjectMember.id",
  );
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: PLAN,
    workPackages: [wp()],
    assignments: [],
    members: [member(KEPLER)],
  });
  check(result.kind === "none", "B. no assignment → none (owner fallback)");
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: PLAN,
    workPackages: [wp()],
    assignments: [
      assignment(KEPLER),
      assignment(ROTCHILD, { id: "asg_rot", status: "assigned" }),
    ],
    members: [member(KEPLER), member(ROTCHILD)],
  });
  check(
    result.kind === "ambiguous" && result.projectMemberIds.length === 2,
    "C. multiple active assignees → ambiguous (owner fallback)",
  );
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: PLAN,
    workPackages: [wp()],
    assignments: [assignment(KEPLER, { status: "completed" })],
    members: [member(KEPLER)],
  });
  check(
    result.kind === "none",
    "D. completed assignment is not an evidence-request recipient",
  );
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: PLAN,
    workPackages: [wp()],
    assignments: [assignment(KEPLER)],
    members: [member(KEPLER, { status: "removed" })],
  });
  check(
    result.kind === "none",
    "E. removed ProjectMember is not eligible",
  );
}

{
  const result = resolveEvidenceRequestRecipient({
    projectId: PROJECT,
    planItemId: "other-plan",
    workPackages: [wp()],
    assignments: [assignment(KEPLER)],
    members: [member(KEPLER)],
  });
  check(
    result.kind === "none",
    "F. plan item outside work package → none",
  );
}

console.log(
  `\nevidenceRequestRecipientTest: ${passed} passed, ${failed} failed`,
);
process.exitCode = failed > 0 ? 1 : 0;
if (failed === 0) {
  console.log("evidenceRequestRecipientTest: PASS");
}
