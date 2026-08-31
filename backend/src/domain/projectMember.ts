/**
 * Cloud ProjectMember (Phase 1F foundation).
 *
 * Compatible with mobile src/types/projectMember.ts role/status enums.
 * Timestamps follow backend ISO-string convention (Evidence, Delta, AgentRun).
 *
 * Project.ownerUid remains authoritative for legacy ownership / access in
 * Phase 1F. Membership is additive and does not grant general project API
 * access until a later phase.
 */

export type ProjectMemberRole =
  | "owner"
  | "project_admin"
  | "contractor"
  | "field_member"
  | "viewer";

export type ProjectMemberStatus =
  | "invited"
  | "active"
  | "removed";

export type ProjectMember = {
  /** Deterministic doc id: `${projectId}_${userId}`. */
  id: string;
  /** Remote Firestore project document ID. */
  projectId: string;
  /** Firebase Auth UID of the member. */
  userId: string;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  /** Firebase Auth UID of the actor who created the membership. */
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
};

export const PROJECT_MEMBER_ROLES: readonly ProjectMemberRole[] = [
  "owner",
  "project_admin",
  "contractor",
  "field_member",
  "viewer",
] as const;

export const PROJECT_MEMBER_STATUSES: readonly ProjectMemberStatus[] = [
  "invited",
  "active",
  "removed",
] as const;
