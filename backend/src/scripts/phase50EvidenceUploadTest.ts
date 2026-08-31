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
    "https://buildsigma-api-mjze4f27ya-ue.a.run.app";

  const tokenA = await idTokenForEmail(EMAIL_A, PASSWORD_A, apiKey);
  const tokenB = await idTokenForEmail(EMAIL_B, PASSWORD_B, apiKey);
  const uidA = uidFromIdToken(tokenA);

  const localProjectId = "phase50-evidence-project";
  const localNoteId = "evidence-note-001";
  const localPhotoId = "evidence-photo-001";
  const remoteProjectId = createRemoteProjectId(uidA, localProjectId);
  const remoteNoteId = createRemoteEvidenceId(remoteProjectId, localNoteId);
  const remotePhotoId = createRemoteEvidenceId(remoteProjectId, localPhotoId);

  await db.collection(COLLECTIONS.evidence).doc(remoteNoteId).delete();
  await db.collection(COLLECTIONS.evidence).doc(remotePhotoId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const health = await fetch(`${baseUrl}/health`);
  assertStatus("GET /health", health.status, 200);

  const bootstrap = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    "/api/projects/bootstrap",
    {
      localProjectId,
      name: "Phase 50 Evidence Project",
      location: "Test Site",
      status: "active",
      progress: 1,
      openDeltas: 0,
      assignedTasks: 0,
    },
  );
  assertStatus("bootstrap project", bootstrap.status, 201);

  const unauth = await requestJson(
    baseUrl,
    null,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "Nope",
      createdAt: new Date().toISOString(),
    },
  );
  assertStatus("note unauthenticated", unauth.status, 401);

  const invalid = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "   ",
      createdAt: new Date().toISOString(),
    },
  );
  assertStatus("invalid note", invalid.status, 400);

  const noteCreate = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "East corridor observation",
      createdAt: "2026-08-21T17:00:00.000Z",
    },
  );
  assertStatus("note owner create", noteCreate.status, 201);

  const noteRepeat = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localNoteId,
      type: "note",
      note: "East corridor observation",
      createdAt: "2026-08-21T17:00:00.000Z",
    },
  );
  assertStatus("note repeat idempotent", noteRepeat.status, 200);

  const foreign = await requestJson(
    baseUrl,
    tokenB,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: "evidence-foreign",
      type: "note",
      note: "Hijack",
      createdAt: new Date().toISOString(),
    },
  );
  assertStatus("note foreign project", foreign.status, 404);

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
  assertStatus("upload-url owner", uploadUrl.status, 200);

  const uploadPayload = uploadUrl.payload as {
    uploadUrl?: string;
    objectPath?: string;
    contentType?: string;
  };

  if (
    typeof uploadPayload.uploadUrl !== "string" ||
    typeof uploadPayload.objectPath !== "string"
  ) {
    throw new Error("upload-url payload missing fields");
  }

  const put = await fetch(uploadPayload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg",
    },
    body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  if (put.status < 200 || put.status >= 300) {
    throw new Error(`signed PUT failed (${put.status})`);
  }
  console.log(`PASS signed PUT → ${put.status}`);

  const photoCreate = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localPhotoId,
      type: "photo",
      note: "Conduit photo",
      createdAt: "2026-08-21T17:05:00.000Z",
      objectPath: uploadPayload.objectPath,
      contentType: "image/jpeg",
    },
  );
  assertStatus("photo metadata create", photoCreate.status, 201);

  const photoRepeat = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localPhotoId,
      type: "photo",
      note: "Conduit photo",
      createdAt: "2026-08-21T17:05:00.000Z",
      objectPath: uploadPayload.objectPath,
      contentType: "image/jpeg",
    },
  );
  assertStatus("photo metadata repeat", photoRepeat.status, 200);

  const foreignUrl = await requestJson(
    baseUrl,
    tokenB,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence/upload-url`,
    {
      localEvidenceId: localPhotoId,
      contentType: "image/jpeg",
    },
  );
  assertStatus("upload-url foreign", foreignUrl.status, 404);

  // Public access should fail (no anonymous read).
  const publicUrl = `https://storage.googleapis.com/${getEvidenceBucketName()}/${uploadPayload.objectPath}`;
  const anon = await fetch(publicUrl);
  if (anon.status === 200) {
    throw new Error("Evidence object unexpectedly public");
  }
  console.log(`PASS object not public → ${anon.status}`);

  await db.collection(COLLECTIONS.evidence).doc(remoteNoteId).delete();
  await db.collection(COLLECTIONS.evidence).doc(remotePhotoId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  console.log("Phase 50 evidence upload tests passed.");
  console.log(`Bucket: ${getEvidenceBucketName()}`);
}

main().catch((error: unknown) => {
  console.error("phase50EvidenceUploadTest failed:");
  console.error(error);
  process.exitCode = 1;
});
