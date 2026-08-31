/**
 * Builds a cloud WorkPackageAssignment document ID.
 * Format: `work-package-assignment-${now}-${random}`
 *
 * Server-generated. Duplicate protection is semantic
 * (projectId + workPackageId + projectMemberId + blocking status),
 * not document-id based — cancelled may be reassigned with a new id.
 */
export function createWorkPackageAssignmentId(
  now: number = Date.now(),
): string {
  return `work-package-assignment-${now}-${Math.floor(Math.random() * 100000)}`;
}
