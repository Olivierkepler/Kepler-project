import { projects as seedProjects } from "../data/projects";
import type { Project, ProjectStatus } from "../types/project";
import {
  buildProject,
  createLocalProjectId,
  validateProjectCreateInput,
  type ProjectCreateInput,
} from "../utils/domain/projectCreate";
import {
  resolveScopedOperationalArray,
  scopedOperationalKey,
} from "./localDataScope";
import { writeJsonArray } from "./storage";

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "planning",
  "completed",
  "on-hold",
];

function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

function isProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.name === "string" &&
    typeof record.location === "string" &&
    isProjectStatus(record.status) &&
    typeof record.progress === "number" &&
    typeof record.openDeltas === "number" &&
    typeof record.assignedTasks === "number" &&
    (record.avatarUri === undefined ||
      record.avatarUri === null ||
      typeof record.avatarUri === "string") &&
    (record.createdAt === undefined ||
      typeof record.createdAt === "string") &&
    (record.updatedAt === undefined ||
      typeof record.updatedAt === "string") &&
    (record.archivedAt === undefined ||
      record.archivedAt === null ||
      typeof record.archivedAt === "string")
  );
}

function copyProject(project: Project): Project {
  return { ...project };
}

async function loadProjects(ownerUid: string): Promise<Project[]> {
  const items = await resolveScopedOperationalArray(
    "projects",
    ownerUid,
    () => seedProjects.map(copyProject),
  );

  return items.filter(isProject).map(copyProject);
}

export async function getProjects(ownerUid: string): Promise<Project[]> {
  return loadProjects(ownerUid);
}

export async function getProjectById(
  ownerUid: string,
  projectId: string,
): Promise<Project | undefined> {
  const projects = await loadProjects(ownerUid);
  const found = projects.find((project) => project.id === projectId);
  return found ? copyProject(found) : undefined;
}

/**
 * Adds a Project only if the local id is absent in this owner's namespace.
 * Does not overwrite existing local values.
 */
export async function addProjectIfAbsent(
  ownerUid: string,
  project: Project,
): Promise<boolean> {
  if (!isProject(project)) {
    throw new Error("Invalid project.");
  }

  const projects = await loadProjects(ownerUid);

  if (projects.some((existing) => existing.id === project.id)) {
    return false;
  }

  const next = [...projects, copyProject(project)];
  await writeJsonArray(scopedOperationalKey("projects", ownerUid), next);
  return true;
}

/**
 * Local-first Project create. Generates a local id, persists immediately,
 * and does not create PlanItems, Measurements, Deltas, Evidence, or AgentRuns.
 */
export async function createProject(
  ownerUid: string,
  input: ProjectCreateInput,
): Promise<Project> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid project create.");
  }

  const validated = validateProjectCreateInput(input);

  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const id = createLocalProjectId();

  if (id.includes("/")) {
    throw new Error("Invalid project id.");
  }

  const project = buildProject(id, {
    ...validated.value,
    avatarUri: input.avatarUri ?? null,
  });
  const added = await addProjectIfAbsent(ownerUid, project);

  if (!added) {
    throw new Error("Project id already exists.");
  }

  return copyProject(project);
}

export type ProjectUpdate = {
  name?: string;
  location?: string;
  status?: ProjectStatus;
  avatarUri?: string | null;
  archivedAt?: string | null;
};

/**
 * Active (current workspace) when archivedAt is missing/null.
 * Archived when archivedAt is a string (ISO-8601 expected).
 */
export function isProjectArchived(
  project: Pick<Project, "archivedAt">,
): boolean {
  return typeof project.archivedAt === "string";
}

function isValidProjectUpdate(update: ProjectUpdate): boolean {
  if (update.name !== undefined) {
    if (typeof update.name !== "string" || update.name.trim().length === 0) {
      return false;
    }
  }

  if (update.location !== undefined) {
    if (
      typeof update.location !== "string" ||
      update.location.trim().length === 0
    ) {
      return false;
    }
  }

  if (update.status !== undefined && !isProjectStatus(update.status)) {
    return false;
  }

  if (update.avatarUri !== undefined) {
    if (
      update.avatarUri !== null &&
      typeof update.avatarUri !== "string"
    ) {
      return false;
    }
  }

  if (update.archivedAt !== undefined) {
    if (
      update.archivedAt !== null &&
      typeof update.archivedAt !== "string"
    ) {
      return false;
    }
  }

  return (
    update.name !== undefined ||
    update.location !== undefined ||
    update.status !== undefined ||
    update.avatarUri !== undefined ||
    update.archivedAt !== undefined
  );
}

/**
 * Narrow Project field update. Does not allow id mutation.
 */
export async function updateProject(
  ownerUid: string,
  projectId: string,
  update: ProjectUpdate,
): Promise<Project | undefined> {
  if (!ownerUid.trim() || !projectId.trim() || !isValidProjectUpdate(update)) {
    throw new Error("Invalid project update.");
  }

  const projects = await loadProjects(ownerUid);
  const index = projects.findIndex((project) => project.id === projectId);

  if (index < 0) {
    return undefined;
  }

  const current = projects[index];
  const nextProject: Project = {
    ...current,
    ...(update.name !== undefined ? { name: update.name.trim() } : {}),
    ...(update.location !== undefined
      ? { location: update.location.trim() }
      : {}),
    ...(update.status !== undefined ? { status: update.status } : {}),
    ...(update.avatarUri !== undefined
      ? { avatarUri: update.avatarUri }
      : {}),
    ...(update.archivedAt !== undefined
      ? { archivedAt: update.archivedAt }
      : {}),
    // Preserve original createdAt (including undefined for legacy projects).
    // Callers cannot overwrite createdAt via ProjectUpdate.
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const next = [...projects];
  next[index] = copyProject(nextProject);
  await writeJsonArray(scopedOperationalKey("projects", ownerUid), next);
  return copyProject(nextProject);
}

/**
 * Archive a locally owned project. Data is preserved; project leaves the
 * current workspace. Local-only — not synced remotely in this phase.
 */
export async function archiveProject(
  ownerUid: string,
  projectId: string,
): Promise<Project | undefined> {
  return updateProject(ownerUid, projectId, {
    archivedAt: new Date().toISOString(),
  });
}

/**
 * Restore a previously archived locally owned project to the current workspace.
 */
export async function restoreProject(
  ownerUid: string,
  projectId: string,
): Promise<Project | undefined> {
  return updateProject(ownerUid, projectId, {
    archivedAt: null,
  });
}
