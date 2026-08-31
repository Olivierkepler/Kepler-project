/**
 * Deterministic conversation document ids (Phase Chat 1).
 */

export function createProjectConversationId(projectId: string): string {
  const trimmed = projectId.trim();
  if (!trimmed) {
    throw new Error("projectId is required");
  }
  if (trimmed.includes("/")) {
    throw new Error("projectId must not contain '/'");
  }
  return `pch_${trimmed}`;
}

/**
 * Direct conversation id from two ProjectMember ids (order-independent).
 */
export function createDirectConversationId(
  projectId: string,
  projectMemberIdA: string,
  projectMemberIdB: string,
): string {
  const project = projectId.trim();
  const a = projectMemberIdA.trim();
  const b = projectMemberIdB.trim();

  if (!project || !a || !b) {
    throw new Error("projectId and both projectMemberIds are required");
  }

  if (a === b) {
    throw new Error("Direct conversation requires two distinct members");
  }

  const [first, second] = [a, b].sort((x, y) => x.localeCompare(y));
  return `dch_${project}_${first}_${second}`;
}

export function createConversationParticipantId(
  conversationId: string,
  projectMemberId: string,
): string {
  const conversation = conversationId.trim();
  const member = projectMemberId.trim();

  if (!conversation || !member) {
    throw new Error("conversationId and projectMemberId are required");
  }

  return `${conversation}_${member}`;
}
