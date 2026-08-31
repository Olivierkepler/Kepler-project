/**
 * Project archive semantics self-check.
 * Run: npx tsx src/utils/domain/projectArchive.selftest.ts
 */

import type { Project } from "../../types/project";
import { isProjectArchived } from "../../store/projects";
import { buildProject } from "./projectCreate";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Mirrors the local archive/restore field merge used by updateProject,
 * without touching AsyncStorage.
 */
function applyArchiveUpdate(
  current: Project,
  archivedAt: string | null,
): Project {
  return {
    ...current,
    archivedAt,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

const created = buildProject("project-archive-test", {
  name: "Archive Test",
  location: "Boston, MA",
  status: "active",
  avatarUri: "file:///tmp/archive-avatar.jpg",
});

assert(
  !isProjectArchived(created),
  "new project without archivedAt is active",
);

assert(
  !isProjectArchived({}),
  "legacy project without archivedAt is active",
);

assert(
  !isProjectArchived({ archivedAt: null }),
  "null archivedAt is active",
);

assert(
  !isProjectArchived({ archivedAt: undefined }),
  "undefined archivedAt is active",
);

const beforeArchiveCreatedAt = created.createdAt;
const beforeArchiveUpdatedAt = created.updatedAt;
const beforeArchiveAvatar = created.avatarUri;
const beforeArchiveName = created.name;
const beforeArchiveStatus = created.status;

void (async () => {
  await sleepMs(5);

  const archived = applyArchiveUpdate(
    created,
    new Date().toISOString(),
  );

  assert(
    isProjectArchived(archived),
    "archivedAt string marks project archived",
  );
  assert(
    typeof archived.archivedAt === "string" &&
      !Number.isNaN(Date.parse(archived.archivedAt)),
    "archivedAt is parseable ISO",
  );
  assert(
    archived.createdAt === beforeArchiveCreatedAt,
    "archive preserves createdAt",
  );
  assert(
    archived.updatedAt !== beforeArchiveUpdatedAt,
    "archive advances updatedAt",
  );
  assert(
    archived.avatarUri === beforeArchiveAvatar,
    "archive preserves avatarUri",
  );
  assert(
    archived.name === beforeArchiveName &&
      archived.status === beforeArchiveStatus,
    "archive preserves project metadata",
  );
  assert(
    archived.progress === created.progress &&
      archived.openDeltas === created.openDeltas &&
      archived.assignedTasks === created.assignedTasks,
    "archive preserves metrics",
  );

  await sleepMs(5);

  const restored = applyArchiveUpdate(archived, null);

  assert(
    !isProjectArchived(restored),
    "restore clears archived state",
  );
  assert(
    restored.archivedAt === null,
    "restore sets archivedAt to null",
  );
  assert(
    restored.createdAt === beforeArchiveCreatedAt,
    "restore preserves createdAt",
  );
  assert(
    restored.updatedAt !== archived.updatedAt,
    "restore advances updatedAt",
  );
  assert(
    restored.avatarUri === beforeArchiveAvatar,
    "restore preserves avatarUri",
  );

  console.log("projectArchive.selftest: PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
