import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";

const LOCAL_PROJECT_ID = "phase47-project";
const LOCAL_PLAN_ITEM_ID = "phase47-plan";

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

/**
 * Reads Firebase Auth uid from an ID token payload without Admin SDK.
 */
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

function assertStatus(
  label: string,
  actual: number,
  expected: number,
): void {
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
  const userAUid = uidFromIdToken(tokenA);
  const remoteProjectId = createRemoteProjectId(userAUid, LOCAL_PROJECT_ID);
  const remotePlanItemId = createRemotePlanItemId(
    remoteProjectId,
    LOCAL_PLAN_ITEM_ID,
  );

  // Cleanup prior run
  await db.collection(COLLECTIONS.planItems).doc(remotePlanItemId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const health = await fetch(`${baseUrl}/health`);
  assertStatus("GET /health", health.status, 200);

  const unauth = await requestJson(
    baseUrl,
    null,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { name: "Nope" },
  );
  assertStatus("PATCH project unauthenticated", unauth.status, 401);

  const bootstrap = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    "/api/projects/bootstrap",
    {
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 47 Project",
      location: "Test City",
      status: "active",
      progress: 10,
      openDeltas: 0,
      assignedTasks: 1,
    },
  );
  assertStatus("bootstrap project", bootstrap.status, 201);

  const missing = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent("missing-project-id")}`,
    { name: "Missing" },
  );
  assertStatus("PATCH missing project", missing.status, 404);

  const invalid = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { name: "" },
  );
  assertStatus("PATCH invalid project body", invalid.status, 400);

  const ownerPatch = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    {
      name: "Phase 47 Project Updated",
      location: "Updated City",
      status: "planning",
    },
  );
  assertStatus("PATCH project owner", ownerPatch.status, 200);

  const foreign = await requestJson(
    baseUrl,
    tokenB,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { name: "Hijack" },
  );
  assertStatus("PATCH project foreign", foreign.status, 404);

  const planBootstrap = await requestJson(
    baseUrl,
    tokenA,
    "POST",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
    {
      items: [
        {
          localPlanItemId: LOCAL_PLAN_ITEM_ID,
          type: "length",
          label: "Wall A",
          plannedValue: 100,
          unit: "ft",
          unitCost: 12,
          productionRatePerDay: 50,
          laborHoursPerUnit: 0.2,
        },
      ],
    },
  );
  assertStatus("bootstrap plan item", planBootstrap.status, 200);

  const planInvalid = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
    { productionRatePerDay: 0 },
  );
  assertStatus("PATCH plan item invalid", planInvalid.status, 400);

  const planOwner = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
    {
      label: "Wall A Updated",
      plannedValue: 110,
      unitCost: 13.5,
      productionRatePerDay: 55,
      laborHoursPerUnit: 0.25,
    },
  );
  assertStatus("PATCH plan item owner", planOwner.status, 200);

  const planForeign = await requestJson(
    baseUrl,
    tokenB,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
    { label: "Hijack" },
  );
  assertStatus("PATCH plan item foreign", planForeign.status, 404);

  const wrongProject = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent("wrong-project")}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
    { label: "Wrong project" },
  );
  assertStatus("PATCH plan item wrong project", wrongProject.status, 404);

  const repeat = await requestJson(
    baseUrl,
    tokenA,
    "PATCH",
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/${encodeURIComponent(remotePlanItemId)}`,
    {
      label: "Wall A Updated",
      plannedValue: 110,
      unitCost: 13.5,
      productionRatePerDay: 55,
      laborHoursPerUnit: 0.25,
    },
  );
  assertStatus("PATCH plan item repeat", repeat.status, 200);

  // Cleanup
  await db.collection(COLLECTIONS.planItems).doc(remotePlanItemId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  console.log("Phase 47 backend PATCH tests passed.");
}

main().catch((error: unknown) => {
  console.error("phase47ProjectPlanUpdateTest failed:");
  console.error(error);
  process.exitCode = 1;
});
