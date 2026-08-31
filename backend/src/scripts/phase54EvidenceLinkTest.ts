/**
 * Phase 54 Evidence relationship metadata tests.
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteEvidenceId } from "../domain/evidenceId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { normalizeEvidenceDocument } from "../repositories/evidenceRepository.js";

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
  const apiKey = requireEnv("FIREBASE_WEB_API_KEY");
  const baseUrl =
    process.env.BUILDSIGMA_API_URL ??
    "https://buildsigma-api-543603860885.us-east1.run.app";

  const tokenA = await idTokenForEmail(EMAIL_A, PASSWORD_A, apiKey);
  const uidA = uidFromIdToken(tokenA);

  const localProjectId = "phase54-evidence-project";
  const remoteProjectId = createRemoteProjectId(uidA, localProjectId);
  const localProjectOnly = "evidence-project-only-54";
  const localMeasurementLinked = "evidence-measurement-54";
  const localDeltaLinked = "evidence-delta-54";
  const localLegacy = "evidence-legacy-54";

  const ids = [
    createRemoteEvidenceId(remoteProjectId, localProjectOnly),
    createRemoteEvidenceId(remoteProjectId, localMeasurementLinked),
    createRemoteEvidenceId(remoteProjectId, localDeltaLinked),
    createRemoteEvidenceId(remoteProjectId, localLegacy),
  ];

  for (const id of ids) {
    await db.collection(COLLECTIONS.evidence).doc(id).delete();
  }
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const health = await fetch(`${baseUrl}/health`);
  assertStatus("GET /health", health.status, 200);

  await requestJson(baseUrl, tokenA, "POST", "/api/projects/bootstrap", {
    localProjectId,
    name: "Phase 54 Evidence Project",
    location: "Test Site",
    status: "active",
    progress: 1,
    openDeltas: 0,
    assignedTasks: 0,
  });

  const projectOnly = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localProjectOnly,
      type: "note",
      note: "Project only",
      createdAt: "2026-08-21T21:00:00.000Z",
    },
  );
  assertStatus("create project-only", projectOnly.status, 201);
  const projectOnlyBody = projectOnly.payload as {
    localMeasurementId: string | null;
    localDeltaId: string | null;
  };
  if (
    projectOnlyBody.localMeasurementId !== null ||
    projectOnlyBody.localDeltaId !== null
  ) {
    throw new Error("project-only should have null relationship fields");
  }
  console.log("PASS project-only null links");

  const measurementLinked = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localMeasurementLinked,
      type: "note",
      note: "Measurement linked",
      createdAt: "2026-08-21T21:01:00.000Z",
      localMeasurementId: "measurement-local-1",
      localDeltaId: null,
    },
  );
  assertStatus("create measurement-linked", measurementLinked.status, 201);

  const deltaLinked = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: localDeltaLinked,
      type: "note",
      note: "Delta linked",
      createdAt: "2026-08-21T21:02:00.000Z",
      localMeasurementId: null,
      localDeltaId: "delta-local-1",
    },
  );
  assertStatus("create delta-linked", deltaLinked.status, 201);

  const both = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    {
      localEvidenceId: "evidence-both-54",
      type: "note",
      note: "Both linked",
      createdAt: "2026-08-21T21:03:00.000Z",
      localMeasurementId: "measurement-local-1",
      localDeltaId: "delta-local-1",
    },
  );
  assertStatus("reject both links", both.status, 400);

  const legacyId = createRemoteEvidenceId(remoteProjectId, localLegacy);
  await db.collection(COLLECTIONS.evidence).doc(legacyId).set({
    id: legacyId,
    ownerUid: uidA,
    projectId: remoteProjectId,
    localEvidenceId: localLegacy,
    type: "note",
    note: "Legacy without relationship fields",
    objectPath: null,
    contentType: null,
    createdAt: "2026-08-21T20:00:00.000Z",
  });

  const normalized = normalizeEvidenceDocument(
    (
      await db.collection(COLLECTIONS.evidence).doc(legacyId).get()
    ).data(),
  );

  if (
    !normalized ||
    normalized.localMeasurementId !== null ||
    normalized.localDeltaId !== null
  ) {
    throw new Error("legacy normalize failed");
  }
  console.log("PASS legacy missing fields → null");

  const list = await requestJson(
    baseUrl,
    tokenA,
    "GET",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
  );
  assertStatus("list evidence", list.status, 200);
  const items = list.payload as Array<{
    localEvidenceId: string;
    localMeasurementId: string | null;
    localDeltaId: string | null;
  }>;
  const legacyItem = items.find((item) => item.localEvidenceId === localLegacy);
  if (
    !legacyItem ||
    legacyItem.localMeasurementId !== null ||
    legacyItem.localDeltaId !== null
  ) {
    throw new Error("list did not normalize legacy fields");
  }
  console.log("PASS list normalizes legacy");

  for (const id of ids) {
    await db.collection(COLLECTIONS.evidence).doc(id).delete();
  }
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();
  console.log("Phase 54 evidence relationship tests passed.");
}

main().catch((error: unknown) => {
  console.error("phase54EvidenceLinkTest failed:");
  console.error(error);
  process.exitCode = 1;
});
