import type { RemoteActivityEvent } from "../../types/activityEvent";

export type RecentAssignment = {
  id: string;
  workPackageName: string;
  targetType: "member" | "team";
  targetName: string;
  createdAt: string;
};

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Projects only durable assignment creation Activity events. The caller must
 * pass the Activity API's already access-filtered records; this helper never
 * reconstructs events from current assignment state.
 */
export function projectRecentAssignments(input: {
  events: readonly RemoteActivityEvent[];
  workPackageNames: ReadonlyMap<string, string>;
  memberNames: ReadonlyMap<string, string>;
  teamNames: ReadonlyMap<string, string>;
  limit?: number;
}): RecentAssignment[] {
  const limit = Math.max(0, Math.floor(input.limit ?? 3));
  const seen = new Set<string>();
  const projected: RecentAssignment[] = [];

  for (const event of input.events) {
    if (seen.has(event.id)) continue;

    if (
      event.type === "assignment_created" &&
      event.sourceType === "assignment_create" &&
      event.related.projectMemberId &&
      event.related.workPackageId
    ) {
      const workPackageId = event.related.workPackageId;
      const memberId = event.related.projectMemberId;
      projected.push({
        id: event.id,
        workPackageName: input.workPackageNames.get(workPackageId)?.trim() || "Work package",
        targetType: "member",
        targetName: input.memberNames.get(memberId)?.trim() || "Project member",
        createdAt: event.createdAt,
      });
      seen.add(event.id);
      continue;
    }

    if (
      event.type === "team_assignment_created" &&
      event.sourceType === "team_assignment_create" &&
      event.related.teamId &&
      event.related.workPackageId
    ) {
      const workPackageId = event.related.workPackageId;
      const teamId = event.related.teamId;
      projected.push({
        id: event.id,
        workPackageName: input.workPackageNames.get(workPackageId)?.trim() || "Work package",
        targetType: "team",
        targetName: input.teamNames.get(teamId)?.trim() || "Team",
        createdAt: event.createdAt,
      });
      seen.add(event.id);
    }
  }

  return projected
    .filter((item) => Number.isFinite(timestamp(item.createdAt)))
    .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
