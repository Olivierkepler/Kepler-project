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
