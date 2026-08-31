/**
 * Phase Chat 1 — conversation authorization + uniqueness (service layer).
 *
 * Run: npx tsx src/scripts/phaseChat1AuthorizationTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import {
  createDirectConversationId,
  createProjectConversationId,
} from "../domain/conversationId.js";
import {
  ChatValidationError,
  ensureDirectConversation,
  ensureProjectConversation,
  listConversationMessages,
  sendConversationMessage,
} from "../services/chat/chatService.js";

const OWNER_UID = "phase-chat1-owner-uid";
const ROSE_UID = "phase-chat1-rose-uid";
const OUTSIDER_UID = "phase-chat1-outsider-uid";
const CAMBRIDGE_OWNER_UID = "phase-chat1-cambridge-owner-uid";
const LOCAL_BOSTON = "project-chat1-boston";
const LOCAL_CAMBRIDGE = "project-chat1-cambridge";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectDenied(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    throw new Error(`${label}: expected denial`);
  } catch (error) {
    assert(
      error instanceof ProjectAccessError || error instanceof ChatValidationError,
      `${label}: expected ProjectAccessError or ChatValidationError, got ${
        error instanceof Error ? error.name : typeof error
      }`,
    );
  }
}

async function seedProject(input: {
  localProjectId: string;
  ownerUid: string;
}): Promise<Project> {
  const id = createRemoteProjectId(input.ownerUid, input.localProjectId);
  const project: Project = {
    id,
    localProjectId: input.localProjectId,
    name: `Chat1 ${input.localProjectId}`,
    location: "Boston, MA",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: input.ownerUid,
  };
  await db.collection(COLLECTIONS.projects).doc(project.id).set(project);
  return project;
}

async function seedMember(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: "active" | "invited" | "removed";
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: input.status,
    invitedBy: OWNER_UID,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function cleanup(projectIds: string[]): Promise<void> {
  for (const projectId of projectIds) {
    const conversations = await db
      .collection(COLLECTIONS.conversations)
      .where("projectId", "==", projectId)
      .get();
    for (const doc of conversations.docs) {
      await doc.ref.delete();
    }

    const participants = await db
      .collection(COLLECTIONS.conversationParticipants)
      .where("projectId", "==", projectId)
      .get();
    for (const doc of participants.docs) {
      await doc.ref.delete();
    }

    const messages = await db
      .collection(COLLECTIONS.messages)
      .where("projectId", "==", projectId)
      .get();
    for (const doc of messages.docs) {
      await doc.ref.delete();
    }

    const members = await db
      .collection(COLLECTIONS.projectMembers)
      .where("projectId", "==", projectId)
      .get();
    for (const doc of members.docs) {
      await doc.ref.delete();
    }

    await db.collection(COLLECTIONS.projects).doc(projectId).delete();
  }
}

async function main(): Promise<void> {
  const boston = await seedProject({
    localProjectId: LOCAL_BOSTON,
    ownerUid: OWNER_UID,
  });
  const cambridge = await seedProject({
    localProjectId: LOCAL_CAMBRIDGE,
    ownerUid: CAMBRIDGE_OWNER_UID,
  });

  try {
    const ownerMemberId = await seedMember({
      projectId: boston.id,
      userId: OWNER_UID,
      role: "owner",
      status: "active",
    });
    const roseMemberId = await seedMember({
      projectId: boston.id,
      userId: ROSE_UID,
      role: "field_member",
      status: "active",
    });
    await seedMember({
      projectId: cambridge.id,
      userId: CAMBRIDGE_OWNER_UID,
      role: "owner",
      status: "active",
    });

    // A. Same Project Chat for owner + Rose
    const ownerProjectChat = await ensureProjectConversation({
      projectId: boston.id,
      uid: OWNER_UID,
    });
    const roseProjectChat = await ensureProjectConversation({
      projectId: boston.id,
      uid: ROSE_UID,
    });
    assert(
      ownerProjectChat.conversation.id === roseProjectChat.conversation.id,
      "owner and Rose must share one project chat",
    );
    assert(
      ownerProjectChat.conversation.id ===
        createProjectConversationId(boston.id),
      "project chat id must be deterministic",
    );

    const ownerMsg = await sendConversationMessage({
      projectId: boston.id,
      conversationId: ownerProjectChat.conversation.id,
      uid: OWNER_UID,
      text: "Please verify the GFI count.",
    });
    assert(
      ownerMsg.senderProjectMemberId === ownerMemberId,
      "sender must be owner ProjectMember id",
    );

    const rosePage = await listConversationMessages({
      projectId: boston.id,
      conversationId: ownerProjectChat.conversation.id,
      uid: ROSE_UID,
      limit: 50,
    });
    assert(
      rosePage.items.some((item) => item.id === ownerMsg.id),
      "Rose must see owner project message",
    );

    const roseReply = await sendConversationMessage({
      projectId: boston.id,
      conversationId: ownerProjectChat.conversation.id,
      uid: ROSE_UID,
      text: "I'm checking it now.",
    });
    assert(
      roseReply.senderProjectMemberId === roseMemberId,
      "sender must be Rose ProjectMember id",
    );

    // B. Direct chat uniqueness
    const ownerDirect = await ensureDirectConversation({
      projectId: boston.id,
      uid: OWNER_UID,
      otherProjectMemberId: roseMemberId,
    });
    const roseDirect = await ensureDirectConversation({
      projectId: boston.id,
      uid: ROSE_UID,
      otherProjectMemberId: ownerMemberId,
    });
    assert(
      ownerDirect.conversation.id === roseDirect.conversation.id,
      "direct chat must be order-independent",
    );
    assert(
      ownerDirect.conversation.id ===
        createDirectConversationId(boston.id, ownerMemberId, roseMemberId),
      "direct chat id must be deterministic",
    );

    // C. Non-member denied
    await expectDenied("outsider project chat", () =>
      ensureProjectConversation({ projectId: boston.id, uid: OUTSIDER_UID }),
    );
    await expectDenied("outsider send", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: ownerProjectChat.conversation.id,
        uid: OUTSIDER_UID,
        text: "hello",
      }),
    );

    // D. Cross-project denied
    await expectDenied("cambridge owner boston chat", () =>
      ensureProjectConversation({
        projectId: boston.id,
        uid: CAMBRIDGE_OWNER_UID,
      }),
    );

    // E. Removed member denied for new messages
    await seedMember({
      projectId: boston.id,
      userId: ROSE_UID,
      role: "field_member",
      status: "removed",
    });
    await expectDenied("removed Rose send", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: ownerProjectChat.conversation.id,
        uid: ROSE_UID,
        text: "still here?",
      }),
    );
    await expectDenied("removed Rose read", () =>
      listConversationMessages({
        projectId: boston.id,
        conversationId: ownerProjectChat.conversation.id,
        uid: ROSE_UID,
        limit: 10,
      }),
    );

    // Restore Rose for empty-message check path clarity
    await seedMember({
      projectId: boston.id,
      userId: ROSE_UID,
      role: "field_member",
      status: "active",
    });

    // G. Empty message rejected
    await expectDenied("empty message", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: ownerProjectChat.conversation.id,
        uid: OWNER_UID,
        text: "   ",
      }),
    );

    // F. Impersonation: client cannot supply sender — enforced by API shape;
    // service always uses access.membership.id (validated via send above).

    console.log("phaseChat1AuthorizationTest: PASS");
  } finally {
    await cleanup([boston.id, cambridge.id]);
  }
}

main().catch((error) => {
  console.error("phaseChat1AuthorizationTest failed:");
  console.error(error);
  process.exitCode = 1;
});
