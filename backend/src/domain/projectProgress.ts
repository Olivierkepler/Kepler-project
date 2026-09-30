/** Historical project-level progress series; values are supplied by an
 * authorized recorder and are not computed from Plan Items or assignments. */
export type ProjectProgressBaselinePoint = {
  id: string;
  projectId: string;
  effectiveDate: string;
  plannedPercent: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectProgressSnapshotSource = "manual" | "system";

export type ProjectProgressSnapshot = {
  id: string;
  projectId: string;
  capturedAt: string;
  actualPercent: number;
  source: ProjectProgressSnapshotSource;
  createdAt: string;
};

export type ProjectProgressSeries = {
  baseline: ProjectProgressBaselinePoint[];
  actual: ProjectProgressSnapshot[];
};

/** Stable per-project/per-date document key makes same-date baseline writes upserts. */
export function createProjectProgressBaselinePointId(
  projectId: string,
  effectiveDate: string,
): string {
  return `baseline-${encodeURIComponent(projectId)}-${effectiveDate}`;
}

export function compareProjectProgressBaselinePoints(
  a: ProjectProgressBaselinePoint,
  b: ProjectProgressBaselinePoint,
): number {
  return a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id);
}

export function compareProjectProgressSnapshots(
  a: ProjectProgressSnapshot,
  b: ProjectProgressSnapshot,
): number {
  return a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id);
}
