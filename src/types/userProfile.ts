/**
 * BuildSigma user presentation profile (client mirror of backend domain).
 * Presentation metadata only — not used for authorization.
 */

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export const MAX_USER_DISPLAY_NAME_LENGTH = 120;

export function normalizeUserDisplayName(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_USER_DISPLAY_NAME_LENGTH) {
    return null;
  }

  return trimmed;
}
