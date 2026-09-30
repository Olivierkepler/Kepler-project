import { TEAM_STATUSES, type Team, type TeamStatus } from "../domain/team.js";
import {
  TEAM_MEMBERSHIP_STATUSES,
  type TeamMembership,
  type TeamMembershipStatus,
} from "../domain/teamMembership.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export const MAX_TEAM_NAME_LENGTH = 120;

function isTeamStatus(value: unknown): value is TeamStatus {
  return typeof value === "string" && (TEAM_STATUSES as readonly string[]).includes(value);
}

function isTeamMembershipStatus(value: unknown): value is TeamMembershipStatus {
  return typeof value === "string" &&
    (TEAM_MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

function parseTeamName(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  return trimmed.length <= MAX_TEAM_NAME_LENGTH ? trimmed : null;
}

export type TeamCreateInput = { name: string };
export type TeamUpdateInput = { name: string };

export function parseTeamCreateInput(value: unknown): TeamCreateInput | null {
  if (!isRecord(value)) return null;
  const name = parseTeamName(value.name);
  return name ? { name } : null;
}

export function parseTeamUpdateInput(value: unknown): TeamUpdateInput | null {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "name")) {
    return null;
  }
  const name = parseTeamName(value.name);
  return name ? { name } : null;
}

export function parseTeamMembershipCreateInput(
  value: unknown,
): { projectMemberId: string } | null {
  if (!isRecord(value) || !isNonEmptyString(value.projectMemberId)) return null;
  return { projectMemberId: value.projectMemberId.trim() };
}

export function normalizeTeamDocument(value: unknown): Team | undefined {
  if (!isRecord(value)) return undefined;
  const name = parseTeamName(value.name);
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.projectId) ||
    !name ||
    !isTeamStatus(value.status) ||
    !isNonEmptyString(value.createdBy) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt)
  ) return undefined;
  return {
    id: value.id.trim(),
    projectId: value.projectId.trim(),
    name,
    status: value.status,
    createdBy: value.createdBy.trim(),
    createdAt: value.createdAt.trim(),
    updatedAt: value.updatedAt.trim(),
  };
}

export function normalizeTeamMembershipDocument(
  value: unknown,
): TeamMembership | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.teamId) ||
    !isNonEmptyString(value.projectMemberId) ||
    !isTeamMembershipStatus(value.status) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt)
  ) return undefined;
  return {
    id: value.id.trim(),
    projectId: value.projectId.trim(),
    teamId: value.teamId.trim(),
    projectMemberId: value.projectMemberId.trim(),
    status: value.status,
    createdAt: value.createdAt.trim(),
    updatedAt: value.updatedAt.trim(),
  };
}
