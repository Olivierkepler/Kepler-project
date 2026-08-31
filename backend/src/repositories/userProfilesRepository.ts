import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { UserProfile } from "../domain/userProfile.js";
import { normalizeUserProfileDocument } from "../validation/userProfile.js";

function requireUid(uid: string): void {
  if (!uid || uid.trim().length === 0) {
    throw new Error("uid is required");
  }
}

export async function getUserProfileByUid(
  uid: string,
): Promise<UserProfile | undefined> {
  requireUid(uid);

  const snapshot = await db
    .collection(COLLECTIONS.userProfiles)
    .doc(uid.trim())
    .get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeUserProfileDocument(uid.trim(), snapshot.data());
}

export async function getUserProfilesByUids(
  uids: readonly string[],
): Promise<UserProfile[]> {
  const unique = [...new Set(uids.map((item) => item.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return [];
  }

  const refs = unique.map((uid) =>
    db.collection(COLLECTIONS.userProfiles).doc(uid),
  );

  const snapshots = await db.getAll(...refs);

  return snapshots
    .map((snapshot) =>
      snapshot.exists
        ? normalizeUserProfileDocument(snapshot.id, snapshot.data())
        : undefined,
    )
    .filter((item): item is UserProfile => item !== undefined);
}

export async function upsertUserProfile(input: {
  uid: string;
  displayName: string;
  email: string;
}): Promise<UserProfile> {
  requireUid(input.uid);

  const uid = input.uid.trim();
  const now = new Date().toISOString();
  const existing = await getUserProfileByUid(uid);

  const profile: UserProfile = {
    uid,
    displayName: input.displayName.trim(),
    email: input.email.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.userProfiles).doc(uid).set(profile);

  return profile;
}
