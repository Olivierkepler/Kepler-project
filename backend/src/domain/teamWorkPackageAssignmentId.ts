export function createTeamWorkPackageAssignmentId(now: number = Date.now()): string {
  return `team-work-package-assignment-${now}-${Math.floor(Math.random() * 100000)}`;
}
