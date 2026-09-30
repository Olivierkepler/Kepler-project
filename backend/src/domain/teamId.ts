export function createTeamId(now: number = Date.now()): string {
  return `team-${now}-${Math.floor(Math.random() * 100000)}`;
}

export function createTeamMembershipId(now: number = Date.now()): string {
  return `team-membership-${now}-${Math.floor(Math.random() * 100000)}`;
}
