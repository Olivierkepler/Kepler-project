import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteDeltaId } from "../domain/deltaId.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-001";
const LOCAL_PLAN_ITEM_ID = "plan-001";
const LOCAL_MEASUREMENT_ID = "phase34-measurement-001";
const LOCAL_DELTA_ID = "phase34-delta-001";

function loadWebApiKey(): string {
  const envPath = resolve(process.cwd(), "../.env");
  const raw = readFileSync(envPath, "utf8");

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq < 0) {
      continue;
    }

    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);

    if (key === "EXPO_PUBLIC_FIREBASE_API_KEY" && value.length > 0) {
      return value;
    }
  }

  throw new Error("EXPO_PUBLIC_FIREBASE_API_KEY missing from ../.env");
}

async function idTokenForEmailPassword(
  email: string,
  password: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
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
    throw new Error(`Password sign-in failed (${response.status})`);
  }

  const payload = (await response.json()) as { idToken?: string };

  if (!payload.idToken) {
    throw new Error("Password sign-in returned no idToken");
  }

  return payload.idToken;
}

async function bootstrapProject(
  baseUrl: string,
  idToken: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/projects/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      name: "Boston Office Renovation",
      location: "Boston, MA",
      status: "active",
      progress: 42,
      openDeltas: 3,
      assignedTasks: 8,
    }),
  });

  const payload = (await response.json()) as { id?: string };

  if (
    (response.status !== 200 && response.status !== 201) ||
    typeof payload.id !== "string"
  ) {
    throw new Error(`Project bootstrap failed (${response.status})`);
  }

  return payload.id;
}

async function bootstrapPlanItem(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            localPlanItemId: LOCAL_PLAN_ITEM_ID,
            type: "length",
            label: "Main conduit run",
            plannedValue: 120,
            unit: "ft",
            unitCost: 4.5,
            productionRatePerDay: 40,
            laborHoursPerUnit: 0.15,
          },
        ],
      }),
    },
  );

  if (response.status !== 200) {
    throw new Error(`Plan item bootstrap failed (${response.status})`);
  }
}

async function bootstrapMeasurement(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/measurements/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            localMeasurementId: LOCAL_MEASUREMENT_ID,
            localPlanItemId: LOCAL_PLAN_ITEM_ID,
            type: "length",
            label: "Main conduit run",
            value: 118,
            unit: "ft",
            createdAt: "2026-08-21T00:00:00.000Z",
          },
        ],
      }),
    },
  );

  if (response.status !== 200) {
    throw new Error(`Measurement bootstrap failed (${response.status})`);
  }
}

async function bootstrapDelta(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            localDeltaId: LOCAL_DELTA_ID,
            localPlanItemId: LOCAL_PLAN_ITEM_ID,
            localMeasurementId: LOCAL_MEASUREMENT_ID,
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
      }),
    },
  );

  const payload = (await response.json()) as {
    items?: Array<{ id?: string; status?: string }>;
  };
  const first = payload.items?.[0];

  if (response.status !== 200 || typeof first?.id !== "string") {
    throw new Error(`Delta bootstrap failed (${response.status})`);
  }

  if (first.status !== "open") {
    throw new Error(`Expected open delta before review, got ${first.status}`);
  }

  return first.id;
}

