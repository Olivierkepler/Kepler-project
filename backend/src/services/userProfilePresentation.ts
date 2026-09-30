import type { UserProfile } from "../domain/userProfile.js";
import { createUserAvatarReadUrl } from "../storage/userAvatarStorage.js";

export type UserProfilePresentation = {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  avatarUrl: string | null;
};

export type UserProfileShellPresentation = {
  uid: string;
  displayName: string;
  email: string;
  createdAt: string | null;
  updatedAt: string | null;
  avatarUrl: string | null;
};

async function resolveAvatarUrl(
  avatarStoragePath: string | null | undefined,
): Promise<string | null> {
  if (!avatarStoragePath?.trim()) {
    return null;
  }

  try {
    const signed = await createUserAvatarReadUrl(avatarStoragePath.trim());
    return signed.readUrl;
  } catch {
    return null;
  }
}

export async function toUserProfilePresentation(
  profile: UserProfile,
): Promise<UserProfilePresentation> {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    email: profile.email,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    avatarUrl: await resolveAvatarUrl(profile.avatarStoragePath),
  };
}

export async function toUserProfilePresentations(
  profiles: readonly UserProfile[],
): Promise<UserProfilePresentation[]> {
  return Promise.all(profiles.map((profile) => toUserProfilePresentation(profile)));
}

export async function toUserProfileShellPresentation(input: {
  uid: string;
  displayName?: string;
  email?: string;
  profile?: UserProfile;
}): Promise<UserProfileShellPresentation> {
  if (input.profile) {
    const presentation = await toUserProfilePresentation(input.profile);
    return presentation;
  }

  return {
    uid: input.uid,
    displayName: input.displayName?.trim() ?? "",
    email: input.email?.trim() ?? "",
    createdAt: null,
    updatedAt: null,
    avatarUrl: null,
  };
}
