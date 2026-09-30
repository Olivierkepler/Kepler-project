import type { ProjectMember } from "../domain/projectMember.js";
import type { UserProfile } from "../domain/userProfile.js";
import { createUserAvatarReadUrl } from "../storage/userAvatarStorage.js";

/**
 * Safe presentation fields for project members.
 * Never includes avatarStoragePath or other storage internals.
 */
export type MemberPresentationFields = {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type ProjectMemberWithPresentation = ProjectMember &
  MemberPresentationFields;

/**
 * Resolve display identity from a trusted UserProfile document.
 * Avatar signing failures degrade to null — never fail the whole list.
 */
export async function resolveMemberPresentationFields(
  profile: UserProfile | undefined,
): Promise<MemberPresentationFields> {
  if (!profile) {
    return {
      displayName: null,
      email: null,
      avatarUrl: null,
    };
  }

  let avatarUrl: string | null = null;
  const storagePath = profile.avatarStoragePath?.trim();

  if (storagePath) {
    try {
      const signed = await createUserAvatarReadUrl(storagePath);
      avatarUrl = signed.readUrl;
    } catch {
      avatarUrl = null;
    }
  }

  return {
    displayName: profile.displayName?.trim() || null,
    email: profile.email?.trim() || null,
    avatarUrl,
  };
}

/**
 * Enrich already-authorized ProjectMember records with presentation fields.
 * Does not filter by status — invited/active/removed pass through unchanged.
 */
export async function buildProjectMembersWithPresentation(
  members: readonly ProjectMember[],
  profiles: readonly UserProfile[],
): Promise<ProjectMemberWithPresentation[]> {
  const profileByUserId = new Map(
    profiles.map((profile) => [profile.uid, profile] as const),
  );

  return Promise.all(
    members.map(async (member) => {
      const presentation = await resolveMemberPresentationFields(
        profileByUserId.get(member.userId),
      );

      return {
        ...member,
        displayName: presentation.displayName,
        email: presentation.email,
        avatarUrl: presentation.avatarUrl,
      };
    }),
  );
}
