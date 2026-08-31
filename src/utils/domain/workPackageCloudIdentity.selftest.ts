import assert from "node:assert/strict";

import { resolveCloudProjectMemberId } from "../../utils/domain/workPackageCloudIdentity";

function run() {
  const remoteProjectId = "remote-proj-abc";

  assert.equal(
    resolveCloudProjectMemberId({
      selectedMemberId: `${remoteProjectId}_user-rose`,
      remoteProjectId,
    }),
    `${remoteProjectId}_user-rose`,
    "cloud member id should pass through unchanged",
  );

  assert.equal(
    resolveCloudProjectMemberId({
      selectedMemberId: "project-member-local-1",
      remoteProjectId,
      memberUserId: "user-rose",
    }),
    `${remoteProjectId}_user-rose`,
    "local member id should resolve via userId",
  );

  assert.equal(
    resolveCloudProjectMemberId({
      selectedMemberId: "orphan-id",
      remoteProjectId,
    }),
    "orphan-id",
    "unknown id without userId should pass through for backend validation",
  );

  console.log("workPackageCloudIdentity.selftest: ok");
}

run();
