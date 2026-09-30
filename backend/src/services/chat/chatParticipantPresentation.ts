import type { ProjectMember } from "../../domain/projectMember.js";
import type { UserProfile } from "../../domain/userProfile.js";
import { resolveMemberPresentationFields } from "../projectMemberPresentation.js";

export type ChatParticipantPresentationDto = {
  projectMemberId: string;
  userId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export async function buildChatParticipantPresentations(input: {
  members: readonly ProjectMember[];
  profiles: readonly UserProfile[];
}): Promise<ChatParticipantPresentationDto[]> {
  const profileByUserId = new Map(
    input.profiles.map((profile) => [profile.uid, profile] as const),
  );

  return Promise.all(
    input.members.map(async (member) => {
      const presentation = await resolveMemberPresentationFields(
        profileByUserId.get(member.userId),
      );

      return {
        projectMemberId: member.id,
        userId: member.userId,
        role: member.role,
        displayName: presentation.displayName,
        email: presentation.email,
        avatarUrl: presentation.avatarUrl,
      };
    }),
  );
}
