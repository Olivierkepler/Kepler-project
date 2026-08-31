import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-1i-read-auth";
const LOCAL_LEGACY_ID = "project-1i-legacy";

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

async function apiJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    idToken?: string | null;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};

  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

async function seedMember(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  status: "active" | "invited" | "removed";
  invitedBy: string;
}): Promise<void> {
  const id = createProjectMemberId(input.projectId, input.userId);
  const now = new Date().toISOString();

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(id)
    .set(
      {
        id,
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        invitedBy: input.invitedBy,
        createdAt: now,
        updatedAt: now,
      },
      { merge: false },
    );
}

async function expectReadOk(
  baseUrl: string,
  token: string,
  remoteProjectId: string,
): Promise<void> {
  const paths = [
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items`,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/measurements`,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/evidence`,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/deltas`,
  ];

  for (const path of paths) {
    const result = await apiJson(baseUrl, path, { idToken: token });
    if (result.status !== 200) {
      throw new Error(`Expected 200 for ${path}, got ${result.status}`);
    }
  }
}

async function expectReadDenied(
  baseUrl: string,
  token: string | null,
  remoteProjectId: string,
  expectedStatus: number,
): Promise<void> {
  const result = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: token },
  );

  if (result.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} for project read, got ${result.status}`,
    );
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase1i-a-${Date.now()}-Xx9!`;
  const passwordB = `phase1i-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const legacyProjectId = createRemoteProjectId(userA.uid, LOCAL_LEGACY_ID);

  const memberIds = [
    createProjectMemberId(remoteProjectId, userA.uid),
    createProjectMemberId(remoteProjectId, userB.uid),
    createProjectMemberId(legacyProjectId, userA.uid),
  ];

  const priorInvites = await db
    .collection(COLLECTIONS.projectInvitations)
    .where("projectId", "==", remoteProjectId)
    .get();

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    ...memberIds.map((id) =>
      db.collection(COLLECTIONS.projectMembers).doc(id).delete(),
    ),
    ...priorInvites.docs.map((doc) => doc.ref.delete()),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  // 1: unauthenticated cannot read
  await expectReadDenied(baseUrl, null, remoteProjectId, 401);

  const bootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 1I Read Auth Project",
      location: "Boston, MA",
      status: "active",
      progress: 0,
      openDeltas: 0,
      assignedTasks: 0,
    },
  });

  if (bootstrap.status !== 201 && bootstrap.status !== 200) {
    throw new Error(`Bootstrap failed (${bootstrap.status})`);
  }

  // 3: owner with membership can read
  await expectReadOk(baseUrl, tokenA, remoteProjectId);

  // 2 + 21: legacy owner without membership can read
  await db
    .collection(COLLECTIONS.projects)
    .doc(legacyProjectId)
    .set(
      {
        id: legacyProjectId,
        localProjectId: LOCAL_LEGACY_ID,
        ownerUid: userA.uid,
        name: "Phase 1I Legacy Owner Project",
        location: "Cambridge, MA",
        status: "planning",
        progress: 0,
        openDeltas: 0,
        assignedTasks: 0,
      },
      { merge: false },
    );

  await expectReadOk(baseUrl, tokenA, legacyProjectId);

  // 12: unrelated user cannot read
  await expectReadDenied(baseUrl, tokenB, remoteProjectId, 404);

  // 8–10: invited / removed / pending invite cannot read
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "invited",
    invitedBy: userA.uid,
  });
  await expectReadDenied(baseUrl, tokenB, remoteProjectId, 404);

  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "removed",
    invitedBy: userA.uid,
  });
  await expectReadDenied(baseUrl, tokenB, remoteProjectId, 404);

  const pendingInviteId = `project-invitation-1i-${Date.now()}`;
  await db
    .collection(COLLECTIONS.projectInvitations)
    .doc(pendingInviteId)
    .set(
      {
        id: pendingInviteId,
        projectId: remoteProjectId,
        email: EMAIL_B.toLowerCase(),
        role: "contractor",
        status: "pending",
        invitedBy: userA.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acceptedByUserId: null,
      },
      { merge: false },
    );
  await expectReadDenied(baseUrl, tokenB, remoteProjectId, 404);

  // 11: accepted invitation without ACTIVE membership cannot read
  await db
    .collection(COLLECTIONS.projectInvitations)
    .doc(pendingInviteId)
    .set(
      {
        id: pendingInviteId,
        projectId: remoteProjectId,
        email: EMAIL_B.toLowerCase(),
        role: "contractor",
        status: "accepted",
        invitedBy: userA.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acceptedByUserId: userB.uid,
      },
      { merge: false },
    );
  // membership still removed
  await expectReadDenied(baseUrl, tokenB, remoteProjectId, 404);

  // 4–7: ACTIVE roles can read
  const roles: ProjectMemberRole[] = [
    "project_admin",
    "contractor",
    "field_member",
    "viewer",
  ];

  for (const role of roles) {
    await seedMember({
      projectId: remoteProjectId,
      userId: userB.uid,
      role,
      status: "active",
      invitedBy: userA.uid,
    });
    await expectReadOk(baseUrl, tokenB, remoteProjectId);
  }

  // 14–17: collaborator/viewer cannot write or administer collaboration
  const writeAttempts = [
    {
      path: `/api/projects/${encodeURIComponent(remoteProjectId)}`,
      method: "PATCH",
      body: { name: "Hacked Name" },
    },
    {
      path: `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
      method: "POST",
      body: { email: "x@example.com", role: "viewer" },
    },
    {
      path: `/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
      method: "GET",
      body: undefined,
    },
    {
      path: `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
      method: "GET",
      body: undefined,
    },
    {
      path: `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
      method: "POST",
      body: [],
    },
  ];

  for (const attempt of writeAttempts) {
    const result = await apiJson(baseUrl, attempt.path, {
      method: attempt.method,
      idToken: tokenB,
      body: attempt.body,
    });

    if (result.status !== 404) {
      throw new Error(
        `Member ${attempt.method} ${attempt.path} expected 404, got ${result.status}`,
      );
    }
  }

  // 19: agent list remains owner-only
  const agentList = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs`,
    { idToken: tokenB },
  );

  if (agentList.status !== 404) {
    throw new Error(
      `Member agent-runs expected 404, got ${agentList.status}`,
    );
  }

  // 20: discovery still works
  const discovery = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenB,
  });

  if (discovery.status !== 200 || !Array.isArray(discovery.body)) {
    throw new Error("Discovery endpoint failed for member");
  }

  const discovered = discovery.body as Array<{ id?: string }>;

  if (!discovered.some((item) => item.id === remoteProjectId)) {
    throw new Error("Discovery did not include readable shared project");
  }

  // 22: remote project ID is the boundary (local ID alone is not a cloud path)
  const localIdAttempt = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(LOCAL_PROJECT_ID)}`,
    { idToken: tokenB },
  );

  if (localIdAttempt.status !== 404) {
    throw new Error(
      `Local project id must not authorize cloud read, got ${localIdAttempt.status}`,
    );
  }

  // 23: assertProjectOwnedByUser still owner-only on PATCH for foreign
  const ownerPatch = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    {
      method: "PATCH",
      idToken: tokenA,
      body: { name: "Phase 1I Read Auth Project" },
    },
  );

  if (ownerPatch.status !== 200) {
    throw new Error(`Owner PATCH expected 200, got ${ownerPatch.status}`);
  }

  // Cleanup
  await Promise.all([
    db.collection(COLLECTIONS.projectInvitations).doc(pendingInviteId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
  ]);

  console.log("phase1i membership-aware project read authorization: PASS");
  console.log(
    JSON.stringify({
      remoteProjectId,
      legacyOwnerWithoutMembership: true,
      activeRolesCanRead: roles,
      invitedRemovedPendingDenied: true,
      memberWritesDenied: true,
      agentStillOwnerOnly: true,
      discoveryUnchanged: true,
      mobileSharedNavigation: false,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase1i read authorization test failed:");
  console.error(error);
  process.exitCode = 1;
});
