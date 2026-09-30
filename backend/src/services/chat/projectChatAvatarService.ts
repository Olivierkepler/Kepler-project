import { ProjectAccessError } from "../../auth/projectAccess.js";
import type { Conversation } from "../../domain/conversation.js";
import { createProjectConversationId } from "../../domain/conversationId.js";
import {
  updateConversationAvatarStoragePath,
} from "../../repositories/conversationsRepository.js";
import {
  buildProjectChatAvatarObjectPath,
  createProjectChatAvatarObjectId,
  createProjectChatAvatarReadUrl,
  createProjectChatAvatarUploadUrl,
  deleteProjectChatAvatarObject,
  getProjectChatAvatarObjectMetadata,
  isAllowedProjectChatAvatarContentType,
  isProjectChatAvatarObjectId,
  isProjectChatAvatarObjectPathFor,
  PROJECT_CHAT_AVATAR_MAX_BYTES,
  type ProjectChatAvatarObjectMetadata,
  type SignedProjectChatAvatarUpload,
} from "../../storage/projectChatAvatarStorage.js";

export type ConversationPresentation = Omit<
  Conversation,
  "avatarStoragePath"
> & { avatarUrl?: string };

export class ProjectChatAvatarError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404,
  ) {
    super(message);
    this.name = "ProjectChatAvatarError";
  }
}

type ProjectChatAvatarDependencies = {
  createUploadUrl: typeof createProjectChatAvatarUploadUrl;
  getObjectMetadata: typeof getProjectChatAvatarObjectMetadata;
  createReadUrl: typeof createProjectChatAvatarReadUrl;
  deleteObject: typeof deleteProjectChatAvatarObject;
  updateStoragePath: typeof updateConversationAvatarStoragePath;
  createObjectId: typeof createProjectChatAvatarObjectId;
};

const defaultDependencies: ProjectChatAvatarDependencies = {
  createUploadUrl: createProjectChatAvatarUploadUrl,
  getObjectMetadata: getProjectChatAvatarObjectMetadata,
  createReadUrl: createProjectChatAvatarReadUrl,
  deleteObject: deleteProjectChatAvatarObject,
  updateStoragePath: updateConversationAvatarStoragePath,
  createObjectId: createProjectChatAvatarObjectId,
};

export function assertProjectChatAvatarOwner(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  conversationId: string;
  conversation: Conversation;
}): void {
  if (!input.uid.trim()) {
    throw new ProjectAccessError("Unauthorized", 401);
  }
  if (input.uid.trim() !== input.projectOwnerUid.trim()) {
    throw new ProjectAccessError("Project not found", 404);
  }

  const projectId = input.projectId.trim();
  if (
    !projectId ||
    input.conversation.type !== "project" ||
    input.conversation.projectId !== projectId ||
    input.conversation.id !== createProjectConversationId(projectId) ||
    input.conversationId.trim() !== input.conversation.id
  ) {
    throw new ProjectAccessError("Conversation not found", 404);
  }
}

export async function presentConversation(
  conversation: Conversation,
  createReadUrl: typeof createProjectChatAvatarReadUrl =
    createProjectChatAvatarReadUrl,
): Promise<ConversationPresentation> {
  const { avatarStoragePath, ...presentation } = conversation;
  if (conversation.type !== "project" || !avatarStoragePath?.trim()) {
    return presentation;
  }

  try {
    return {
      ...presentation,
      avatarUrl: await createReadUrl(avatarStoragePath),
    };
  } catch {
    return presentation;
  }
}

export async function requestProjectChatAvatarUpload(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  conversationId: string;
  conversation: Conversation;
  contentType: string;
}, dependencies = defaultDependencies): Promise<{
  uploadUrl: string;
  objectId: string;
  contentType: string;
  expiresAt: string;
}> {
  assertProjectChatAvatarOwner(input);
  const contentType = input.contentType.trim().toLowerCase();
  if (!isAllowedProjectChatAvatarContentType(contentType)) {
    throw new ProjectChatAvatarError("Unsupported image content type", 400);
  }

  const objectId = dependencies.createObjectId();
  const objectPath = buildProjectChatAvatarObjectPath({
    projectId: input.projectId,
    conversationId: input.conversationId,
    objectId,
    contentType,
  });
  const signed: SignedProjectChatAvatarUpload =
    await dependencies.createUploadUrl({ objectPath, contentType });

  // Return the opaque object ID needed for commit, never the private GCS path.
  return {
    uploadUrl: signed.uploadUrl,
    objectId,
    contentType,
    expiresAt: signed.expiresAt,
  };
}

export async function commitProjectChatAvatar(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  conversationId: string;
  conversation: Conversation;
  objectId: string;
  contentType: string;
}, dependencies = defaultDependencies): Promise<ConversationPresentation> {
  assertProjectChatAvatarOwner(input);
  const objectId = input.objectId.trim().toLowerCase();
  const contentType = input.contentType.trim().toLowerCase();

  if (
    !isProjectChatAvatarObjectId(objectId) ||
    !isAllowedProjectChatAvatarContentType(contentType)
  ) {
    throw new ProjectChatAvatarError("Invalid Project Chat avatar upload", 400);
  }

  const objectPath = buildProjectChatAvatarObjectPath({
    projectId: input.projectId,
    conversationId: input.conversationId,
    objectId,
    contentType,
  });
  if (
    !isProjectChatAvatarObjectPathFor({
      objectPath,
      projectId: input.projectId,
      conversationId: input.conversationId,
      objectId,
      contentType,
    })
  ) {
    throw new ProjectChatAvatarError("Invalid Project Chat avatar path", 400);
  }

  const metadata: ProjectChatAvatarObjectMetadata | null =
    await dependencies.getObjectMetadata(objectPath);
  if (!metadata) {
    throw new ProjectChatAvatarError("Avatar upload was not found", 400);
  }
  if (
    metadata.size <= 0 ||
    metadata.size > PROJECT_CHAT_AVATAR_MAX_BYTES ||
    metadata.contentType !== contentType
  ) {
    throw new ProjectChatAvatarError(
      "Avatar must be a supported image no larger than 5 MB",
      400,
    );
  }

  const updated = await dependencies.updateStoragePath({
    conversationId: input.conversationId,
    avatarStoragePath: objectPath,
  });
  if (!updated) {
    throw new ProjectAccessError("Conversation not found", 404);
  }

  if (
    updated.previousAvatarStoragePath &&
    updated.previousAvatarStoragePath !== objectPath
  ) {
    await dependencies
      .deleteObject(updated.previousAvatarStoragePath)
      .catch(() => undefined);
  }

  return presentConversation(updated.conversation, dependencies.createReadUrl);
}

export async function deleteProjectChatAvatar(input: {
  uid: string;
  projectOwnerUid: string;
  projectId: string;
  conversationId: string;
  conversation: Conversation;
}, dependencies = defaultDependencies): Promise<ConversationPresentation> {
  assertProjectChatAvatarOwner(input);
  const updated = await dependencies.updateStoragePath({
    conversationId: input.conversationId,
    avatarStoragePath: null,
  });
  if (!updated) {
    throw new ProjectAccessError("Conversation not found", 404);
  }

  if (updated.previousAvatarStoragePath) {
    await dependencies
      .deleteObject(updated.previousAvatarStoragePath)
      .catch(() => undefined);
  }

  return presentConversation(updated.conversation, dependencies.createReadUrl);
}
