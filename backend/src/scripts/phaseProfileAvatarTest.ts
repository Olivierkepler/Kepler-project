import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { getEvidenceBucketName } from "../storage/evidenceStorage.js";
import {
  parseUserAvatarCommitBody,
  parseUserAvatarUploadUrlBody,
} from "../validation/userProfileAvatar.js";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0 || value === "...") {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function idTokenForEmail(
  email: string,
  password: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Email/password sign-in failed (${response.status})`);
  }

  const payload = (await response.json()) as { idToken?: string };

  if (!payload.idToken) {
    throw new Error("Email/password sign-in returned no idToken");
  }

  return payload.idToken;
}

function uidFromIdToken(idToken: string): string {
  const parts = idToken.split(".");

  if (parts.length < 2) {
    throw new Error("Invalid idToken shape");
  }

  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload = JSON.parse(json) as { user_id?: string; sub?: string };
  const uid = payload.user_id ?? payload.sub;

  if (!uid || uid.trim().length === 0) {
    throw new Error("idToken missing uid");
  }

  return uid;
}

async function requestJson(
  baseUrl: string,
  idToken: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { status: response.status, payload };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runValidationChecks(): void {
  assert(
    parseUserAvatarUploadUrlBody({ contentType: "image/jpeg" })?.contentType ===
      "image/jpeg",
    "valid upload body should parse",
  );
  assert(
    parseUserAvatarUploadUrlBody({ contentType: "application/pdf" }) ===
      undefined,
    "invalid upload content type should be rejected",
  );
  assert(
    parseUserAvatarCommitBody({
      objectPath: "users/abc/profile/avatar.jpg",
      contentType: "image/jpeg",
    }) !== undefined,
    "valid commit body should parse",
  );
  assert(
    parseUserAvatarCommitBody({
      objectPath: "users/abc/profile/avatar.exe",
      contentType: "application/octet-stream",
    }) === undefined,
    "invalid commit body should be rejected",
  );
}

async function main(): Promise<void> {
  runValidationChecks();

  const baseUrl = requireEnv("API_BASE_URL");
  const apiKey = requireEnv("FIREBASE_WEB_API_KEY");
  const ownerEmail = requireEnv("TEST_OWNER_EMAIL");
  const ownerPassword = requireEnv("TEST_OWNER_PASSWORD");
  const memberEmail = requireEnv("TEST_MEMBER_EMAIL");
  const memberPassword = requireEnv("TEST_MEMBER_PASSWORD");

  const ownerToken = await idTokenForEmail(ownerEmail, ownerPassword, apiKey);
  const memberToken = await idTokenForEmail(memberEmail, memberPassword, apiKey);
  const ownerUid = uidFromIdToken(ownerToken);
  const memberUid = uidFromIdToken(memberToken);

  const tinyJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
    "base64",
  );

  let objectPath: string | null = null;

  try {
    const invalidUpload = await requestJson(
      baseUrl,
      ownerToken,
      "POST",
      "/api/me/profile/avatar/upload-url",
      { contentType: "application/pdf" },
    );
    assert(invalidUpload.status === 400, "invalid content type should return 400");

    const upload = await requestJson(
      baseUrl,
      ownerToken,
      "POST",
      "/api/me/profile/avatar/upload-url",
      { contentType: "image/jpeg" },
    );
    assert(upload.status === 200, "upload-url should succeed");

    const uploadPayload = upload.payload as {
      uploadUrl?: string;
      objectPath?: string;
    };
    assert(
      typeof uploadPayload.uploadUrl === "string" &&
        typeof uploadPayload.objectPath === "string",
      "upload-url payload should include uploadUrl and objectPath",
    );
    const uploadUrl = uploadPayload.uploadUrl;
    const committedObjectPath = uploadPayload.objectPath;

    if (!uploadUrl || !committedObjectPath) {
      throw new Error("upload-url payload missing required fields");
    }

    objectPath = committedObjectPath;

    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
      },
      body: tinyJpeg,
    });
    assert(putResponse.ok, "signed PUT should succeed");

    const wrongPathCommit = await requestJson(
      baseUrl,
      ownerToken,
      "PUT",
      "/api/me/profile/avatar",
      {
        objectPath: `users/${memberUid}/profile/avatar.jpg`,
        contentType: "image/jpeg",
      },
    );
    assert(wrongPathCommit.status === 400, "foreign avatar path should be rejected");

    const commit = await requestJson(baseUrl, ownerToken, "PUT", "/api/me/profile/avatar", {
      objectPath: committedObjectPath,
      contentType: "image/jpeg",
    });
    assert(commit.status === 200, "avatar commit should succeed");

    const commitPayload = commit.payload as {
      avatarUrl?: string | null;
      avatarStoragePath?: unknown;
    };
    assert(
      typeof commitPayload.avatarUrl === "string" &&
        commitPayload.avatarUrl.length > 0,
      "committed profile should include avatarUrl",
    );
    assert(
      commitPayload.avatarStoragePath === undefined,
      "avatarStoragePath should not be exposed in API response",
    );

    const profile = await requestJson(baseUrl, ownerToken, "GET", "/api/me/profile");
    assert(profile.status === 200, "GET /me/profile should succeed");

    const batch = await requestJson(
      baseUrl,
      memberToken,
      "GET",
      `/api/user-profiles?uids=${encodeURIComponent(ownerUid)}`,
    );
    assert(batch.status === 200, "batch profile read should succeed");
    const batchPayload = batch.payload as Array<{ avatarUrl?: string | null }>;
    assert(
      Array.isArray(batchPayload) &&
        typeof batchPayload[0]?.avatarUrl === "string",
      "batch profile should include avatarUrl",
    );

    const removed = await requestJson(
      baseUrl,
      ownerToken,
      "DELETE",
      "/api/me/profile/avatar",
    );
    assert(removed.status === 200, "avatar delete should succeed");
    const removedPayload = removed.payload as { avatarUrl?: string | null };
    assert(
      removedPayload.avatarUrl === null,
      "removed avatar should return null avatarUrl",
    );

    console.log("phaseProfileAvatarTest: PASS");
  } finally {
    await requestJson(baseUrl, ownerToken, "DELETE", "/api/me/profile/avatar").catch(
      () => undefined,
    );

    if (objectPath) {
      const { getStorage } = await import("firebase-admin/storage");
      await getStorage()
        .bucket(getEvidenceBucketName())
        .file(objectPath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
    }

    await db
      .collection(COLLECTIONS.userProfiles)
      .doc(ownerUid)
      .set(
        {
          avatarStoragePath: null,
        },
        { merge: true },
      )
      .catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error("phaseProfileAvatarTest: FAIL");
  console.error(error);
  process.exit(1);
});
