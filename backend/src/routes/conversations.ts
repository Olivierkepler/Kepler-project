import { Router } from "express";

import {
  assertProjectOwnedByUser,
  ProjectAccessError,
} from "../auth/projectAccess.js";
import {
  getConversationById,
} from "../repositories/conversationsRepository.js";
import { getUserProfilesByUids } from "../repositories/userProfilesRepository.js";
import { buildChatParticipantPresentations } from "../services/chat/chatParticipantPresentation.js";
import {
  assertProjectChatAvatarOwner,
  commitProjectChatAvatar,
  deleteProjectChatAvatar,
  presentConversation,
  ProjectChatAvatarError,
  requestProjectChatAvatarUpload,
} from "../services/chat/projectChatAvatarService.js";
import {
  assertChatProjectAccess,
  assertConversationReadable,
  listActiveProjectMembersForChat,
} from "../services/chat/chatAccess.js";
import { resolveChatPlanItemPresentations } from "../services/chat/chatPlanItemReference.js";
import {
  ChatValidationError,
  ensureDirectConversation,
  ensureProjectConversation,
  getConversationMemberRoster,
  listConversationMessages,
  listVisibleConversationsForUser,
  markConversationRead,
  sendConversationMessage,
} from "../services/chat/chatService.js";
import {
  parseCreateChatMessageBody,
  parseCreateDirectConversationBody,
  parseProjectChatAvatarCommitBody,
  parseProjectChatAvatarUploadUrlBody,
} from "../validation/conversation.js";
import {
  handleRouteError,
  readBody,
  requireUserUid,
  sendError,
} from "../validation/http.js";

export const conversationsRouter = Router();

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

function parseLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return DEFAULT_MESSAGE_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MESSAGE_LIMIT;
  }
  return Math.min(parsed, MAX_MESSAGE_LIMIT);
}

async function handleChatRouteError(
  res: import("express").Response,
  error: unknown,
): Promise<void> {
  if (error instanceof ChatValidationError) {
    sendError(res, 400, error.message);
    return;
  }
  if (error instanceof ProjectChatAvatarError) {
    sendError(res, error.statusCode, error.message);
    return;
  }
  await handleRouteError(res, error);
}

async function getOwnerProjectConversation(input: {
  uid: string;
  projectId: string;
  conversationId: string;
}) {
  const project = await assertProjectOwnedByUser(input.projectId, input.uid);
  const conversation = await getConversationById(input.conversationId);

  if (!conversation) {
    throw new ProjectAccessError("Conversation not found", 404);
  }

  assertProjectChatAvatarOwner({
    uid: input.uid,
    projectOwnerUid: project.ownerUid,
    projectId: project.id,
    conversationId: input.conversationId,
    conversation,
  });

  return { project, conversation };
}

