/**
 * Project Chat avatar service contract tests (in-memory storage/repository).
 * Run: npx tsx src/scripts/projectChatAvatarServiceTest.ts
 */

import type { Conversation } from "../domain/conversation.js";
import {
  createDirectConversationId,
  createProjectConversationId,
} from "../domain/conversationId.js";
import {
  commitProjectChatAvatar,
  deleteProjectChatAvatar,
  presentConversation,
  ProjectChatAvatarError,
  requestProjectChatAvatarUpload,
} from "../services/chat/projectChatAvatarService.js";
import {
  buildProjectChatAvatarObjectPath,
  PROJECT_CHAT_AVATAR_MAX_BYTES,
} from "../storage/projectChatAvatarStorage.js";
import {
  parseProjectChatAvatarCommitBody,
  parseProjectChatAvatarUploadUrlBody,
} from "../validation/conversation.js";

const PROJECT_ID = "owner_project-chat-avatar-test";
const OWNER_UID = "project-chat-avatar-owner";
const MEMBER_UID = "project-chat-avatar-field-member";
const OBJECT_ID = "4a21ec72-c855-4d13-b0ca-2e43d38c6b43";
const CONTENT_TYPE = "image/jpeg";
const CONVERSATION_ID = createProjectConversationId(PROJECT_ID);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejected(
  label: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label}: expected rejection`);
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: CONVERSATION_ID,
    projectId: PROJECT_ID,
    type: "project",
    participantProjectMemberIds: [],
    createdByProjectMemberId: `${PROJECT_ID}_${OWNER_UID}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: null,
    lastMessagePreview: null,
    avatarStoragePath: null,
    ...overrides,
  };
}

function ownerInput(overrides: Record<string, unknown> = {}) {
  return {
    uid: OWNER_UID,
    projectOwnerUid: OWNER_UID,
    projectId: PROJECT_ID,
    conversationId: CONVERSATION_ID,
    conversation: conversation(),
    ...overrides,
  };
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const calls: {
    uploadedPath?: string;
    committedPath?: string | null;
    deletedPaths: string[];
    metadata?: { size: number; contentType: string | null } | null;
  } = { deletedPaths: [], metadata: { size: 1024, contentType: CONTENT_TYPE } };

  const dependencies = {
    createObjectId: () => OBJECT_ID,
    createUploadUrl: async (input: { objectPath: string; contentType: string }) => {
      calls.uploadedPath = input.objectPath;
      return {
        uploadUrl: "https://uploads.example/signed-put",
        expiresAt: "2026-01-01T00:15:00.000Z",
      };
    },
    getObjectMetadata: async () => calls.metadata ?? null,
    createReadUrl: async (_objectPath: string) =>
      "https://storage.example/signed-read",
    updateStoragePath: async (input: {
      conversationId: string;
      avatarStoragePath: string | null;
    }) => {
      calls.committedPath = input.avatarStoragePath;
      return {
        conversation: conversation({
          avatarStoragePath: input.avatarStoragePath,
        }),
        previousAvatarStoragePath: null,
      };
    },
    deleteObject: async (objectPath: string) => {
      calls.deletedPaths.push(objectPath);
    },
    ...overrides,
  };

  return { calls, dependencies };
}

