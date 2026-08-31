import type { DiscoveredProject } from "../../types/discoveredProject";
import type { Project, ProjectStatus } from "../../types/project";
import type { ProjectMemberRole } from "../../types/projectMember";
import {
  getRemoteProjectId,
  setProjectCloudMapping,
} from "../../store/projectCloudMappings";
import { getProjectById } from "../../store/projects";
import { authenticatedFetch } from "./client";

export type CreateRemoteProjectRequest = {
  localProjectId: string;
  name: string;
  location: string;
  status: ProjectStatus;
  progress: number;
  openDeltas: number;
  assignedTasks: number;
};

export type RemoteProject = CreateRemoteProjectRequest & {
  id: string;
  ownerUid: string;
};

/** Deterministic demo project used for controlled cloud bootstrap only. */
export const BOOTSTRAP_PROJECT_ID = "project-001";

function isRemoteProject(value: unknown): value is RemoteProject {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.localProjectId === "string" &&
    typeof record.name === "string" &&
    typeof record.location === "string" &&
    typeof record.status === "string" &&
    typeof record.progress === "number" &&
    typeof record.openDeltas === "number" &&
    typeof record.assignedTasks === "number" &&
    typeof record.ownerUid === "string"
  );
}

function toCreateRemoteProjectRequest(
  project: Project,
): CreateRemoteProjectRequest {
  return {
    localProjectId: project.id,
    name: project.name,
    location: project.location,
    status: project.status,
    progress: project.progress,
    openDeltas: project.openDeltas,
    assignedTasks: project.assignedTasks,
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Unable to reach the authenticated API.");
  }
}

function mapAuthFetchError(error: unknown): never {
  if (error instanceof Error && error.message === "Not authenticated") {
    throw new Error("Your session could not be authenticated.");
  }

  throw new Error("Unable to reach the authenticated API.");
}

/**
 * GET /api/projects for the signed-in user.
 * Does not modify local AsyncStorage stores.
 */
export async function getRemoteProjects(): Promise<RemoteProject[]> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/projects");
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!Array.isArray(payload) || !payload.every(isRemoteProject)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "planning",
  "completed",
  "on-hold",
];

const PROJECT_MEMBER_ROLES: readonly ProjectMemberRole[] = [
  "owner",
  "project_admin",
  "contractor",
  "field_member",
  "viewer",
];

function isDiscoveredProject(value: unknown): value is DiscoveredProject {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const membership = record.membership;

  if (typeof membership !== "object" || membership === null) {
    return false;
  }

  const membershipRecord = membership as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.localProjectId === "string" &&
    record.localProjectId.trim().length > 0 &&
    typeof record.name === "string" &&
    typeof record.location === "string" &&
    typeof record.status === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(record.status) &&
    typeof record.ownerUid === "string" &&
    record.ownerUid.trim().length > 0 &&
    typeof membershipRecord.role === "string" &&
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(
      membershipRecord.role,
    ) &&
    membershipRecord.status === "active"
  );
}

/**
 * GET /api/me/projects — membership + legacy-owner cloud discovery.
 * Does not modify local AsyncStorage stores.
 */
export async function getMyDiscoveredProjects(): Promise<DiscoveredProject[]> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/me/projects");
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!Array.isArray(payload) || !payload.every(isDiscoveredProject)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * GET /api/projects/:projectId for an owned remote project.
 */