conversationsRouter.get(
  "/projects/:projectId/conversations/messageable-members",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      const access = await assertChatProjectAccess(projectId, uid);
      const members = await listActiveProjectMembersForChat(access.projectId);
      const others = members.filter(
        (member) => member.id !== access.membership.id,
      );
      const profiles = await getUserProfilesByUids(
        others.map((member) => member.userId),
      );

      res.status(200).json(
        await buildChatParticipantPresentations({
          members: others,
          profiles,
        }),
      );
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.get(
  "/projects/:projectId/conversations",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      const conversations = await listVisibleConversationsForUser({
        projectId,
        uid,
      });
      res.status(200).json(
        await Promise.all(
          conversations.map((conversation) => presentConversation(conversation)),
        ),
      );
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/project",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }

      const result = await ensureProjectConversation({ projectId, uid });
      res
        .status(result.created ? 201 : 200)
        .json(await presentConversation(result.conversation));
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/direct",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const parsed = parseCreateDirectConversationBody(readBody(req));

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId) {
        sendError(res, 400, "projectId is required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "otherProjectMemberId is required");
        return;
      }

      const result = await ensureDirectConversation({
        projectId,
        uid,
        otherProjectMemberId: parsed.otherProjectMemberId,
      });
      res
        .status(result.created ? 201 : 200)
        .json(await presentConversation(result.conversation));
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.get(
  "/projects/:projectId/conversations/:conversationId/messages",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }

      const limit = parseLimit(req.query.limit);
      const cursor =
        typeof req.query.cursor === "string" && req.query.cursor.trim()
          ? req.query.cursor.trim()
          : null;

      const page = await listConversationMessages({
        projectId,
        conversationId,
        uid,
        limit,
        cursor,
      });

      const { conversation } = await assertConversationReadable({
        projectId,
        conversationId,
        uid,
      });

      const members = await getConversationMemberRoster({
        projectId: page.access.projectId,
        conversation,
      });

      const profiles = await getUserProfilesByUids(
        members.map((member) => member.userId),
      );

      const participants = await buildChatParticipantPresentations({
        members,
        profiles,
      });

      const planItemIds = page.items
        .map((item) =>
          item.reference?.type === "plan_item"
            ? item.reference.planItemId
            : null,
        )
        .filter((id): id is string => typeof id === "string");

      const referencePresentations = await resolveChatPlanItemPresentations({
        projectId: page.access.projectId,
        uid,
        planItemIds,
      });

      res.status(200).json({
        items: page.items,
        nextCursor: page.nextCursor,
        conversation: await presentConversation(conversation),
        currentProjectMemberId: page.access.membership.id,
        participants,
        referencePresentations,
      });
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/:conversationId/avatar/upload-url",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;
      const parsed = parseProjectChatAvatarUploadUrlBody(readBody(req));

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "Invalid Project Chat avatar upload request");
        return;
      }

      const { project, conversation } = await getOwnerProjectConversation({
        uid,
        projectId,
        conversationId,
      });
      const signed = await requestProjectChatAvatarUpload({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId: project.id,
        conversationId,
        conversation,
        contentType: parsed.contentType,
      });
      res.status(200).json(signed);
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/:conversationId/avatar/commit",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;
      const parsed = parseProjectChatAvatarCommitBody(readBody(req));

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "Invalid Project Chat avatar commit request");
        return;
      }

      const { project, conversation } = await getOwnerProjectConversation({
        uid,
        projectId,
        conversationId,
      });
      const presented = await commitProjectChatAvatar({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId: project.id,
        conversationId,
        conversation,
        objectId: parsed.objectId,
        contentType: parsed.contentType,
      });
      res.status(200).json(presented);
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.delete(
  "/projects/:projectId/conversations/:conversationId/avatar",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }

      const { project, conversation } = await getOwnerProjectConversation({
        uid,
        projectId,
        conversationId,
      });
      const presented = await deleteProjectChatAvatar({
        uid,
        projectOwnerUid: project.ownerUid,
        projectId: project.id,
        conversationId,
        conversation,
      });
      res.status(200).json(presented);
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/:conversationId/messages",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;
      const parsed = parseCreateChatMessageBody(readBody(req));

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }
      if (!parsed) {
        sendError(res, 400, "text or a valid Plan Item reference is required");
        return;
      }

      const message = await sendConversationMessage({
        projectId,
        conversationId,
        uid,
        text: parsed.text,
        reference: parsed.reference,
      });
      res.status(201).json(message);
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);

conversationsRouter.post(
  "/projects/:projectId/conversations/:conversationId/read",
  async (req, res) => {
    try {
      const uid = requireUserUid(req);
      const projectId = req.params.projectId;
      const conversationId = req.params.conversationId;

      if (!uid) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      if (!projectId || !conversationId) {
        sendError(res, 400, "projectId and conversationId are required");
        return;
      }

      await markConversationRead({ projectId, conversationId, uid });
      res.status(200).json({ ok: true });
    } catch (error) {
      await handleChatRouteError(res, error);
    }
  },
);
