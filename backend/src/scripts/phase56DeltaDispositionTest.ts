/**
 * Phase 56 Delta disposition tests.
 *
 * Required env:
 *   BUILDSIGMA_TEST_EMAIL_A
 *   BUILDSIGMA_TEST_PASSWORD_A
 *   BUILDSIGMA_TEST_EMAIL_B
 *   BUILDSIGMA_TEST_PASSWORD_B
 *   FIREBASE_WEB_API_KEY
 * Optional:
 *   BUILDSIGMA_API_URL
 */

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";

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
): Promise<{ status: number; payload: Record<string, unknown> | null }> {
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

  let payload: Record<string, unknown> | null = null;

  try {
    payload = (await response.json()) as Record<string, unknown>;
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

  const localProjectId = "phase56-disposition-project";
  const localPlanItemId = "phase56-plan-001";
  const localMeasurementId = "phase56-measurement-001";
  const localDeltaId = "phase56-delta-001";
  const remoteProjectId = createRemoteProjectId(uidA, localProjectId);
  const remotePlanItemId = createRemotePlanItemId(
    remoteProjectId,
    localPlanItemId,
  );
  const remoteMeasurementId = createRemoteMeasurementId(
    remoteProjectId,
    localMeasurementId,
  );
  const remoteDeltaId = createRemoteDeltaId(remoteProjectId, localDeltaId);

  await db.collection(COLLECTIONS.deltas).doc(remoteDeltaId).delete();
  await db.collection(COLLECTIONS.measurements).doc(remoteMeasurementId).delete();
  await db.collection(COLLECTIONS.planItems).doc(remotePlanItemId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const health = await fetch(`${baseUrl}/health`);
  assertStatus("GET /health", health.status, 200);

  const project = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    "/api/projects/bootstrap",
    {
      localProjectId,
      name: "Phase 56 Disposition Project",
      location: "Test Site",
      status: "active",
      progress: 1,
      openDeltas: 0,
      assignedTasks: 0,
    },
  );
  if (project.status !== 200 && project.status !== 201) {
    throw new Error(
      `bootstrap project: expected 200 or 201, got ${project.status}`,
    );
  }
  console.log(`PASS bootstrap project → ${project.status}`);

  const plan = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
    {
      items: [
        {
          localPlanItemId,
          type: "length",
          label: "Main conduit run",
          plannedValue: 120,
          unit: "ft",
          unitCost: 4.5,
          productionRatePerDay: 40,
          laborHoursPerUnit: 0.15,
        },
      ],
    },
  );
  assertStatus("bootstrap plan item", plan.status, 200);

  const measurement = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/measurements/bootstrap`,
    {
      items: [
        {
          localMeasurementId,
          localPlanItemId,
          type: "length",
          label: "Main conduit run",
          value: 118,
          unit: "ft",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    },
  );
  assertStatus("bootstrap measurement", measurement.status, 200);

  const deltaBootstrap = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/bootstrap`,
    {
      items: [
        {
          localDeltaId,
          localPlanItemId,
          localMeasurementId,
          type: "length",
          plannedValue: 120,
          actualValue: 118,
          difference: -2,
          percentDifference: -1.6667,
          unit: "ft",
          unitCost: 4.5,
          costImpact: -9,
          productionRatePerDay: 40,
          scheduleImpactDays: -0.05,
          laborHoursPerUnit: 0.15,
          laborImpactHours: -0.3,
          status: "open",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
    },
  );
  assertStatus("bootstrap delta", deltaBootstrap.status, 200);

  const bootstrapped = (
    deltaBootstrap.payload?.items as Array<Record<string, unknown>> | undefined
  )?.[0];

  if (!bootstrapped || bootstrapped.status !== "open") {
    throw new Error(
      `Expected default disposition open, got ${String(bootstrapped?.status)}`,
    );
  }

  if (bootstrapped.dispositionReason !== "") {
    throw new Error("Expected empty dispositionReason on bootstrap");
  }

  if (bootstrapped.disposedAt !== null) {
    throw new Error("Expected disposedAt null on open bootstrap");
  }

  console.log("PASS default disposition → open");

  const unauth = await requestJson(
    baseUrl,
    null,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    { status: "accepted", dispositionReason: "" },
  );
  assertStatus("PATCH unauth", unauth.status, 401);

  const invalid = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    { status: "banana", dispositionReason: "" },
  );
  assertStatus("PATCH invalid disposition", invalid.status, 400);

  const accepted = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    { status: "accepted", dispositionReason: "Field condition ok" },
  );
  assertStatus("PATCH accepted", accepted.status, 200);

  if (accepted.payload?.status !== "accepted") {
    throw new Error("Expected accepted");
  }

  if (typeof accepted.payload?.disposedAt !== "string") {
    throw new Error("Expected disposedAt after accept");
  }

  console.log("PASS verify accepted");

  const rejected = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    {
      status: "rejected",
      dispositionReason:
        "Existing routing conflicts with approved layout.",
    },
  );
  assertStatus("PATCH rejected", rejected.status, 200);

  if (
    rejected.payload?.status !== "rejected" ||
    rejected.payload?.dispositionReason !==
      "Existing routing conflicts with approved layout."
  ) {
    throw new Error("Rejected reason mismatch");
  }

  console.log("PASS verify rejected reason");

  const resolved = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    {
      status: "resolved",
      dispositionReason: "Conduit rerouted and field measurement verified.",
    },
  );
  assertStatus("PATCH resolved", resolved.status, 200);

  if (resolved.payload?.status !== "resolved") {
    throw new Error("Expected resolved");
  }

  console.log("PASS verify resolved");

  const reopen = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    {
      status: "open",
      dispositionReason: "Conduit rerouted and field measurement verified.",
    },
  );
  assertStatus("PATCH reopen", reopen.status, 200);

  if (reopen.payload?.status !== "open" || reopen.payload?.disposedAt !== null) {
    throw new Error("Expected open with disposedAt null");
  }

  if (
    reopen.payload?.dispositionReason !==
    "Conduit rerouted and field measurement verified."
  ) {
    throw new Error("Expected reason preserved on reopen");
  }

  console.log("PASS verify reopen disposedAt null + reason preserved");

  const foreign = await requestJson(
    baseUrl,
    tokenB,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    { status: "accepted", dispositionReason: "" },
  );
  assertStatus("PATCH foreign", foreign.status, 404);

  const wrongProject = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent("not-a-real-project")}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    { status: "accepted", dispositionReason: "" },
  );
  assertStatus("PATCH wrong project", wrongProject.status, 404);

  const repeat = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}`,
    {
      status: "open",
      dispositionReason: "Conduit rerouted and field measurement verified.",
    },
  );
  assertStatus("repeat PATCH", repeat.status, 200);

  console.log("phase56 delta disposition: PASS");
}

main().catch((error) => {
  console.error("phase56 delta disposition test failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
