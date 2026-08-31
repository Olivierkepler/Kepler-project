/**
 * Builds a cloud WorkPackage document ID.
 * Format: `work-package-${now}-${random}`
 *
 * Server-generated (no localWorkPackageId bootstrap in Phase 2C).
 * Matches invitation-style non-deterministic ids; uniqueness is document-id based.
 */
export function createWorkPackageId(now: number = Date.now()): string {
  return `work-package-${now}-${Math.floor(Math.random() * 100000)}`;
}
