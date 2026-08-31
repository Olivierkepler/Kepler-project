import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-001";
const LOCAL_PLAN_ITEMS = ["plan-001", "plan-002", "plan-003"] as const;

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

type BootstrapPlanResult = {
  status: number;
  created: number;
  existing: number;
  ids: string[];
  localIds: string[];
};

async function bootstrapPlanItems(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<BootstrapPlanResult> {
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
            localPlanItemId: "plan-001",
            type: "length",
            label: "Main conduit run",
            plannedValue: 120,
            unit: "ft",
            unitCost: 4.5,
            productionRatePerDay: 40,
            laborHoursPerUnit: 0.15,
          },
          {
            localPlanItemId: "plan-002",
            type: "length",
            label: "Conference room wall",
            plannedValue: 40,
            unit: "ft",
            unitCost: 12,
            productionRatePerDay: 20,
            laborHoursPerUnit: 0.3,
          },
          {
            localPlanItemId: "plan-003",
            type: "count",
            label: "Receptacles",
            plannedValue: 8,
            unit: "ea",
            unitCost: 85,
            productionRatePerDay: 8,
            laborHoursPerUnit: 0.75,
          },
        ],
      }),
    },
  );

  const payload = (await response.json()) as {
    created?: number;
    existing?: number;
    items?: Array<{ id?: string; localPlanItemId?: string }>;
  };

  if (
    typeof payload.created !== "number" ||
    typeof payload.existing !== "number" ||
    !Array.isArray(payload.items)
  ) {
    throw new Error(`Unexpected plan bootstrap payload (${response.status})`);
  }

  return {
    status: response.status,
    created: payload.created,
    existing: payload.existing,
    ids: payload.items
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string"),
    localIds: payload.items
      .map((item) => item.localPlanItemId)
      .filter((id): id is string => typeof id === "string"),
  };
}

async function listPlanItems(
  baseUrl: string,
  idToken: string,
  remoteProjectId: string,
): Promise<string[]> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`GET plan-items failed (${response.status})`);
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

  const passwordA = `phase31-a-${Date.now()}-Xx9!`;
  const passwordB = `phase31-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectA = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const remoteProjectB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);

  const planIdsA = LOCAL_PLAN_ITEMS.map((localId) =>
    createRemotePlanItemId(remoteProjectA, localId),
  );
  const planIdsB = LOCAL_PLAN_ITEMS.map((localId) =>
    createRemotePlanItemId(remoteProjectB, localId),
  );

  await Promise.all([
    ...planIdsA.map((id) =>
      db.collection(COLLECTIONS.planItems).doc(id).delete(),
    ),
    ...planIdsB.map((id) =>
      db.collection(COLLECTIONS.planItems).doc(id).delete(),
    ),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const projectA = await bootstrapProject(baseUrl, tokenA);
  const projectB = await bootstrapProject(baseUrl, tokenB);

  if (projectA !== remoteProjectA || projectB !== remoteProjectB) {
    throw new Error("Remote project IDs did not match expectation");
  }

  if (projectA === projectB) {
    throw new Error("Users A and B share the same remote project");
  }

  const createdA = await bootstrapPlanItems(baseUrl, tokenA, projectA);
  const createdB = await bootstrapPlanItems(baseUrl, tokenB, projectB);
  const repeatA = await bootstrapPlanItems(baseUrl, tokenA, projectA);

  if (createdA.status !== 200 || createdB.status !== 200) {
    throw new Error(
      `Expected 200 bootstrap, got A=${createdA.status} B=${createdB.status}`,
    );
  }

  if (createdA.created !== 3 || createdB.created !== 3) {
    throw new Error(
      `Expected 3 created each, got A=${createdA.created} B=${createdB.created}`,
    );
  }

  if (repeatA.created !== 0 || repeatA.existing !== 3) {
    throw new Error(
      `Expected repeat A created=0 existing=3, got ${repeatA.created}/${repeatA.existing}`,
    );
  }

  if (createdA.ids.join("|") !== planIdsA.join("|")) {
    throw new Error("User A remote plan IDs mismatch");
  }

  if (createdB.ids.join("|") !== planIdsB.join("|")) {
    throw new Error("User B remote plan IDs mismatch");
  }

  if (createdA.ids.some((id) => createdB.ids.includes(id))) {
    throw new Error("Users A and B share remote plan item IDs");
  }

  if (repeatA.ids.join("|") !== createdA.ids.join("|")) {
    throw new Error("Repeat bootstrap changed User A remote plan IDs");
  }

  const listA = await listPlanItems(baseUrl, tokenA, projectA);
  const listB = await listPlanItems(baseUrl, tokenB, projectB);

  if (listA.length !== 3 || listB.length !== 3) {
    throw new Error("GET plan-items count mismatch");
  }

  if (listA.some((id) => listB.includes(id))) {
    throw new Error("Cross-user plan item list leakage");
  }

  const foreign = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectB)}/plan-items/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            localPlanItemId: "plan-001",
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

  if (foreign.status !== 404) {
    throw new Error(`Expected foreign bootstrap 404, got ${foreign.status}`);
  }

  console.log("phase31 two-user plan bootstrap: PASS");
  console.log(
    JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      localPlanItemIds: LOCAL_PLAN_ITEMS,
      remoteProjectsDiffer: projectA !== projectB,
      remotePlanIdsDiffer: !createdA.ids.some((id) =>
        createdB.ids.includes(id),
      ),
      repeatStable: repeatA.ids.join("|") === createdA.ids.join("|"),
      foreignBootstrapStatus: foreign.status,
      createdA: createdA.created,
      createdB: createdB.created,
      repeatExisting: repeatA.existing,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase31 plan bootstrap test failed:");
  console.error(error);
  process.exitCode = 1;
});
