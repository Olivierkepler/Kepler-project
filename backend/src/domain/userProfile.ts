/**
 * BuildSigma user presentation profile (presentation metadata only).
 *
 * Canonical authorization identity remains Firebase Auth UID.
 * This record is never used for project access or assignment permissions.
 */

export type UserProfile = {
  /** Firebase Auth UID — document id and canonical profile key. */
  uid: string;
  displayName: string;
  /** Verified email snapshot from authenticated upsert; not used for auth. */
  email: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_USER_DISPLAY_NAME_LENGTH = 120;
