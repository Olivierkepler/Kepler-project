import type {
  ProjectProgressBaselinePoint,
  ProjectProgressSeries,
  ProjectProgressSnapshot,
} from "../../types/projectProgress";
import { authenticatedFetch } from "./client";

export type ProjectProgressBaselineInput = {
  effectiveDate: string;
  plannedPercent: number;
};

export type ProjectProgressSnapshotInput = {
  capturedAt: string;
  actualPercent: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isBaselinePoint(value: unknown): value is ProjectProgressBaselinePoint {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.effectiveDate === "string" &&
    isPercent(value.plannedPercent) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isSnapshot(value: unknown): value is ProjectProgressSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.capturedAt === "string" &&
    isPercent(value.actualPercent) &&
    (value.source === "manual" || value.source === "system") &&
    typeof value.createdAt === "string"
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

function projectProgressPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/progress`;
}

/** GET /api/projects/:projectId/progress */
export async function getProjectProgress(
  projectId: string,
): Promise<ProjectProgressSeries> {
  const response = await authenticatedFetch(projectProgressPath(projectId));
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(body, "Unable to load project progress."));
  }
  if (
    !isRecord(body) ||
    !Array.isArray(body.baseline) ||
    !body.baseline.every(isBaselinePoint) ||
    !Array.isArray(body.actual) ||
    !body.actual.every(isSnapshot)
  ) {
    throw new Error("Unable to load project progress.");
  }
  return {
    baseline: body.baseline,
    actual: body.actual,
  };
}

/** PUT /api/projects/:projectId/progress/baseline (owner-only). */
export async function upsertProjectProgressBaseline(
  projectId: string,
  input: ProjectProgressBaselineInput,
): Promise<ProjectProgressBaselinePoint> {
  const response = await authenticatedFetch(
    `${projectProgressPath(projectId)}/baseline`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(body, "Unable to save the progress baseline."));
  }
  if (!isBaselinePoint(body)) {
    throw new Error("Unable to save the progress baseline.");
  }
  return body;
}

/** POST /api/projects/:projectId/progress/snapshots (owner-only). */
export async function createProjectProgressSnapshot(
  projectId: string,
  input: ProjectProgressSnapshotInput,
): Promise<ProjectProgressSnapshot> {
  const response = await authenticatedFetch(
    `${projectProgressPath(projectId)}/snapshots`,
    { method: "POST", body: JSON.stringify(input) },
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(body, "Unable to record project progress."));
  }
  if (!isSnapshot(body)) {
    throw new Error("Unable to record project progress.");
  }
  return body;
}
