/**
 * Phase 52 authenticated Evidence delete tests.
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteEvidenceId } from "../domain/evidenceId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { getEvidenceBucketName } from "../storage/evidenceStorage.js";
import { getStorage } from "firebase-admin/storage";

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

  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
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

  const localProjectId = "phase52-evidence-project";
  const localNoteId = "evidence-note-52";
  const localPhotoId = "evidence-photo-52";
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
    name: "Phase 52 Evidence Project",
    location: "Test Site",
    status: "active",
    progress: 1,
    openDeltas: 0,
    assignedTasks: 0,
  });

  await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "Phase 52 note",
      createdAt: "2026-08-21T19:00:00.000Z",
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
      note: "Phase 52 photo",
      createdAt: "2026-08-21T19:05:00.000Z",
      objectPath: uploadPayload.objectPath,
      contentType: "image/jpeg",
    },
  );

  const unauth = await requestJson(
    baseUrl,
    null,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteNoteId)}`,
  );
  assertStatus("delete unauth", unauth.status, 401);

  const foreign = await requestJson(
    baseUrl,
    tokenB,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteNoteId)}`,
  );
  assertStatus("delete foreign", foreign.status, 404);

  const mismatch = await requestJson(
    baseUrl,
    tokenA,
    "DELETE",
    `/api/projects/${encodeURIComponent("wrong-project")}/evidence/${encodeURIComponent(remoteNoteId)}`,
  );
  assertStatus("delete project mismatch", mismatch.status, 404);

  const deleteNote = await requestJson(
    baseUrl,
    tokenA,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteNoteId)}`,
  );
  assertStatus("delete owner note", deleteNote.status, 204);

  const deleteNoteRepeat = await requestJson(
    baseUrl,
    tokenA,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remoteNoteId)}`,
  );
  assertStatus("delete note repeat", deleteNoteRepeat.status, 204);

  const deletePhoto = await requestJson(
    baseUrl,
    tokenA,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remotePhotoId)}`,
  );
  assertStatus("delete owner photo", deletePhoto.status, 204);

  const deletePhotoRepeat = await requestJson(
    baseUrl,
    tokenA,
    "DELETE",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/${encodeURIComponent(remotePhotoId)}`,
  );
  assertStatus("delete photo repeat", deletePhotoRepeat.status, 204);

  const [exists] = await getStorage()
    .bucket(getEvidenceBucketName())
    .file(uploadPayload.objectPath)
    .exists();

  if (exists) {
    throw new Error("Photo object still exists after delete");
  }
  console.log("PASS storage object deleted");

  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();
  console.log("Phase 52 evidence delete tests passed.");
}

main().catch((error: unknown) => {
  console.error("phase52EvidenceDeleteTest failed:");
  console.error(error);
  process.exitCode = 1;
});
