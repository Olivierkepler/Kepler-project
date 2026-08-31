import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemoteMeasurementId } from "../domain/measurementId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-001";
const LOCAL_PLAN_ITEM_ID = "plan-001";
const LOCAL_MEASUREMENT_ID = "phase32-measurement-001";

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

type BootstrapMeasurementResult = {
  status: number;
  created: number;
  existing: number;
  id: string;
  localMeasurementId: string;
  planItemId: string;
};

async function bootstrapMeasurement(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
  localPlanItemId: string = LOCAL_PLAN_ITEM_ID,
): Promise<BootstrapMeasurementResult> {
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
            localPlanItemId,
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

  const payload = (await response.json()) as {
    created?: number;
    existing?: number;
    items?: Array<{
      id?: string;
      localMeasurementId?: string;
      planItemId?: string;
    }>;
  };

  if (response.status !== 200) {
    return {
      status: response.status,
      created: 0,
      existing: 0,
      id: "",
      localMeasurementId: "",
      planItemId: "",
    };
  }

  const first = payload.items?.[0];

  if (
    typeof payload.created !== "number" ||
    typeof payload.existing !== "number" ||
    typeof first?.id !== "string" ||
    typeof first.localMeasurementId !== "string" ||
    typeof first.planItemId !== "string"
  ) {
    throw new Error("Unexpected measurement bootstrap payload");
  }

  return {
    status: response.status,
    created: payload.created,
    existing: payload.existing,
    id: first.id,
    localMeasurementId: first.localMeasurementId,
    planItemId: first.planItemId,
  };
}

async function listMeasurements(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<string[]> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/measurements`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`GET measurements failed (${response.status})`);
  }

  const payload = (await response.json()) as Array<{ id?: string }>;
  return payload
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase32-a-${Date.now()}-Xx9!`;
  const passwordB = `phase32-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectA = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const remoteProjectB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);
  const remotePlanA = createRemotePlanItemId(
    remoteProjectA,
    LOCAL_PLAN_ITEM_ID,
  );
  const remotePlanB = createRemotePlanItemId(
    remoteProjectB,
    LOCAL_PLAN_ITEM_ID,
  );
  const remoteMeasurementA = createRemoteMeasurementId(
    remoteProjectA,
    LOCAL_MEASUREMENT_ID,
  );
  const remoteMeasurementB = createRemoteMeasurementId(
    remoteProjectB,
    LOCAL_MEASUREMENT_ID,
  );

  await Promise.all([
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementB).delete(),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const projectA = await bootstrapProject(baseUrl, tokenA);
  const projectB = await bootstrapProject(baseUrl, tokenB);

  await bootstrapPlanItem(baseUrl, tokenA, projectA);
  await bootstrapPlanItem(baseUrl, tokenB, projectB);

  const createdA = await bootstrapMeasurement(baseUrl, tokenA, projectA);
  const createdB = await bootstrapMeasurement(baseUrl, tokenB, projectB);
  const repeatA = await bootstrapMeasurement(baseUrl, tokenA, projectA);

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

  if (createdA.id !== remoteMeasurementA || createdB.id !== remoteMeasurementB) {
    throw new Error("Remote measurement IDs did not match expectation");
  }

  if (createdA.id === createdB.id) {
    throw new Error("Users A and B share the same remote measurement id");
  }

  if (repeatA.id !== createdA.id) {
    throw new Error("Repeat bootstrap changed User A remote measurement id");
  }

  if (
    createdA.planItemId !== remotePlanA ||
    createdB.planItemId !== remotePlanB
  ) {
    throw new Error("Resolved planItemId mismatch");
  }

  const listA = await listMeasurements(baseUrl, tokenA, projectA);
  const listB = await listMeasurements(baseUrl, tokenB, projectB);

  if (!listA.includes(createdA.id) || listA.includes(createdB.id)) {
    throw new Error("User A measurement list ownership check failed");
  }

  if (!listB.includes(createdB.id) || listB.includes(createdA.id)) {
    throw new Error("User B measurement list ownership check failed");
  }

  const foreign = await bootstrapMeasurement(baseUrl, tokenA, projectB);

  if (foreign.status !== 404) {
    throw new Error(`Expected foreign bootstrap 404, got ${foreign.status}`);
  }

  const badPlan = await bootstrapMeasurement(
    baseUrl,
    tokenA,
    projectA,
    "plan-does-not-exist",
  );

  if (badPlan.status !== 400) {
    throw new Error(`Expected bad plan 400, got ${badPlan.status}`);
  }

  await Promise.all([
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementA).delete(),
    db.collection(COLLECTIONS.measurements).doc(remoteMeasurementB).delete(),
  ]);

  console.log("phase32 two-user measurement bootstrap: PASS");
  console.log(
    JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      localMeasurementId: LOCAL_MEASUREMENT_ID,
      remoteIdsDiffer: createdA.id !== createdB.id,
      repeatStable: repeatA.id === createdA.id,
      foreignBootstrapStatus: foreign.status,
      badPlanStatus: badPlan.status,
      createdA: createdA.created,
      createdB: createdB.created,
      repeatExisting: repeatA.existing,
      cleanedUp: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase32 measurement bootstrap test failed:");
  console.error(error);
  process.exitCode = 1;
});
