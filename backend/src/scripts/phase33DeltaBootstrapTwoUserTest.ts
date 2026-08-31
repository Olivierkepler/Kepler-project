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
const LOCAL_PLAN_ITEM_ALT = "plan-002";
const LOCAL_MEASUREMENT_ID = "phase33-measurement-001";
const LOCAL_DELTA_ID = "phase33-delta-001";

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

async function bootstrapPlanItems(
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
          {
            localPlanItemId: LOCAL_PLAN_ITEM_ALT,
            type: "length",
            label: "Conference room wall",
            plannedValue: 40,
            unit: "ft",
            unitCost: 12,
            productionRatePerDay: 20,
            laborHoursPerUnit: 0.3,
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

type BootstrapDeltaResult = {
  status: number;
  created: number;
  existing: number;
  id: string;
  localDeltaId: string;
};

async function bootstrapDelta(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
  options?: {
    localPlanItemId?: string;
    localMeasurementId?: string;
  },
): Promise<BootstrapDeltaResult> {
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
            localPlanItemId: options?.localPlanItemId ?? LOCAL_PLAN_ITEM_ID,
            localMeasurementId:
              options?.localMeasurementId ?? LOCAL_MEASUREMENT_ID,
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
    created?: number;
    existing?: number;
    items?: Array<{ id?: string; localDeltaId?: string }>;
  };

  if (response.status !== 200) {
    return {
      status: response.status,
      created: 0,
      existing: 0,
      id: "",
      localDeltaId: "",
    };
  }

  const first = payload.items?.[0];

  if (
    typeof payload.created !== "number" ||
    typeof payload.existing !== "number" ||
    typeof first?.id !== "string" ||
    typeof first.localDeltaId !== "string"
  ) {
    throw new Error("Unexpected delta bootstrap payload");
  }

  return {
    status: response.status,
    created: payload.created,
    existing: payload.existing,
    id: first.id,
    localDeltaId: first.localDeltaId,
  };
}

async function listDeltas(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<string[]> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/deltas`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`GET deltas failed (${response.status})`);
  }

  const payload = (await response.json()) as Array<{ id?: string }>;
  return payload
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:18080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase33-a-${Date.now()}-Xx9!`;
  const passwordB = `phase33-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectA = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const remoteProjectB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);
  const remoteDeltaA = createRemoteDeltaId(remoteProjectA, LOCAL_DELTA_ID);
  const remoteDeltaB = createRemoteDeltaId(remoteProjectB, LOCAL_DELTA_ID);
  const remoteMeasurementA = createRemoteMeasurementId(
    remoteProjectA,
    LOCAL_MEASUREMENT_ID,
  );
  const remoteMeasurementB = createRemoteMeasurementId(
    remoteProjectB,
    LOCAL_MEASUREMENT_ID,
  );
  const remotePlanA = createRemotePlanItemId(
    remoteProjectA,
    LOCAL_PLAN_ITEM_ID,
  );
  const remotePlanB = createRemotePlanItemId(
    remoteProjectB,
    LOCAL_PLAN_ITEM_ID,
  );
  const remotePlanAltA = createRemotePlanItemId(
    remoteProjectA,
    LOCAL_PLAN_ITEM_ALT,
  );
  const remotePlanAltB = createRemotePlanItemId(
    remoteProjectB,
    LOCAL_PLAN_ITEM_ALT,
  );

  await Promise.all([
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaA).delete(),
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaB).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementB).delete(),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const projectA = await bootstrapProject(baseUrl, tokenA);
  const projectB = await bootstrapProject(baseUrl, tokenB);

  await bootstrapPlanItems(baseUrl, tokenA, projectA);
  await bootstrapPlanItems(baseUrl, tokenB, projectB);
  await bootstrapMeasurement(baseUrl, tokenA, projectA);
  await bootstrapMeasurement(baseUrl, tokenB, projectB);

  const createdA = await bootstrapDelta(baseUrl, tokenA, projectA);
  const createdB = await bootstrapDelta(baseUrl, tokenB, projectB);
  const repeatA = await bootstrapDelta(baseUrl, tokenA, projectA);

  if (createdA.status !== 200 || createdB.status !== 200) {
    throw new Error(
      `Expected 200 create, got A=${createdA.status} B=${createdB.status}`,
    );
  }

  if (createdA.created !== 1 || createdB.created !== 1) {
    throw new Error(
      `Expected created=1, got A=${createdA.created} B=${createdB.created}`,
    );
  }

  if (repeatA.created !== 0 || repeatA.existing !== 1) {
    throw new Error(
      `Expected repeat created=0 existing=1, got ${repeatA.created}/${repeatA.existing}`,
    );
  }

  if (createdA.id !== remoteDeltaA || createdB.id !== remoteDeltaB) {
    throw new Error("Remote delta IDs did not match expectation");
  }

  if (createdA.id === createdB.id) {
    throw new Error("Users A and B share the same remote delta id");
  }

  if (repeatA.id !== createdA.id) {
    throw new Error("Repeat bootstrap changed User A remote delta id");
  }

  const listA = await listDeltas(baseUrl, tokenA, projectA);
  const listB = await listDeltas(baseUrl, tokenB, projectB);

  if (!listA.includes(createdA.id) || listA.includes(createdB.id)) {
    throw new Error("User A delta list ownership check failed");
  }

  if (!listB.includes(createdB.id) || listB.includes(createdA.id)) {
    throw new Error("User B delta list ownership check failed");
  }

  const foreign = await bootstrapDelta(baseUrl, tokenA, projectB);

  if (foreign.status !== 404) {
    throw new Error(`Expected foreign bootstrap 404, got ${foreign.status}`);
  }

  const badPlan = await bootstrapDelta(baseUrl, tokenA, projectA, {
    localPlanItemId: "plan-does-not-exist",
  });

  if (badPlan.status !== 400) {
    throw new Error(`Expected bad plan 400, got ${badPlan.status}`);
  }

  const badMeasurement = await bootstrapDelta(baseUrl, tokenA, projectA, {
    localMeasurementId: "measurement-does-not-exist",
  });

  if (badMeasurement.status !== 400) {
    throw new Error(
      `Expected bad measurement 400, got ${badMeasurement.status}`,
    );
  }

  const mismatch = await bootstrapDelta(baseUrl, tokenA, projectA, {
    localPlanItemId: LOCAL_PLAN_ITEM_ALT,
  });

  if (mismatch.status !== 400) {
    throw new Error(`Expected plan/measurement mismatch 400, got ${mismatch.status}`);
  }

  await Promise.all([
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaA).delete(),
    db.collection(COLLECTIONS.deltas).doc(remoteDeltaB).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementB).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanA).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanB).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanAltA).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanAltB).delete(),
  ]);

  console.log("phase33 two-user delta bootstrap: PASS");
  console.log(
    JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      localDeltaId: LOCAL_DELTA_ID,
      remoteIdsDiffer: createdA.id !== createdB.id,
      repeatStable: repeatA.id === createdA.id,
      foreignBootstrapStatus: foreign.status,
      badPlanStatus: badPlan.status,
      badMeasurementStatus: badMeasurement.status,
      mismatchStatus: mismatch.status,
      createdA: createdA.created,
      createdB: createdB.created,
      repeatExisting: repeatA.existing,
      cleanedUp: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase33 delta bootstrap test failed:");
  console.error(error);
  process.exitCode = 1;
});
