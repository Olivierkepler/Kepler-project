import { getUserProfilesForUids } from "../../services/api/userProfiles";
import type { ProjectMember } from "../../types/projectMember";
import {
  buildProfileByUserIdMap,
  collectUserIdsFromMembers,
  collectUserIdsFromProjectMemberIds,
  type MemberPresentationContext,
} from "./memberDisplay";

/**
 * Best-effort batch profile fetch for collaborator presentation UI.
 * Never affects authorization or assignment identity.
 */
export async function fetchMemberPresentationContext(input: {
  members?: readonly ProjectMember[];
  projectId?: string;
  projectMemberIds?: readonly string[];
  emailByUserId?: ReadonlyMap<string, string>;
}): Promise<MemberPresentationContext> {
  const userIds = new Set<string>();

  if (input.members) {
    for (const userId of collectUserIdsFromMembers(input.members)) {
      userIds.add(userId);
    }
  }

  if (input.projectId && input.projectMemberIds) {
    for (const userId of collectUserIdsFromProjectMemberIds(
      input.projectId,
      input.projectMemberIds,
    )) {
      userIds.add(userId);
    }
  }

  if (userIds.size === 0) {
    return {
      emailByUserId: input.emailByUserId,
    };
  }

  try {
    const profiles = await getUserProfilesForUids([...userIds]);
    return {
      profileByUserId: buildProfileByUserIdMap(profiles),
      emailByUserId: input.emailByUserId,
    };
  } catch {
    return {
      emailByUserId: input.emailByUserId,
    };
  }
}