async function main(): Promise<void> {
  const validUpload = parseProjectChatAvatarUploadUrlBody({
    contentType: CONTENT_TYPE,
  });
  assert(validUpload?.contentType === CONTENT_TYPE, "accept supported image MIME");
  assert(
    parseProjectChatAvatarUploadUrlBody({ contentType: "text/plain" }) ===
      undefined,
    "reject unsupported upload MIME",
  );
  assert(
    parseProjectChatAvatarCommitBody({
      objectId: "not-an-object-id",
      contentType: CONTENT_TYPE,
    }) === undefined,
    "reject invalid committed object id",
  );

  // Owner receives a short-lived signed URL and opaque object ID, not a path.
  const uploadMock = makeDependencies();
  const upload = await requestProjectChatAvatarUpload(
    { ...ownerInput(), contentType: CONTENT_TYPE },
    uploadMock.dependencies,
  );
  assert(upload.uploadUrl.startsWith("https://"), "owner can request upload URL");
  assert(upload.objectId === OBJECT_ID, "upload response includes commit object id");
  assert(!("objectPath" in upload), "upload response omits private object path");
  assert(
    uploadMock.calls.uploadedPath ===
      `projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/avatar/${OBJECT_ID}.jpg`,
    "storage path is scoped to project and conversation",
  );

  await expectRejected("active field member cannot upload", () =>
    requestProjectChatAvatarUpload(
      {
        ...ownerInput({ uid: MEMBER_UID }),
        contentType: CONTENT_TYPE,
      },
      makeDependencies().dependencies,
    ),
  );
  await expectRejected("unrelated user cannot upload", () =>
    requestProjectChatAvatarUpload(
      {
        ...ownerInput({ uid: "unrelated-user" }),
        contentType: CONTENT_TYPE,
      },
      makeDependencies().dependencies,
    ),
  );

  const directConversation: Conversation = {
    ...conversation(),
    id: createDirectConversationId(PROJECT_ID, "member-a", "member-b"),
    type: "direct",
    participantProjectMemberIds: ["member-a", "member-b"],
  };
  await expectRejected("direct conversation cannot use avatar upload", () =>
    requestProjectChatAvatarUpload(
      {
        ...ownerInput({
          conversationId: directConversation.id,
          conversation: directConversation,
        }),
        contentType: CONTENT_TYPE,
      },
      makeDependencies().dependencies,
    ),
  );

  await expectRejected("service rejects unsupported MIME", () =>
    requestProjectChatAvatarUpload(
      { ...ownerInput(), contentType: "text/plain" },
      makeDependencies().dependencies,
    ),
  );

  const oversizedMock = makeDependencies();
  oversizedMock.calls.metadata = {
    size: PROJECT_CHAT_AVATAR_MAX_BYTES + 1,
    contentType: CONTENT_TYPE,
  };
  await expectRejected("reject oversized committed object", () =>
    commitProjectChatAvatar(
      { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
      oversizedMock.dependencies,
    ),
  );
  assert(
    oversizedMock.calls.committedPath === undefined,
    "oversized object is not committed",
  );

  const badMetadataMock = makeDependencies();
  badMetadataMock.calls.metadata = { size: 1024, contentType: "image/png" };
  await expectRejected("reject mismatched committed MIME metadata", () =>
    commitProjectChatAvatar(
      { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
      badMetadataMock.dependencies,
    ),
  );

  const missingMock = makeDependencies();
  missingMock.calls.metadata = null;
  await expectRejected("reject missing committed object", () =>
    commitProjectChatAvatar(
      { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
      missingMock.dependencies,
    ),
  );

  const commitMock = makeDependencies();
  const committed = await commitProjectChatAvatar(
    { ...ownerInput(), objectId: OBJECT_ID, contentType: CONTENT_TYPE },
    commitMock.dependencies,
  );
  assert(
    commitMock.calls.committedPath ===
      buildProjectChatAvatarObjectPath({
        projectId: PROJECT_ID,
        conversationId: CONVERSATION_ID,
        objectId: OBJECT_ID,
        contentType: CONTENT_TYPE,
      }),
    "successful commit persists the scoped private path",
  );
  assert(
    committed.avatarUrl === "https://storage.example/signed-read",
    "conversation presentation returns signed avatar URL",
  );
  assert(
    !("avatarStoragePath" in committed),
    "conversation presentation never exposes storage path",
  );

  const missingPresentation = await presentConversation(
    conversation(),
    async () => "should-not-be-used",
  );
  assert(
    !("avatarUrl" in missingPresentation),
    "conversation without avatar keeps fallback presentation",
  );
  const missingObjectPresentation = await presentConversation(
    conversation({ avatarStoragePath: "projects/missing/avatar.jpg" }),
    async () => {
      throw new Error("avatar object missing");
    },
  );
  assert(
    !("avatarUrl" in missingObjectPresentation),
    "missing avatar object omits URL for icon fallback",
  );

  const deleteMock = makeDependencies({
    updateStoragePath: async (input: {
      conversationId: string;
      avatarStoragePath: string | null;
    }) => ({
      conversation: conversation({
        avatarStoragePath: input.avatarStoragePath,
      }),
      previousAvatarStoragePath: "projects/old/path/avatar.jpg",
    }),
  });
  const deleted = await deleteProjectChatAvatar(
    ownerInput({
      conversation: conversation({
        avatarStoragePath: "projects/old/path/avatar.jpg",
      }),
    }),
    deleteMock.dependencies,
  );
  assert(deleteMock.calls.deletedPaths[0] === "projects/old/path/avatar.jpg", "delete removes old object");
  assert(!("avatarUrl" in deleted), "delete/reset restores fallback presentation");

  console.log("project chat avatar service tests: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
