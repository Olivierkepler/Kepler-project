import type { TeamMembership } from "../../types/teamMembership";
import type { TeamWorkPackageAssignment } from "../../types/teamWorkPackageAssignment";

export function deriveTeamAssignedItemCounts(input: {
  teamIds: readonly string[];
  memberships: readonly TeamMembership[];
  assignments: readonly TeamWorkPackageAssignment[];
  workPackages: readonly { id: string; planItemIds: readonly string[] }[];
}): Map<string, { memberCount: number; assignedItemCount: number }> {
  const workPackagesById = new Map(input.workPackages.map((item) => [item.id, item] as const));
  const results = new Map<string, { memberCount: number; assignedItemCount: number }>();
  for (const teamId of input.teamIds) {
    const memberIds = new Set(input.memberships.filter((item) => item.teamId === teamId && item.status === "active").map((item) => item.projectMemberId));
    const planItemIds = new Set<string>();
    for (const assignment of input.assignments) {
      if (assignment.teamId !== teamId || assignment.status === "cancelled") continue;
      for (const planItemId of workPackagesById.get(assignment.workPackageId)?.planItemIds ?? []) planItemIds.add(planItemId);
    }
    results.set(teamId, { memberCount: memberIds.size, assignedItemCount: planItemIds.size });
  }
  return results;
}
