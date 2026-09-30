import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";
import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import { authenticatedFetch } from "./client";

const statuses: readonly string[] = ["assigned", "accepted", "in_progress", "ready_for_review", "completed", "cancelled"];
function parse(value: unknown): TeamWorkPackageAssignment | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const strings = ["id", "projectId", "workPackageId", "teamId", "createdAt", "updatedAt"];
  if (!strings.every((key) => typeof r[key] === "string" && (r[key] as string).trim()) || typeof r.status !== "string" || !statuses.includes(r.status)) return null;
  return { id: (r.id as string).trim(), projectId: (r.projectId as string).trim(), workPackageId: (r.workPackageId as string).trim(), teamId: (r.teamId as string).trim(), status: r.status as WorkPackageAssignmentStatus, createdAt: (r.createdAt as string).trim(), updatedAt: (r.updatedAt as string).trim() };
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await authenticatedFetch(path, init);
  let body: unknown = null;
  try { body = await response.json(); } catch { /* empty response */ }
  if (!response.ok) {
    const error = body && typeof body === "object" ? (body as Record<string, unknown>).error : null;
    throw new Error(typeof error === "string" ? error : "Team assignments are unavailable.");
  }
  return body;
}
function id(value: string, label: string): string { const v = value.trim(); if (!v) throw new Error(`${label} is required.`); return encodeURIComponent(v); }
export async function listTeamWorkPackageAssignments(projectId: string): Promise<TeamWorkPackageAssignment[]> {
  const value = await request(`/api/projects/${id(projectId, "projectId")}/team-work-package-assignments`);
  if (!Array.isArray(value)) throw new Error("Team assignments are unavailable.");
  const items = value.map(parse); if (items.some((item) => !item)) throw new Error("Team assignments are unavailable.");
  return items as TeamWorkPackageAssignment[];
}
export async function assignTeamToWorkPackage(projectId: string, workPackageId: string, teamId: string): Promise<TeamWorkPackageAssignment> {
  const value = await request(`/api/projects/${id(projectId, "projectId")}/work-packages/${id(workPackageId, "workPackageId")}/team-assignments`, { method: "POST", body: JSON.stringify({ teamId: teamId.trim() }) });
  const item = parse(value); if (!item) throw new Error("Team assignment could not be created."); return item;
}
export async function removeTeamFromWorkPackage(projectId: string, workPackageId: string, teamId: string): Promise<void> {
  await request(`/api/projects/${id(projectId, "projectId")}/work-packages/${id(workPackageId, "workPackageId")}/team-assignments/${id(teamId, "teamId")}`, { method: "DELETE" });
}
