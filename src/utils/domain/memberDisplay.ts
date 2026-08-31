import type {
  ProjectMember,
  ProjectMemberRole,
} from "../../types/projectMember";
import { formatProjectMemberRoleLabel } from "./memberRoleLabels";

export type MemberDisplayInput = {
  displayName?: string | null;
  email?: string | null;
  role?: ProjectMemberRole | string | null;
  /** Never used as authorization identity. Final fallback only. */
  userId?: string | null;
};

export type UserPresentationRecord = {
  displayName?: string | null;
  email?: string | null;
};

export type MemberPresentationContext = {
  profileByUserId?: ReadonlyMap<string, UserPresentationRecord>;
  emailByUserId?: ReadonlyMap<string, string>;
};

/**
 * Compact fallback when no display name or email is available.
 */
export function shortenUserIdentifier(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed) {
    return "Member";
  }
  if (trimmed.length <= 18) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
}

/**
 * Smallest safe identity label for collaboration UI.
 * Never invents a personal name. Never uses raw UID when email/name exists.
 *
 * Resolution order:
 * displayName → email → shortened userId → role label → generic fallback
 */
export function formatMemberDisplayLabel(input: MemberDisplayInput): string {
  const displayName = input.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const email = input.email?.trim().toLowerCase();
  if (email) {
    return email;
  }

  if (input.userId?.trim()) {
    return shortenUserIdentifier(input.userId);
  }

  if (input.role) {
    return formatProjectMemberRoleLabel(input.role);
  }

  return "Project member";
}

/**
 * Compact avatar glyph from a display label (not from raw UID).
 */
export function memberDisplayInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

function extractUserIdFromProjectMemberId(
  projectId: string,
  projectMemberId: string,
): string {
  const prefix = `${projectId}_`;
  if (projectMemberId.startsWith(prefix)) {
    return projectMemberId.slice(prefix.length);
  }
  return projectMemberId;
}

function resolveUserPresentation(
  userId: string,
  context?: MemberPresentationContext,
): UserPresentationRecord {
  const profile = context?.profileByUserId?.get(userId);
  const invitationEmail = context?.emailByUserId?.get(userId) ?? null;

  return {
    displayName: profile?.displayName ?? null,
    email: profile?.email ?? invitationEmail,
  };
}

/**
 * Resolve member row / assignee picker presentation.
 * Assignment identity remains ProjectMember.id / Firebase UID.
 */
export function resolveMemberPresentation(input: {
  projectId: string;
  projectMemberId: string;
  members: ProjectMember[];
  context?: MemberPresentationContext;
}): { initial: string; label: string; roleLabel: string; userId: string } {
  const member = input.members.find(
    (item) => item.id === input.projectMemberId,
  );

  if (member) {
    const presentation = resolveUserPresentation(member.userId, input.context);
    const roleLabel = formatProjectMemberRoleLabel(member.role);
    const label = formatMemberDisplayLabel({
      displayName: presentation.displayName,
      email: presentation.email,
      role: member.role,
      userId: member.userId,
    });

    return {
      initial: memberDisplayInitial(label),
      label,
      roleLabel,
      userId: member.userId,
    };
  }

  const fallbackUserId = extractUserIdFromProjectMemberId(
    input.projectId,
    input.projectMemberId,
  );
  const presentation = resolveUserPresentation(fallbackUserId, input.context);
  const label = formatMemberDisplayLabel({
    displayName: presentation.displayName,
    email: presentation.email,
    userId: fallbackUserId,
  });

  return {
    initial: memberDisplayInitial(label),
    label,
    roleLabel: "Member",
    userId: fallbackUserId,
  };
}

export function buildProfileByUserIdMap(
  profiles: readonly {
    uid: string;
    displayName: string;
    email: string;
  }[],
): Map<string, UserPresentationRecord> {
  const map = new Map<string, UserPresentationRecord>();

  for (const profile of profiles) {
    map.set(profile.uid, {
      displayName: profile.displayName.trim() || null,
      email: profile.email.trim() || null,
    });
  }

  return map;
}

export function collectUserIdsFromMembers(
  members: readonly ProjectMember[],
): string[] {
  return [...new Set(members.map((member) => member.userId.trim()).filter(Boolean))];
}

export function collectUserIdsFromProjectMemberIds(
  projectId: string,
  projectMemberIds: readonly string[],
): string[] {
  const ids = new Set<string>();

  for (const projectMemberId of projectMemberIds) {
    const prefix = `${projectId}_`;
    const userId = projectMemberId.startsWith(prefix)
      ? projectMemberId.slice(prefix.length)
      : projectMemberId;
    if (userId.trim()) {
      ids.add(userId.trim());
    }
  }

  return [...ids];
}
