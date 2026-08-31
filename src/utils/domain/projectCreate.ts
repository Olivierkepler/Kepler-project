import type { Project, ProjectStatus } from "../../types/project";

export const PROJECT_CREATE_STATUSES: readonly ProjectStatus[] = [
  "active",
  "planning",
  "completed",
  "on-hold",
];

/** Default for newly created projects — matches planning-phase product semantics. */
export const DEFAULT_PROJECT_CREATE_STATUS: ProjectStatus = "planning";

export function isProjectStatusValue(
  value: unknown,
): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_CREATE_STATUSES as readonly string[]).includes(value)
  );
}

export type ProjectCreateInput = {
  name: string;
  location: string;
  status: ProjectStatus;
  avatarUri?: string | null;
};

export type ProjectCreateValidationResult =
  | { ok: true; value: ProjectCreateInput }
  | { ok: false; error: string };

/**
 * Validates create-form input against the existing Project domain.
 * Name and location are required non-empty (trimmed) — matches EditProject
 * and backend bootstrap/create validation.
 */
export function validateProjectCreateInput(
  input: ProjectCreateInput,
): ProjectCreateValidationResult {
  const name = input.name.trim();
  const location = input.location.trim();

  if (!name) {
    return { ok: false, error: "Project name is required." };
  }

  if (!location) {
    return { ok: false, error: "Location is required." };
  }

  if (!isProjectStatusValue(input.status)) {
    return { ok: false, error: "Status is invalid." };
  }

  return {
    ok: true,
    value: {
      name,
      location,
      status: input.status,
    },
  };
}

export function createLocalProjectId(): string {
  return `project-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Builds a new local Project. Metrics start at zero — no PlanItems,
 * Measurements, Deltas, or AgentRuns are implied.
 *
 * createdAt/updatedAt are local chronology only (ISO-8601) and are not
 * part of the remote project create/update contract in this phase.
 */
export function buildProject(
  id: string,
  input: ProjectCreateInput,
): Project {
  const now = new Date().toISOString();

  return {
    id,
    name: input.name,
    location: input.location,
    status: input.status,
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    avatarUri: input.avatarUri ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
