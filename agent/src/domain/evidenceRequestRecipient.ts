/**
 * Resolves the unique active Field Member for a Plan Item evidence request.
 * Canonical chain: PlanItem → WorkPackage.planItemIds → WorkPackageAssignment → ProjectMember.id
 *
 * Returns null when zero or multiple active assignees (owner fallback / ambiguity).
 * Never uses display name or email as identity.
 */

import type { ProjectMember } from "./projectMember.js";
import type { WorkPackage } from "./workPackage.js";
import type { WorkPackageAssignment } from "./workPackageAssignment.js";

/** Assignment statuses that may receive an evidence request. */
export const EVIDENCE_REQUEST_ACTIVE_ASSIGNMENT_STATUSES: readonly WorkPackageAssignment["status"][] =
  ["assigned", "accepted", "in_progress", "ready_for_review"] as const;

const ACTIVE_STATUS_SET: ReadonlySet<string> = new Set(
  EVIDENCE_REQUEST_ACTIVE_ASSIGNMENT_STATUSES,
);

export type ResolveEvidenceRequestRecipientInput = {
  projectId: string;
  planItemId: string;
  workPackages: readonly WorkPackage[];
  assignments: readonly WorkPackageAssignment[];
  /** Optional: when provided, only active members in this project are eligible. */
  members?: readonly ProjectMember[];
};

export type ResolveEvidenceRequestRecipientResult =
  | { kind: "unique"; projectMemberId: string }
  | { kind: "none" }
  | { kind: "ambiguous"; projectMemberIds: string[] };

/**
 * Pure resolution — application-controlled; never driven by Gemini.
 */
export function resolveEvidenceRequestRecipient(
  input: ResolveEvidenceRequestRecipientInput,
): ResolveEvidenceRequestRecipientResult {
  const projectId = input.projectId.trim();
  const planItemId = input.planItemId.trim();

  if (!projectId || !planItemId) {
    return { kind: "none" };
  }

  const memberActiveById = new Map<string, boolean>();
  if (input.members) {
    for (const member of input.members) {
      if (member.projectId !== projectId) {
        continue;
      }
      memberActiveById.set(
        member.id,
        member.status === "active",
      );
    }
  }

  const relevantWorkPackageIds = new Set<string>();
  for (const workPackage of input.workPackages) {
    if (workPackage.projectId !== projectId) {
      continue;
    }
    if (workPackage.status === "cancelled") {
      continue;
    }
    if (workPackage.planItemIds.includes(planItemId)) {
      relevantWorkPackageIds.add(workPackage.id);
    }
  }

  if (relevantWorkPackageIds.size === 0) {
    return { kind: "none" };
  }

  const candidateMemberIds = new Set<string>();

  for (const assignment of input.assignments) {
    if (assignment.projectId !== projectId) {
      continue;
    }
    if (!relevantWorkPackageIds.has(assignment.workPackageId)) {
      continue;
    }
    if (!ACTIVE_STATUS_SET.has(assignment.status)) {
      continue;
    }

    const memberId = assignment.projectMemberId.trim();
    if (!memberId) {
      continue;
    }

    if (input.members) {
      const active = memberActiveById.get(memberId);
      if (active !== true) {
        continue;
      }
    }

    candidateMemberIds.add(memberId);
  }

  const sorted = [...candidateMemberIds].sort((a, b) => a.localeCompare(b));

  if (sorted.length === 0) {
    return { kind: "none" };
  }

  if (sorted.length > 1) {
    return { kind: "ambiguous", projectMemberIds: sorted };
  }

  return { kind: "unique", projectMemberId: sorted[0]! };
}