async function reviewDelta(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
  remoteDeltaId: string,
): Promise<{ statusCode: number; status?: string }> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/deltas/${encodeURIComponent(remoteDeltaId)}/review`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (response.status !== 200) {
    return { statusCode: response.status };
  }

  const payload = (await response.json()) as { status?: string };
  return { statusCode: response.status, status: payload.status };
}

async function getDelta(
  baseUrl: string,
  idToken: string,
  remoteDeltaId: string,
): Promise<{ statusCode: number; status?: string }> {
  const response = await fetch(
    `${baseUrl}/api/deltas/${encodeURIComponent(remoteDeltaId)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (response.status !== 200) {
    return { statusCode: response.status };
  }

  const payload = (await response.json()) as { status?: string };
  return { statusCode: response.status, status: payload.status };
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:18080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase34-a-${Date.now()}-Xx9!`;
  const passwordB = `phase34-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectA = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const remoteProjectB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);
  const remoteDeltaA = createRemoteDeltaId(remoteProjectA, LOCAL_DELTA_ID);
  const remoteMeasurementA = createRemoteMeasurementId(
    remoteProjectA,
    LOCAL_MEASUREMENT_ID,
  );
  const remotePlanA = createRemotePlanItemId(
    remoteProjectA,
    LOCAL_PLAN_ITEM_ID,
  );

  await Promise.all([
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanA).delete(),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const projectA = await bootstrapProject(baseUrl, tokenA);
  const projectB = await bootstrapProject(baseUrl, tokenB);

  await bootstrapPlanItem(baseUrl, tokenA, projectA);
  await bootstrapMeasurement(baseUrl, tokenA, projectA);
  const deltaId = await bootstrapDelta(baseUrl, tokenA, projectA);

  if (deltaId !== remoteDeltaA) {
    throw new Error("Remote delta ID mismatch");
  }

  const firstReview = await reviewDelta(
    baseUrl,
    tokenA,
    projectA,
    remoteDeltaA,
  );

  if (firstReview.statusCode !== 200 || firstReview.status !== "reviewed") {
    throw new Error(
      `Expected first review 200/reviewed, got ${firstReview.statusCode}/${firstReview.status}`,
    );
  }

  const secondReview = await reviewDelta(
    baseUrl,
    tokenA,
    projectA,
    remoteDeltaA,
  );

  if (secondReview.statusCode !== 200 || secondReview.status !== "reviewed") {
    throw new Error(
      `Expected idempotent review 200/reviewed, got ${secondReview.statusCode}/${secondReview.status}`,
    );
  }

  const getAfter = await getDelta(baseUrl, tokenA, remoteDeltaA);

  if (getAfter.statusCode !== 200 || getAfter.status !== "reviewed") {
    throw new Error(
      `Expected GET reviewed, got ${getAfter.statusCode}/${getAfter.status}`,
    );
  }

  // Bootstrap again must not reset reviewed → open.
  const rebootstrap = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectA)}/deltas/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            localDeltaId: LOCAL_DELTA_ID,
            localPlanItemId: LOCAL_PLAN_ITEM_ID,
            localMeasurementId: LOCAL_MEASUREMENT_ID,
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
      }),
    },
  );
  const rebootstrapPayload = (await rebootstrap.json()) as {
    existing?: number;
    items?: Array<{ status?: string }>;
  };

  if (
    rebootstrap.status !== 200 ||
    rebootstrapPayload.existing !== 1 ||
    rebootstrapPayload.items?.[0]?.status !== "reviewed"
  ) {
    throw new Error("Bootstrap overwrote reviewed status");
  }

  const foreign = await reviewDelta(
    baseUrl,
    tokenB,
    projectA,
    remoteDeltaA,
  );

  if (foreign.statusCode !== 404) {
    throw new Error(`Expected foreign 404, got ${foreign.statusCode}`);
  }

  const wrongProject = await reviewDelta(
    baseUrl,
    tokenA,
    projectB,
    remoteDeltaA,
  );

  if (wrongProject.statusCode !== 404) {
    throw new Error(`Expected wrong project 404, got ${wrongProject.statusCode}`);
  }

  const missing = await reviewDelta(
    baseUrl,
    tokenA,
    projectA,
    `${remoteProjectA}_missing-delta`,
  );

  if (missing.statusCode !== 404) {
    throw new Error(`Expected missing 404, got ${missing.statusCode}`);
  }

  await Promise.all([
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanA).delete(),
  ]);

  console.log("phase34 delta review sync: PASS");
  console.log(
    JSON.stringify({
      firstReview: firstReview.status,
      secondReview: secondReview.status,
      getAfter: getAfter.status,
      bootstrapPreservedReviewed: true,
      foreignStatus: foreign.statusCode,
      wrongProjectStatus: wrongProject.statusCode,
      missingStatus: missing.statusCode,
      cleanedUp: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase34 delta review test failed:");
  console.error(error);
  process.exitCode = 1;
});
