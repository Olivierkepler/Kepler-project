/**
 * Builds a cloud ProjectInvitation document ID.
 * Format: `project-invitation-${now}-${random}`
 *
 * Duplicate protection is semantic (projectId + email + pending/accepted),
 * not document-id based — declined/revoked may be reinvited with a new id.
 */
export function createProjectInvitationId(now: number = Date.now()): string {
  return `project-invitation-${now}-${Math.floor(Math.random() * 100000)}`;
}
