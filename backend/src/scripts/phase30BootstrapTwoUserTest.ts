import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { db } from "../config/firestore.js";
import { COLLECTIONS } from "../config/collections.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-001";

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

async function bootstrap(
  baseUrl: string,
  idToken: string,
): Promise<{ status: number; id: string; localProjectId: string; ownerUid: string }> {
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

  const payload = (await response.json()) as {
    id?: string;
    localProjectId?: string;
    ownerUid?: string;
  };

  if (
    typeof payload.id !== "string" ||
    typeof payload.localProjectId !== "string" ||
    typeof payload.ownerUid !== "string"
  ) {
    throw new Error(`Unexpected bootstrap payload (status ${response.status})`);
  }

  return {
    status: response.status,
    id: payload.id,
    localProjectId: payload.localProjectId,
    ownerUid: payload.ownerUid,
  };
}

async function listOwned(
  baseUrl: string,
  idToken: string,
): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/projects`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    throw new Error(`GET /api/projects failed (${response.status})`);
  }

  const payload = (await response.json()) as Array<{ id?: string }>;
  return payload
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string");
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase30-a-${Date.now()}-Xx9!`;
  const passwordB = `phase30-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const expectedA = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const expectedB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);

  if (expectedA === expectedB) {
    throw new Error("Expected remote IDs to differ between users");
  }

  // Clean prior phase-30 test docs for these two users only.
  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(expectedA).delete(),
    db.collection(COLLECTIONS.projects).doc(expectedB).delete(),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const createdA = await bootstrap(baseUrl, tokenA);
  const createdB = await bootstrap(baseUrl, tokenB);
  const repeatA = await bootstrap(baseUrl, tokenA);

  if (createdA.status !== 201 || createdB.status !== 201) {
    throw new Error(
      `Expected 201 creates, got A=${createdA.status} B=${createdB.status}`,
    );
  }

  if (repeatA.status !== 200) {
    throw new Error(`Expected 200 on repeat A, got ${repeatA.status}`);
  }

  if (createdA.id !== expectedA || createdB.id !== expectedB) {
    throw new Error("Remote IDs did not match deterministic expectation");
  }

  if (createdA.id === createdB.id) {
    throw new Error("Users A and B received the same remote project id");
  }

  if (repeatA.id !== createdA.id) {
    throw new Error("Repeat bootstrap for A returned a different remote id");
  }

  if (
    createdA.localProjectId !== LOCAL_PROJECT_ID ||
    createdB.localProjectId !== LOCAL_PROJECT_ID
  ) {
    throw new Error("localProjectId mismatch");
  }

  if (createdA.ownerUid !== userA.uid || createdB.ownerUid !== userB.uid) {
    throw new Error("ownerUid mismatch");
  }

  const listA = await listOwned(baseUrl, tokenA);
  const listB = await listOwned(baseUrl, tokenB);

  if (!listA.includes(createdA.id) || listA.includes(createdB.id)) {
    throw new Error("User A project list ownership check failed");
  }

  if (!listB.includes(createdB.id) || listB.includes(createdA.id)) {
    throw new Error("User B project list ownership check failed");
  }

  console.log("phase30 two-user bootstrap: PASS");
  console.log(
    JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      createdAStatus: createdA.status,
      createdBStatus: createdB.status,
      repeatAStatus: repeatA.status,
      remoteIdsDiffer: createdA.id !== createdB.id,
      repeatMatchesA: repeatA.id === createdA.id,
      aOwnsOnlyOwn: listA.includes(createdA.id) && !listA.includes(createdB.id),
      bOwnsOnlyOwn: listB.includes(createdB.id) && !listB.includes(createdA.id),
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase30 bootstrap test failed:");
  console.error(error);
  process.exitCode = 1;
});