export async function getRemoteProject(
  remoteProjectId: string,
): Promise<RemoteProject> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Project not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteProject(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * POST /api/projects (create-only).
 * Does not send ownerUid or remote id — both are set by the backend.
 */
export async function createRemoteProject(
  project: CreateRemoteProjectRequest,
): Promise<RemoteProject> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify(project),
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 409) {
    throw new Error("Project already exists in cloud.");
  }

  if (response.status === 400) {
    throw new Error("Invalid project payload.");
  }

  if (response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteProject(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

export type BootstrapRemoteProjectResult = {
  project: RemoteProject;
  created: boolean;
};

export type UpdateRemoteProjectRequest = {
  name?: string;
  location?: string;
  status?: ProjectStatus;
};

/**
 * PATCH /api/projects/:remoteProjectId — narrow editable fields only.
 */
export async function updateRemoteProject(
  remoteProjectId: string,
  update: UpdateRemoteProjectRequest,
): Promise<RemoteProject> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(remoteProjectId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(update),
      },
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Project not found.");
  }

  if (response.status === 400) {
    throw new Error("Invalid project update payload.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteProject(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload;
}

/**
 * POST /api/projects/bootstrap — idempotent create-or-get.
 */
export async function bootstrapRemoteProject(
  project: CreateRemoteProjectRequest,
): Promise<BootstrapRemoteProjectResult> {
  let response: Response;

  try {
    response = await authenticatedFetch("/api/projects/bootstrap", {
      method: "POST",
      body: JSON.stringify(project),
    });
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 400) {
    throw new Error("Invalid project payload.");
  }

  if (response.status !== 200 && response.status !== 201) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!isRemoteProject(payload)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return {
    project: payload,
    created: response.status === 201,
  };
}

export type RemoteProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: "invited" | "active" | "removed";
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};

const PROJECT_MEMBER_STATUSES = ["invited", "active", "removed"] as const;

function isRemoteProjectMember(value: unknown): value is RemoteProjectMember {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.projectId === "string" &&
    record.projectId.trim().length > 0 &&
    typeof record.userId === "string" &&
    record.userId.trim().length > 0 &&
    typeof record.role === "string" &&
    (PROJECT_MEMBER_ROLES as readonly string[]).includes(record.role) &&
    typeof record.status === "string" &&
    (PROJECT_MEMBER_STATUSES as readonly string[]).includes(record.status) &&
    typeof record.invitedBy === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

/**
 * GET /api/projects/:remoteProjectId/members
 * Owner-only on the backend. Returns canonical cloud ProjectMember records.
 */
export async function getRemoteProjectMembers(
  remoteProjectId: string,
): Promise<RemoteProjectMember[]> {
  const projectId = remoteProjectId.trim();

  if (!projectId) {
    throw new Error("Project not found.");
  }

  let response: Response;

  try {
    response = await authenticatedFetch(
      `/api/projects/${encodeURIComponent(projectId)}/members`,
    );
  } catch (error) {
    mapAuthFetchError(error);
  }

  if (response.status === 401) {
    throw new Error("Your session could not be authenticated.");
  }

  if (response.status === 404) {
    throw new Error("Project not found.");
  }

  if (!response.ok) {
    throw new Error("Unable to reach the authenticated API.");
  }

  const payload = await parseJson(response);

  if (!Array.isArray(payload) || !payload.every(isRemoteProjectMember)) {
    throw new Error("Unable to reach the authenticated API.");
  }

  return payload.map((member) => ({
    id: member.id.trim(),
    projectId: member.projectId.trim(),
    userId: member.userId.trim(),
    role: member.role,
    status: member.status,
    invitedBy: member.invitedBy.trim(),
    createdAt: member.createdAt.trim(),
    updatedAt: member.updatedAt.trim(),
  }));
}

export type BootstrapDemoProjectResult = "created" | "exists";

/**
 * Controlled one-project bootstrap for Boston Office Renovation (project-001).
 * Persists a user-scoped local→remote mapping. Does not mutate Measurements/Deltas.
 */
export async function bootstrapDemoProject(
  ownerUid: string,
): Promise<BootstrapDemoProjectResult> {
  if (!ownerUid.trim()) {
    throw new Error("Your session could not be authenticated.");
  }

  const localProject = await getProjectById(ownerUid, BOOTSTRAP_PROJECT_ID);

  if (!localProject) {
    throw new Error("Demo project is not available locally.");
  }

  const existingRemoteId = await getRemoteProjectId(
    ownerUid,
    BOOTSTRAP_PROJECT_ID,
  );

  if (existingRemoteId) {
    try {
      await getRemoteProject(existingRemoteId);
      return "exists";
    } catch {
      // Mapping stale — continue to re-bootstrap.
    }
  }

  const { project, created } = await bootstrapRemoteProject(
    toCreateRemoteProjectRequest(localProject),
  );

  await setProjectCloudMapping({
    ownerUid,
    localProjectId: BOOTSTRAP_PROJECT_ID,
    remoteProjectId: project.id,
  });

  return created ? "created" : "exists";
}
