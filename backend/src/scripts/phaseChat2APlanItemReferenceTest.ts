/**
 * Phase Chat 2A — Plan Item reference authorization.
 *
 * Run: npx tsx src/scripts/phaseChat2APlanItemReferenceTest.ts
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { ProjectAccessError } from "../auth/projectAccess.js";
import type { PlanItem } from "../domain/planItem.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import type { WorkPackage } from "../domain/workPackage.js";
import { createWorkPackageId } from "../domain/workPackageId.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";
import { createWorkPackageAssignmentId } from "../domain/workPackageAssignmentId.js";
import {
  ChatValidationError,
  ensureProjectConversation,
  listConversationMessages,
  sendConversationMessage,
} from "../services/chat/chatService.js";
import { resolveChatPlanItemPresentations } from "../services/chat/chatPlanItemReference.js";

const OWNER_UID = "phase-chat2a-owner-uid";
const KEPLER_UID = "phase-chat2a-kepler-uid";
const LOCAL_BOSTON = "project-chat2a-boston";
const LOCAL_CAMBRIDGE = "project-chat2a-cambridge";

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
      error instanceof ProjectAccessError ||
        error instanceof ChatValidationError,
      `${label}: expected access/validation error, got ${
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
    name: `Chat2A ${input.localProjectId}`,
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
  status?: "active" | "removed";
}): Promise<string> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();
  await db.collection(COLLECTIONS.projectMembers).doc(id).set({
    id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    status: input.status ?? "active",
    invitedBy: OWNER_UID,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function seedPlanItem(input: {
  projectId: string;
  localPlanItemId: string;
  label: string;
}): Promise<PlanItem> {
  const id = createRemotePlanItemId(input.projectId, input.localPlanItemId);
  const item: PlanItem = {
    id,
    localPlanItemId: input.localPlanItemId,
    projectId: input.projectId,
    type: "count",
    label: input.label,
    plannedValue: 12,
    unit: "ea",
    unitCost: 10,
    productionRatePerDay: 20,
    laborHoursPerUnit: 0.5,
  };
  await db.collection(COLLECTIONS.planItems).doc(item.id).set(item);
  return item;
}

async function seedAssignment(input: {
  projectId: string;
  workPackageId: string;
  projectMemberId: string;
  planItemIds: string[];
}): Promise<void> {
  const now = new Date().toISOString();
  const workPackage: WorkPackage = {
    id: input.workPackageId,
    projectId: input.projectId,
    name: "Electrical Rough-In",
    status: "ready",
    planItemIds: input.planItemIds,
    createdAt: now,
    updatedAt: now,
  };
  await db
    .collection(COLLECTIONS.workPackages)
    .doc(workPackage.id)
    .set(workPackage);

  const assignmentId = createWorkPackageAssignmentId();
  const assignment: WorkPackageAssignment = {
    id: assignmentId,
    projectId: input.projectId,
    workPackageId: input.workPackageId,
    projectMemberId: input.projectMemberId,
    status: "assigned",
    createdAt: now,
    updatedAt: now,
  };
  await db
    .collection(COLLECTIONS.workPackageAssignments)
    .doc(assignment.id)
    .set(assignment);
}

async function cleanup(projectIds: string[]): Promise<void> {
  for (const projectId of projectIds) {
    for (const collection of [
      COLLECTIONS.messages,
      COLLECTIONS.conversationParticipants,
      COLLECTIONS.conversations,
      COLLECTIONS.workPackageAssignments,
      COLLECTIONS.workPackages,
      COLLECTIONS.planItems,
      COLLECTIONS.projectMembers,
    ] as const) {
      const snapshot = await db
        .collection(collection)
        .where("projectId", "==", projectId)
        .get();
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }
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
    ownerUid: OWNER_UID,
  });

  try {
    await seedMember({
      projectId: boston.id,
      userId: OWNER_UID,
      role: "owner",
    });
    const keplerMemberId = await seedMember({
      projectId: boston.id,
      userId: KEPLER_UID,
      role: "field_member",
    });

    const gfi = await seedPlanItem({
      projectId: boston.id,
      localPlanItemId: "plan-gfi",
      label: "GFI Duplex Receptacle",
    });
    const wall = await seedPlanItem({
      projectId: boston.id,
      localPlanItemId: "plan-wall",
      label: "Conference room wall",
    });
    const cambridgeItem = await seedPlanItem({
      projectId: cambridge.id,
      localPlanItemId: "plan-cam",
      label: "Cambridge only",
    });

    const wpId = createWorkPackageId();
    await seedAssignment({
      projectId: boston.id,
      workPackageId: wpId,
      projectMemberId: keplerMemberId,
      planItemIds: [wall.id],
    });

    const projectChat = await ensureProjectConversation({
      projectId: boston.id,
      uid: OWNER_UID,
    });

    // A. Owner shares assigned (any) item into Project Chat
    const ownerShare = await sendConversationMessage({
      projectId: boston.id,
      conversationId: projectChat.conversation.id,
      uid: OWNER_UID,
      text: "Please verify this item.",
      reference: { type: "plan_item", planItemId: gfi.id },
    });
    assert(
      ownerShare.reference?.planItemId === gfi.id,
      "owner share stores remote plan item id",
    );

    // B. Cross-project rejected
    await expectDenied("cross-project plan item", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: projectChat.conversation.id,
        uid: OWNER_UID,
        text: "cross",
        reference: { type: "plan_item", planItemId: cambridgeItem.id },
      }),
    );

    // C. Field member authorized item
    const keplerShare = await sendConversationMessage({
      projectId: boston.id,
      conversationId: projectChat.conversation.id,
      uid: KEPLER_UID,
      text: "",
      reference: { type: "plan_item", planItemId: wall.id },
    });
    assert(
      keplerShare.reference?.planItemId === wall.id,
      "kepler can share assigned item",
    );

    // D. Field member unauthorized item
    await expectDenied("kepler unassigned GFI", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: projectChat.conversation.id,
        uid: KEPLER_UID,
        text: "nope",
        reference: { type: "plan_item", planItemId: gfi.id },
      }),
    );

    // E. Receiver unauthorized — message exists, presentation unavailable
    const presentations = await resolveChatPlanItemPresentations({
      projectId: boston.id,
      uid: KEPLER_UID,
      planItemIds: [gfi.id, wall.id],
    });
    assert(
      presentations[gfi.id]?.available === false,
      "kepler cannot see GFI card details",
    );
    assert(
      presentations[wall.id]?.available === true,
      "kepler can see assigned wall card",
    );
    assert(
      presentations[wall.id]?.label === "Conference room wall",
      "authorized card includes label",
    );

    const keplerPage = await listConversationMessages({
      projectId: boston.id,
      conversationId: projectChat.conversation.id,
      uid: KEPLER_UID,
      limit: 50,
    });
    assert(
      keplerPage.items.some((item) => item.id === ownerShare.id),
      "kepler still sees the chat message itself",
    );

    // F. Missing item → unavailable presentation
    const missing = await resolveChatPlanItemPresentations({
      projectId: boston.id,
      uid: OWNER_UID,
      planItemIds: [`${boston.id}_missing-plan`],
    });
    assert(
      missing[`${boston.id}_missing-plan`]?.available === false,
      "missing plan item is unavailable",
    );

    // G. Empty text without reference still rejected
    await expectDenied("empty message", () =>
      sendConversationMessage({
        projectId: boston.id,
        conversationId: projectChat.conversation.id,
        uid: OWNER_UID,
        text: "   ",
        reference: null,
      }),
    );

    console.log("phaseChat2APlanItemReferenceTest: PASS");
  } finally {
    await cleanup([boston.id, cambridge.id]);
  }
}

main().catch((error) => {
  console.error("phaseChat2APlanItemReferenceTest failed:");
  console.error(error);
  process.exitCode = 1;
});
