import { WORK_PACKAGE_ASSIGNMENT_STATUSES, type WorkPackageAssignmentStatus } from "../domain/workPackageAssignment.js";
import type { TeamWorkPackageAssignment } from "../domain/teamWorkPackageAssignment.js";
import { isNonEmptyString, isRecord } from "./primitives.js";

export function parseTeamWorkPackageAssignmentCreateInput(value: unknown): { teamId: string } | null {
  if (!isRecord(value) || !isNonEmptyString(value.teamId)) return null;
  return { teamId: value.teamId.trim() };
}

export function isTeamAssignmentStatus(value: unknown): value is WorkPackageAssignmentStatus {
  return typeof value === "string" && (WORK_PACKAGE_ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

export function normalizeTeamWorkPackageAssignment(value: unknown): TeamWorkPackageAssignment | undefined {
  if (!isRecord(value) || !isTeamAssignmentStatus(value.status)) return undefined;
  const keys = ["id", "projectId", "workPackageId", "teamId", "createdAt", "updatedAt"] as const;
  if (!keys.every((key) => isNonEmptyString(value[key]))) return undefined;
  return {
    id: (value.id as string).trim(), projectId: (value.projectId as string).trim(), workPackageId: (value.workPackageId as string).trim(),
    teamId: (value.teamId as string).trim(), status: value.status,
    createdAt: (value.createdAt as string).trim(), updatedAt: (value.updatedAt as string).trim(),
  };
}
