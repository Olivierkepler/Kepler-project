import assert from "node:assert/strict";

import {
  compareProjectProgressBaselinePoints,
  compareProjectProgressSnapshots,
  createProjectProgressBaselinePointId,
  type ProjectProgressBaselinePoint,
  type ProjectProgressSnapshot,
} from "../domain/projectProgress.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import {
  parseProjectProgressBaselineInput,
  parseProjectProgressSnapshotInput,
} from "../validation/projectProgress.js";
import { createProjectProgressService } from "../services/projectProgressService.js";

const PROJECT_ID = "project-progress-test";
const OTHER_PROJECT_ID = "other-project-progress-test";
const OWNER_UID = "progress-owner";
const MEMBER_UID = "progress-member";
const OTHER_UID = "progress-unrelated";

async function run(): Promise<void> {
  const baselineById = new Map<string, ProjectProgressBaselinePoint>();
  const snapshots: ProjectProgressSnapshot[] = [];
  let snapshotSequence = 0;

  function requireReadable(projectId: string, uid: string): void {
    const isKnownProject =
      projectId === PROJECT_ID || projectId === OTHER_PROJECT_ID;
    const isMember = projectId === PROJECT_ID && uid === MEMBER_UID;
    const isOwner = projectId === PROJECT_ID && uid === OWNER_UID;
    if (!isKnownProject || (!isMember && !isOwner)) {
      throw new ProjectAccessError("Project not found", 404);
    }
  }

  function requireOwner(projectId: string, uid: string): void {
    if (projectId !== PROJECT_ID || uid !== OWNER_UID) {
      throw new ProjectAccessError("Project not found", 404);
    }
  }

  const service = createProjectProgressService({
    assertReadable: async (projectId, uid) => requireReadable(projectId, uid),
    assertOwner: async (projectId, uid) => requireOwner(projectId, uid),
    listBaseline: async (projectId) =>
      [...baselineById.values()]
        .filter((point) => point.projectId === projectId)
        .sort(compareProjectProgressBaselinePoints),
    listActual: async (projectId) =>
      snapshots
        .filter((point) => point.projectId === projectId)
        .sort(compareProjectProgressSnapshots),
    upsertBaseline: async (input) => {
      const id = createProjectProgressBaselinePointId(
        input.projectId,
        input.effectiveDate,
      );
      const previous = baselineById.get(id);
      const now = new Date().toISOString();
      const point: ProjectProgressBaselinePoint = {
        id,
        ...input,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      baselineById.set(id, point);
      return point;
    },
    appendActual: async (input) => {
      snapshotSequence += 1;
      const snapshot: ProjectProgressSnapshot = {
        id: `snapshot-${snapshotSequence}`,
        ...input,
        createdAt: new Date().toISOString(),
      };
      snapshots.push(snapshot);
      return snapshot;
    },
  });

  // A: old projects with no progress records read as empty series.
  const empty = await service.getSeries(PROJECT_ID, OWNER_UID);
  assert.deepEqual(empty, { baseline: [], actual: [] });

  // B: owner can write; same project/date is a deterministic upsert.
  const first = await service.upsertBaseline(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressBaselineInput({
      effectiveDate: "2026-02-01",
      plannedPercent: 10,
    })!,
  );
  const sameDate = await service.upsertBaseline(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressBaselineInput({
      effectiveDate: "2026-02-01",
      plannedPercent: 12,
    })!,
  );
  assert.equal(first.id, sameDate.id);
  assert.equal(sameDate.plannedPercent, 12);
  assert.equal(sameDate.createdAt, first.createdAt);
  assert.equal(baselineById.size, 1);

  // F: baseline points are chronologically ordered; decreases are accepted.
  await service.upsertBaseline(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressBaselineInput({
      effectiveDate: "2026-03-01",
      plannedPercent: 8,
    })!,
  );
  let series = await service.getSeries(PROJECT_ID, OWNER_UID);
  assert.deepEqual(
    series.baseline.map((point) => point.effectiveDate),
    ["2026-02-01", "2026-03-01"],
  );

  // C: active member can read, but cannot write.
  const memberSeries = await service.getSeries(PROJECT_ID, MEMBER_UID);
  assert.equal(memberSeries.baseline.length, 2);
  await assert.rejects(
    () => service.upsertBaseline(
      PROJECT_ID,
      MEMBER_UID,
      parseProjectProgressBaselineInput({
        effectiveDate: "2026-04-01",
        plannedPercent: 15,
      })!,
    ),
    ProjectAccessError,
  );

  // D: unrelated users and mismatched project paths are denied.
  await assert.rejects(() => service.getSeries(PROJECT_ID, OTHER_UID), ProjectAccessError);
  await assert.rejects(
    () => service.upsertBaseline(
      OTHER_PROJECT_ID,
      OWNER_UID,
      parseProjectProgressBaselineInput({
        effectiveDate: "2026-04-01",
        plannedPercent: 15,
      })!,
    ),
    ProjectAccessError,
  );

  // E: finite range/date validation rejects invalid percentages and dates.
  assert.equal(parseProjectProgressBaselineInput({ effectiveDate: "2026-02-30", plannedPercent: 10 }), null);
  assert.equal(parseProjectProgressBaselineInput({ effectiveDate: "2026-02-01", plannedPercent: 101 }), null);
  assert.equal(parseProjectProgressBaselineInput({ effectiveDate: "2026-02-01", plannedPercent: Number.NaN }), null);
  assert.equal(parseProjectProgressSnapshotInput({ capturedAt: "not-a-date", actualPercent: 40 }), null);
  assert.equal(parseProjectProgressSnapshotInput({ capturedAt: "2026-02-01T00:00:00.000Z", actualPercent: -1 }), null);

  // G–H: snapshots are append-only and returned in chronological order;
  // actual progress is allowed to decrease after a correction.
  const late = await service.appendSnapshot(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressSnapshotInput({
      capturedAt: "2026-02-03T00:00:00.000Z",
      actualPercent: 30,
    })!,
  );
  const early = await service.appendSnapshot(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressSnapshotInput({
      capturedAt: "2026-02-02T00:00:00.000Z",
      actualPercent: 35,
    })!,
  );
  const correction = await service.appendSnapshot(
    PROJECT_ID,
    OWNER_UID,
    parseProjectProgressSnapshotInput({
      capturedAt: "2026-02-04T00:00:00.000Z",
      actualPercent: 28,
    })!,
  );
  assert.notEqual(late.id, early.id);
  assert.equal(correction.source, "manual");
  series = await service.getSeries(PROJECT_ID, OWNER_UID);
  assert.equal(series.actual.length, 3);
  assert.deepEqual(
    series.actual.map((snapshot) => snapshot.capturedAt),
    [
      "2026-02-02T00:00:00.000Z",
      "2026-02-03T00:00:00.000Z",
      "2026-02-04T00:00:00.000Z",
    ],
  );
  assert.equal(series.actual[2]?.actualPercent, 28);

  console.log("projectProgressServiceTest: PASS");
}

void run().catch((error: unknown) => {
  console.error("projectProgressServiceTest: FAIL", error);
  process.exitCode = 1;
});
