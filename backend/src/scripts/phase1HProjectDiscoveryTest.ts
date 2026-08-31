import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { DiscoveredProject } from "../domain/discoveredProject.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-1h-discovery";
const LOCAL_LEGACY_ID = "project-1h-legacy";
const LOCAL_UNRELATED_ID = "project-1h-unrelated";

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

function findDiscovered(
  items: DiscoveredProject[],
  projectId: string,
): DiscoveredProject | undefined {
  return items.find((item) => item.id === projectId);
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase1h-a-${Date.now()}-Xx9!`;
  const passwordB = `phase1h-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const legacyProjectId = createRemoteProjectId(userA.uid, LOCAL_LEGACY_ID);
  const unrelatedProjectId = createRemoteProjectId(
    userA.uid,
    LOCAL_UNRELATED_ID,
  );
  const orphanProjectId = `${userA.uid}_project-1h-orphan-missing`;

  const memberIds = [
    createProjectMemberId(remoteProjectId, userA.uid),
    createProjectMemberId(remoteProjectId, userB.uid),
    createProjectMemberId(legacyProjectId, userA.uid),
    createProjectMemberId(unrelatedProjectId, userA.uid),
    createProjectMemberId(orphanProjectId, userB.uid),
  ];

  const priorInvites = await db
    .collection(COLLECTIONS.projectInvitations)
    .where("projectId", "==", remoteProjectId)
    .get();

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(unrelatedProjectId).delete(),
    ...memberIds.map((id) =>
      db.collection(COLLECTIONS.projectMembers).doc(id).delete(),
    ),
    ...priorInvites.docs.map((doc) => doc.ref.delete()),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  // 1: unauthenticated cannot discover
  const unauth = await apiJson(baseUrl, "/api/me/projects", { idToken: null });
  if (unauth.status !== 401) {
    throw new Error(`Unauth discovery expected 401, got ${unauth.status}`);
  }

  // Bootstrap owner project (creates ACTIVE owner membership via Phase 1F)
  const bootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 1H Discovery Project",
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

  // 2: owner with ACTIVE membership discovers own project
  const ownerDiscover = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenA,
  });

  if (ownerDiscover.status !== 200 || !Array.isArray(ownerDiscover.body)) {
    throw new Error("Owner discovery failed");
  }

  let discovered = ownerDiscover.body as DiscoveredProject[];
  const owned = findDiscovered(discovered, remoteProjectId);

  if (!owned || owned.membership.role !== "owner" || owned.membership.status !== "active") {
    throw new Error("Owner with ACTIVE membership did not discover project correctly");
  }

  // 3: legacy owner without ProjectMember still discovers
  await db
    .collection(COLLECTIONS.projects)
    .doc(legacyProjectId)
    .set(
      {
        id: legacyProjectId,
        localProjectId: LOCAL_LEGACY_ID,
        ownerUid: userA.uid,
        name: "Phase 1H Legacy Owner Project",
        location: "Cambridge, MA",
        status: "planning",
        progress: 0,
        openDeltas: 0,
        assignedTasks: 0,
      },
      { merge: false },
    );

  const legacyDiscover = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenA,
  });
  discovered = legacyDiscover.body as DiscoveredProject[];
  const legacy = findDiscovered(discovered, legacyProjectId);

  if (
    !legacy ||
    legacy.membership.role !== "owner" ||
    legacy.membership.status !== "active"
  ) {
    throw new Error("Legacy owner fallback discovery failed");
  }

  // 14: duplicate owner+membership → one project
  await seedMember({
    projectId: remoteProjectId,
    userId: userA.uid,
    role: "owner",
    status: "active",
    invitedBy: userA.uid,
  });

  const dedupeDiscover = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenA,
  });
  discovered = dedupeDiscover.body as DiscoveredProject[];
  const remoteMatches = discovered.filter((item) => item.id === remoteProjectId);

  if (remoteMatches.length !== 1) {
    throw new Error(
      `Expected one discovered remote project, got ${remoteMatches.length}`,
    );
  }

  // Seed unrelated project owned by A — B must not see it
  await db
    .collection(COLLECTIONS.projects)
    .doc(unrelatedProjectId)
    .set(
      {
        id: unrelatedProjectId,
        localProjectId: LOCAL_UNRELATED_ID,
        ownerUid: userA.uid,
        name: "Unrelated Project",
        location: "Somerville, MA",
        status: "active",
        progress: 0,
        openDeltas: 0,
        assignedTasks: 0,
      },
      { merge: false },
    );

  // 8–10: invited / removed / pending invitation alone do NOT expose
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "invited",
    invitedBy: userA.uid,
  });

  let bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });
  let bProjects = bDiscover.body as DiscoveredProject[];

  if (findDiscovered(bProjects, remoteProjectId)) {
    throw new Error("INVITED membership must not expose project");
  }

  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "removed",
    invitedBy: userA.uid,
  });

  bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });
  bProjects = bDiscover.body as DiscoveredProject[];

  if (findDiscovered(bProjects, remoteProjectId)) {
    throw new Error("REMOVED membership must not expose project");
  }

  const pendingInviteId = `project-invitation-1h-pending-${Date.now()}`;
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

  bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });
  bProjects = bDiscover.body as DiscoveredProject[];

  if (findDiscovered(bProjects, remoteProjectId)) {
    throw new Error("Pending invitation alone must not expose project");
  }

  // 4–7 + 11 + 15–16: ACTIVE roles discover with correct role
  const rolesToTest: ProjectMemberRole[] = [
    "contractor",
    "project_admin",
    "field_member",
    "viewer",
  ];

  for (const role of rolesToTest) {
    await seedMember({
      projectId: remoteProjectId,
      userId: userB.uid,
      role,
      status: "active",
      invitedBy: userA.uid,
    });

    bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });
    bProjects = bDiscover.body as DiscoveredProject[];
    const found = findDiscovered(bProjects, remoteProjectId);

    if (!found) {
      throw new Error(`ACTIVE ${role} must discover project`);
    }

    if (found.membership.role !== role || found.membership.status !== "active") {
      throw new Error(`Discovery role mismatch for ${role}`);
    }

    if (findDiscovered(bProjects, unrelatedProjectId)) {
      throw new Error("User must not discover unrelated project");
    }
  }

  // 11: accepted invitation + ACTIVE membership (already seeded active) exposes
  await db
    .collection(COLLECTIONS.projectInvitations)
    .doc(pendingInviteId)
    .set(
      {
        id: pendingInviteId,
        projectId: remoteProjectId,
        email: EMAIL_B.toLowerCase(),
        role: "viewer",
        status: "accepted",
        invitedBy: userA.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acceptedByUserId: userB.uid,
      },
      { merge: false },
    );

  bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });
  bProjects = bDiscover.body as DiscoveredProject[];

  if (!findDiscovered(bProjects, remoteProjectId)) {
    throw new Error("Accepted invite + ACTIVE membership must expose project");
  }

  // 13: cannot supply another UID (query ignored — endpoint uses token only)
  const spoof = await apiJson(
    baseUrl,
    `/api/me/projects?userId=${encodeURIComponent(userA.uid)}&uid=${encodeURIComponent(userA.uid)}`,
    { idToken: tokenB },
  );

  if (spoof.status !== 200 || !Array.isArray(spoof.body)) {
    throw new Error("Spoof query discovery request failed");
  }

  const spoofProjects = spoof.body as DiscoveredProject[];

  if (findDiscovered(spoofProjects, unrelatedProjectId)) {
    throw new Error("Query params must not allow discovering another user's projects");
  }

  if (!findDiscovered(spoofProjects, remoteProjectId)) {
    throw new Error("Token identity discovery should still return member project");
  }

  // 15: orphan membership does not crash / phantom
  await seedMember({
    projectId: orphanProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });

  bDiscover = await apiJson(baseUrl, "/api/me/projects", { idToken: tokenB });

  if (bDiscover.status !== 200 || !Array.isArray(bDiscover.body)) {
    throw new Error("Orphan membership crashed discovery");
  }

  bProjects = bDiscover.body as DiscoveredProject[];

  if (findDiscovered(bProjects, orphanProjectId)) {
    throw new Error("Orphan membership must not return phantom project");
  }

  // 18–20: owner-protected APIs remain owner-only; assertProjectOwnedByUser unchanged
  const foreignGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenB },
  );

  if (foreignGet.status !== 404) {
    throw new Error(
      `Active contractor GET project expected 404, got ${foreignGet.status}`,
    );
  }

  const foreignMembers = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
    { idToken: tokenB },
  );

  if (foreignMembers.status !== 404) {
    throw new Error(
      `Active contractor GET members expected 404, got ${foreignMembers.status}`,
    );
  }

  const ownerGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenA },
  );

  if (ownerGet.status !== 200) {
    throw new Error(`Owner GET project expected 200, got ${ownerGet.status}`);
  }

  // Cleanup
  await Promise.all([
    db.collection(COLLECTIONS.projectInvitations).doc(pendingInviteId).delete(),
    db.collection(COLLECTIONS.projectMembers)
      .doc(createProjectMemberId(orphanProjectId, userB.uid))
      .delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(unrelatedProjectId).delete(),
  ]);

  console.log("phase1h cloud project discovery: PASS");
  console.log(
    JSON.stringify({
      remoteProjectId,
      legacyProjectId,
      ownerDiscovers: true,
      legacyOwnerFallback: true,
      activeRolesDiscover: rolesToTest,
      invitedRemovedPendingHidden: true,
      orphanSkipped: true,
      contractorStillDeniedProjectApi: foreignGet.status === 404,
      ownerAccessOk: ownerGet.status === 200,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase1h discovery test failed:");
  console.error(error);
  process.exitCode = 1;
});
