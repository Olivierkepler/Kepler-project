/**
 * Phase 51 authenticated Evidence list + signed-read tests.
 * Requires env credentials (same as Phase 50).
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteEvidenceId } from "../domain/evidenceId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { getEvidenceBucketName } from "../storage/evidenceStorage.js";

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
      headers: { "Content-Type": "application/json" },
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

function assertStatus(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label} → ${actual}`);
}

async function main(): Promise<void> {
  const EMAIL_A = requireEnv("BUILDSIGMA_TEST_EMAIL_A");
  const PASSWORD_A = requireEnv("BUILDSIGMA_TEST_PASSWORD_A");
  const EMAIL_B = requireEnv("BUILDSIGMA_TEST_EMAIL_B");
  const PASSWORD_B = requireEnv("BUILDSIGMA_TEST_PASSWORD_B");
  const apiKey = requireEnv("FIREBASE_WEB_API_KEY");
  const baseUrl =
    process.env.BUILDSIGMA_API_URL ??
    "https://buildsigma-api-543603860885.us-east1.run.app";

  const tokenA = await idTokenForEmail(EMAIL_A, PASSWORD_A, apiKey);
  const tokenB = await idTokenForEmail(EMAIL_B, PASSWORD_B, apiKey);
  const uidA = uidFromIdToken(tokenA);

  const localProjectId = "phase51-evidence-project";
  const localNoteId = "evidence-note-51";
  const localPhotoId = "evidence-photo-51";
  const remoteProjectId = createRemoteProjectId(uidA, localProjectId);
  const remoteNoteId = createRemoteEvidenceId(remoteProjectId, localNoteId);
  const remotePhotoId = createRemoteEvidenceId(remoteProjectId, localPhotoId);

  await db.collection(COLLECTIONS.evidence).doc(remoteNoteId).delete();
  await db.collection(COLLECTIONS.evidence).doc(remotePhotoId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const health = await fetch(`${baseUrl}/health`);
  assertStatus("GET /health", health.status, 200);

  await requestJson(baseUrl, tokenA, "POST", "/api/projects/bootstrap", {
    localProjectId,
    name: "Phase 51 Evidence Project",
    location: "Test Site",
    status: "active",
    progress: 1,
    openDeltas: 0,
    assignedTasks: 0,
  });

  const emptyList = await requestJson(
    baseUrl,
    tokenA,
    "GET",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
  );
  assertStatus("list empty", emptyList.status, 200);

  if (!Array.isArray(emptyList.payload) || emptyList.payload.length !== 0) {
    throw new Error("Expected empty evidence list");
  }
  console.log("PASS list empty payload → []");

  const unauthList = await requestJson(
    baseUrl,
    null,
    "GET",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
  );
  assertStatus("list unauth", unauthList.status, 401);

  const foreignList = await requestJson(
    baseUrl,
    tokenB,
    "GET",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
  );
  assertStatus("list foreign", foreignList.status, 404);

  await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "Phase 51 note",
      createdAt: "2026-08-21T18:00:00.000Z",
    },
  );

  const uploadUrl = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/upload-url`,
    {
      localEvidenceId: localPhotoId,
      contentType: "image/jpeg",
    },
  );

  const uploadPayload = uploadUrl.payload as {
    uploadUrl?: string;
    objectPath?: string;
  };

  if (
    typeof uploadPayload.uploadUrl !== "string" ||
    typeof uploadPayload.objectPath !== "string"
  ) {
    throw new Error("upload-url payload missing fields");
  }

  const put = await fetch(uploadPayload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  if (put.status < 200 || put.status >= 300) {
    throw new Error(`signed PUT failed (${put.status})`);
  }

  await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localPhotoId,
      type: "photo",
      note: "Phase 51 photo",
      createdAt: "2026-08-21T18:05:00.000Z",
      objectPath: uploadPayload.objectPath,
      contentType: "image/jpeg",
    },
  );

  const ownerList = await requestJson(
    baseUrl,
    tokenA,
    "GET",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
  );
  assertStatus("list owner", ownerList.status, 200);

  if (!Array.isArray(ownerList.payload) || ownerList.payload.length !== 2) {
    throw new Error("Expected 2 evidence items");
  }
  console.log("PASS list owner count → 2");

  const noteRead = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteNoteId)}/read-url`,
    {},
  );
  assertStatus("read-url note", noteRead.status, 400);

  const missingRead = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent("missing-id")}/read-url`,
    {},
  );
  assertStatus("read-url missing", missingRead.status, 404);

  const foreignRead = await requestJson(
    baseUrl,
    tokenB,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remotePhotoId)}/read-url`,
    {},
  );
  assertStatus("read-url foreign", foreignRead.status, 404);

  const photoRead = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remotePhotoId)}/read-url`,
    {},
  );
  assertStatus("read-url owner photo", photoRead.status, 200);

  const readPayload = photoRead.payload as {
    readUrl?: string;
    objectPath?: string;
  };

  if (typeof readPayload.readUrl !== "string") {
    throw new Error("read-url payload missing readUrl");
  }

  const getObject = await fetch(readPayload.readUrl);

  if (getObject.status < 200 || getObject.status >= 300) {
    throw new Error(`signed GET failed (${getObject.status})`);
  }
  console.log(`PASS signed GET → ${getObject.status}`);

  const publicUrl = `https://storage.googleapis.com/${getEvidenceBucketName()}/${uploadPayload.objectPath}`;
  const anon = await fetch(publicUrl);

  if (anon.status === 200) {
    throw new Error("Evidence object unexpectedly public");
  }
  console.log(`PASS object not public → ${anon.status}`);

  await db.collection(COLLECTIONS.evidence).doc(remoteNoteId).delete();
  await db.collection(COLLECTIONS.evidence).doc(remotePhotoId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  console.log("Phase 51 evidence restore API tests passed.");
}

main().catch((error: unknown) => {
  console.error("phase51EvidenceRestoreTest failed:");
  console.error(error);
  process.exitCode = 1;
});
