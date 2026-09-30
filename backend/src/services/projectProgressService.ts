import type {
  ProjectProgressBaselinePoint,
  ProjectProgressSeries,
  ProjectProgressSnapshot,
} from "../domain/projectProgress.js";
import {
  appendProjectProgressSnapshot,
  listProjectProgressBaseline,
  listProjectProgressSnapshots,
  upsertProjectProgressBaselinePoint,
} from "../repositories/projectProgressRepository.js";
import { assertProjectOwnedByUser } from "../auth/projectAccess.js";
import { assertProjectAccessContext } from "./collaboration/projectAccessScope.js";
import type {
  ProjectProgressBaselineInput,
  ProjectProgressSnapshotInput,
} from "../validation/projectProgress.js";

export type ProjectProgressServiceDependencies = {
  assertReadable: (projectId: string, uid: string) => Promise<unknown>;
  assertOwner: (projectId: string, uid: string) => Promise<unknown>;
  listBaseline: (projectId: string) => Promise<ProjectProgressBaselinePoint[]>;
  listActual: (projectId: string) => Promise<ProjectProgressSnapshot[]>;
  upsertBaseline: (input: {
    projectId: string;
    effectiveDate: string;
    plannedPercent: number;
  }) => Promise<ProjectProgressBaselinePoint>;
  appendActual: (input: {
    projectId: string;
    capturedAt: string;
    actualPercent: number;
    source: "manual";
  }) => Promise<ProjectProgressSnapshot>;
};

export function createProjectProgressService(
  dependencies: ProjectProgressServiceDependencies,
) {
  return {
    async getSeries(projectId: string, uid: string): Promise<ProjectProgressSeries> {
      await dependencies.assertReadable(projectId, uid);
      const [baseline, actual] = await Promise.all([
        dependencies.listBaseline(projectId),
        dependencies.listActual(projectId),
      ]);
      return { baseline, actual };
    },

    async upsertBaseline(
      projectId: string,
      uid: string,
      input: ProjectProgressBaselineInput,
    ): Promise<ProjectProgressBaselinePoint> {
      await dependencies.assertOwner(projectId, uid);
      return dependencies.upsertBaseline({ projectId, ...input });
    },

    async appendSnapshot(
      projectId: string,
      uid: string,
      input: ProjectProgressSnapshotInput,
    ): Promise<ProjectProgressSnapshot> {
      await dependencies.assertOwner(projectId, uid);
      return dependencies.appendActual({ projectId, ...input, source: "manual" });
    },
  };
}

export const projectProgressService = createProjectProgressService({
  assertReadable: async (projectId, uid) => {
    await assertProjectAccessContext(projectId, uid);
  },
  assertOwner: async (projectId, uid) => {
    await assertProjectOwnedByUser(projectId, uid);
  },
  listBaseline: listProjectProgressBaseline,
  listActual: listProjectProgressSnapshots,
  upsertBaseline: upsertProjectProgressBaselinePoint,
  appendActual: appendProjectProgressSnapshot,
});
