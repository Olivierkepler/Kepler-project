import type { Team, TeamStatus } from "../../types/team";
import type {
  TeamMembership,
  TeamMembershipStatus,
} from "../../types/teamMembership";
import { authenticatedFetch } from "./client";

const TEAM_STATUSES: readonly TeamStatus[] = ["active", "archived"];
const MEMBERSHIP_STATUSES: readonly TeamMembershipStatus[] = ["active", "removed"];
const MAX_TEAM_NAME_LENGTH = 120;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === "object" && value !== null) {
    const message = (value as Record<string, unknown>).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function validateId(value: string, label: string): string {
  const id = value.trim();
  if (!id) throw new Error(`${label} is required`);
  return id;
}

function validateName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_TEAM_NAME_LENGTH) {
    throw new Error(`Team name must be between 1 and ${MAX_TEAM_NAME_LENGTH} characters.`);
  }
  return name;
}

export function parseTeam(value: unknown): Team | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.name) ||
    typeof record.status !== "string" ||
    !(TEAM_STATUSES as readonly string[]).includes(record.status) ||
    !isNonEmptyString(record.createdBy) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) return null;
  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    name: record.name.trim(),
    status: record.status as TeamStatus,
    createdBy: record.createdBy.trim(),
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

export function parseTeamMembership(value: unknown): TeamMembership | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.projectId) ||
    !isNonEmptyString(record.teamId) ||
    !isNonEmptyString(record.projectMemberId) ||
    typeof record.status !== "string" ||
    !(MEMBERSHIP_STATUSES as readonly string[]).includes(record.status) ||
    !isNonEmptyString(record.createdAt) ||
    !isNonEmptyString(record.updatedAt)
  ) return null;
  return {
    id: record.id.trim(),
    projectId: record.projectId.trim(),
    teamId: record.teamId.trim(),
    projectMemberId: record.projectMemberId.trim(),
    status: record.status as TeamMembershipStatus,
    createdAt: record.createdAt.trim(),
    updatedAt: record.updatedAt.trim(),
  };
}

async function requestTeam(
  path: string,
  init: RequestInit | undefined,
  fallback: string,
): Promise<unknown> {
  const response = await authenticatedFetch(path, init);
  const body = response.status === 204 ? null : await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, fallback));
  return body;
}

function projectTeamsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(validateId(projectId, "projectId"))}/teams`;
}

function teamPath(projectId: string, teamId: string): string {
  return `${projectTeamsPath(projectId)}/${encodeURIComponent(validateId(teamId, "teamId"))}`;
}

export async function listTeams(projectId: string): Promise<Team[]> {
  const body = await requestTeam(projectTeamsPath(projectId), undefined, "Teams could not be loaded.");
  if (!Array.isArray(body)) throw new Error("Teams could not be loaded.");
  const items = body.map(parseTeam);
  if (items.some((item) => item === null)) throw new Error("Teams could not be loaded.");
  return items as Team[];
}

export async function getTeam(projectId: string, teamId: string): Promise<Team> {
  const body = await requestTeam(teamPath(projectId, teamId), undefined, "Team could not be loaded.");
  const team = parseTeam(body);
  if (!team) throw new Error("Team could not be loaded.");
  return team;
}

export async function createTeam(projectId: string, input: { name: string }): Promise<Team> {
  const body = await requestTeam(projectTeamsPath(projectId), {
    method: "POST",
    body: JSON.stringify({ name: validateName(input.name) }),
  }, "Team could not be created.");
  const team = parseTeam(body);
  if (!team) throw new Error("Team could not be created.");
  return team;
}

export async function updateTeam(
  projectId: string,
  teamId: string,
  update: { name: string },
): Promise<Team> {
  const body = await requestTeam(teamPath(projectId, teamId), {
    method: "PATCH",
    body: JSON.stringify({ name: validateName(update.name) }),
  }, "Team could not be updated.");
  const team = parseTeam(body);
  if (!team) throw new Error("Team could not be updated.");
  return team;
}

/** Archives the Team and deactivates its memberships. */
export async function deleteTeam(projectId: string, teamId: string): Promise<Team> {
  const body = await requestTeam(teamPath(projectId, teamId), { method: "DELETE" }, "Team could not be archived.");
  const team = parseTeam(body);
  if (!team) throw new Error("Team could not be archived.");
  return team;
}

export async function listTeamMembers(projectId: string, teamId: string): Promise<TeamMembership[]> {
  const body = await requestTeam(`${teamPath(projectId, teamId)}/members`, undefined, "Team members could not be loaded.");
  if (!Array.isArray(body)) throw new Error("Team members could not be loaded.");
  const items = body.map(parseTeamMembership);
  if (items.some((item) => item === null)) throw new Error("Team members could not be loaded.");
  return items as TeamMembership[];
}

export async function addTeamMember(
  projectId: string,
  teamId: string,
  projectMemberId: string,
): Promise<TeamMembership> {
  const memberId = validateId(projectMemberId, "projectMemberId");
  const body = await requestTeam(`${teamPath(projectId, teamId)}/members`, {
    method: "POST",
    body: JSON.stringify({ projectMemberId: memberId }),
  }, "Team member could not be added.");
  const membership = parseTeamMembership(body);
  if (!membership) throw new Error("Team member could not be added.");
  return membership;
}

export async function removeTeamMember(
  projectId: string,
  teamId: string,
  projectMemberId: string,
): Promise<void> {
  const memberId = validateId(projectMemberId, "projectMemberId");
  await requestTeam(
    `${teamPath(projectId, teamId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
    "Team member could not be removed.",
  );
}
