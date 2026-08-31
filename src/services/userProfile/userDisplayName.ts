import { updateProfile } from "firebase/auth";

import { auth } from "../../config/firebase";
import { upsertOwnUserProfile } from "../api/userProfiles";
import { normalizeUserDisplayName } from "../../types/userProfile";

export class UserDisplayNameSyncError extends Error {
  readonly stage: "validation" | "firebase" | "cloud";

  constructor(stage: "validation" | "firebase" | "cloud", message: string) {
    super(message);
    this.name = "UserDisplayNameSyncError";
    this.stage = stage;
  }
}

/**
 * Update the signed-in user's presentation name in Firebase Auth and cloud profile.
 * Does not change authorization identity (Firebase UID).
 */
export async function updateSignedInUserDisplayName(
  rawDisplayName: string,
): Promise<void> {
  const displayName = normalizeUserDisplayName(rawDisplayName);

  if (!displayName) {
    throw new UserDisplayNameSyncError(
      "validation",
      "Enter a valid full name.",
    );
  }

  const user = auth.currentUser;

  if (!user) {
    throw new UserDisplayNameSyncError(
      "validation",
      "Your session could not be authenticated.",
    );
  }

  try {
    await updateProfile(user, { displayName });
  } catch {
    throw new UserDisplayNameSyncError(
      "firebase",
      "Unable to update your account name.",
    );
  }

  try {
    await upsertOwnUserProfile({ displayName });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to save your profile.";

    throw new UserDisplayNameSyncError("cloud", message);
  }

  await user.reload();
}

/**
 * Best-effort cloud profile sync after signup when Firebase displayName is already set.
 * Authentication remains valid if this fails.
 */
export async function syncSignedInUserProfileToCloud(): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    return;
  }

  const displayName = user.displayName?.trim();

  if (!displayName) {
    return;
  }

  await upsertOwnUserProfile({ displayName });
}
