import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { Conversation } from "../../domain/conversation.js";
import type { ProjectMember } from "../../domain/projectMember.js";
import { getConversationById } from "../../repositories/conversationsRepository.js";
import {
  ensureOwnerProjectMember,
  getProjectMemberById,
  listProjectMembers,
} from "../../repositories/projectMembersRepository.js";
import { assertProjectReadableByUser } from "../collaboration/projectReadAccess.js";

export type ChatAccessContext = {
  projectId: string;
  currentUserId: string;
  membership: ProjectMember;
  isOwner: boolean;
};

/**
 * Chat requires active project membership (or legacy owner with ensured membership).
 * Does NOT use assigned_scope — chat ≠ Plan access.
 */
export async function assertChatProjectAccess(
  projectId: string,
  uid: string,
): Promise<ChatAccessContext> {
  const readAccess = await assertProjectReadableByUser(projectId, uid);

  let membership = readAccess.membership;

  if (!membership && readAccess.isOwner) {
    membership = await ensureOwnerProjectMember(readAccess.project);
  }

  if (!membership || membership.status !== "active") {
    throw new ProjectAccessError("Project not found", 404);
  }

  return {
    projectId: readAccess.project.id,
    currentUserId: uid,
    membership,
    isOwner: readAccess.isOwner,
  };
}

export async function assertConversationReadable(input: {
  projectId: string;
  conversationId: string;
  uid: string;
}): Promise<{
  access: ChatAccessContext;
  conversation: Conversation;
}> {
  const access = await assertChatProjectAccess(input.projectId, input.uid);
  const conversation = await getConversationById(input.conversationId);

  if (!conversation || conversation.projectId !== access.projectId) {
    throw new ProjectAccessError("Conversation not found", 404);
  }

  if (conversation.type === "project") {
    return { access, conversation };
  }

  if (
    !conversation.participantProjectMemberIds.includes(access.membership.id)
  ) {
    throw new ProjectAccessError("Conversation not found", 404);
  }

  return { access, conversation };
}

export async function requireActiveProjectMemberById(input: {
  projectId: string;
  projectMemberId: string;
}): Promise<ProjectMember> {
  const member = await getProjectMemberById(input.projectMemberId);

  if (
    !member ||
    member.projectId !== input.projectId ||
    member.status !== "active"
  ) {
    throw new ProjectAccessError("Project member not found", 404);
  }

  return member;
}

export async function listActiveProjectMembersForChat(
  projectId: string,
): Promise<ProjectMember[]> {
  const members = await listProjectMembers(projectId);
  return members.filter((item) => item.status === "active");
}
