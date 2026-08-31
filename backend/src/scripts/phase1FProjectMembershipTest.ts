import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMember } from "../domain/projectMember.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-1f-membership";

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
): Promise<{ status: number; id: string; ownerUid: string }> {
  const response = await fetch(`${baseUrl}/api/projects/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 1F Membership Project",
      location: "Boston, MA",
      status: "active",
      progress: 10,
      openDeltas: 0,
      assignedTasks: 0,
    }),
  });

  const payload = (await response.json()) as {
    id?: string;
    ownerUid?: string;
  };

  if (typeof payload.id !== "string" || typeof payload.ownerUid !== "string") {
    throw new Error(`Unexpected bootstrap payload (status ${response.status})`);
  }

  return {
    status: response.status,
    id: payload.id,
    ownerUid: payload.ownerUid,
  };
}

async function listMembers(
  baseUrl: string,
  idToken: string | null,
  projectId: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/members`,
    { headers },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

async function getOwnedProject(
  baseUrl: string,
  idToken: string,
  projectId: string,
): Promise<number> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  return response.status;
}

function assertOwnerMember(
  member: ProjectMember,
  remoteProjectId: string,
  ownerUid: string,
): void {
  const expectedId = createProjectMemberId(remoteProjectId, ownerUid);

  if (member.id !== expectedId) {
    throw new Error(`Expected member id ${expectedId}, got ${member.id}`);
  }
  if (member.projectId !== remoteProjectId) {
    throw new Error("member.projectId mismatch");
  }
  if (member.userId !== ownerUid) {
    throw new Error("member.userId must equal project.ownerUid");
  }
  if (member.role !== "owner") {
    throw new Error(`Expected role owner, got ${member.role}`);
  }
  if (member.status !== "active") {
    throw new Error(`Expected status active, got ${member.status}`);
  }
  if (member.invitedBy !== ownerUid) {
    throw new Error("member.invitedBy must equal ownerUid");
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase1f-a-${Date.now()}-Xx9!`;
  const passwordB = `phase1f-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const expectedRemoteId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const expectedMemberId = createProjectMemberId(expectedRemoteId, userA.uid);

  // Clean prior Phase 1F docs for this local project id / owner pair only.
  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(expectedRemoteId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(expectedMemberId).delete(),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const created = await bootstrap(baseUrl, tokenA);
  if (created.status !== 201) {
    throw new Error(`Expected 201 create, got ${created.status}`);
  }
  if (created.id !== expectedRemoteId || created.ownerUid !== userA.uid) {
    throw new Error("Bootstrap remote id / ownerUid mismatch");
  }

  const membersAfterCreate = await listMembers(baseUrl, tokenA, created.id);
  if (membersAfterCreate.status !== 200) {
    throw new Error(
      `Owner GET members expected 200, got ${membersAfterCreate.status}`,
    );
  }
  if (!Array.isArray(membersAfterCreate.body)) {
    throw new Error("Owner GET members must return an array");
  }
  if (membersAfterCreate.body.length !== 1) {
    throw new Error(
      `Expected exactly one owner membership, got ${membersAfterCreate.body.length}`,
    );
  }
  assertOwnerMember(
    membersAfterCreate.body[0] as ProjectMember,
    created.id,
    userA.uid,
  );

  const firestoreMember = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(expectedMemberId)
    .get();
  if (!firestoreMember.exists) {
    throw new Error("Owner membership document missing in Firestore");
  }

  const repeat = await bootstrap(baseUrl, tokenA);
  if (repeat.status !== 200) {
    throw new Error(`Expected 200 on repeat bootstrap, got ${repeat.status}`);
  }

  const membersAfterRepeat = await listMembers(baseUrl, tokenA, created.id);
  if (membersAfterRepeat.status !== 200 || !Array.isArray(membersAfterRepeat.body)) {
    throw new Error("Repeat bootstrap membership list failed");
  }
  if (membersAfterRepeat.body.length !== 1) {
    throw new Error(
      `Repeat bootstrap created duplicates: ${membersAfterRepeat.body.length}`,
    );
  }
  assertOwnerMember(
    membersAfterRepeat.body[0] as ProjectMember,
    created.id,
    userA.uid,
  );

  const foreignMembers = await listMembers(baseUrl, tokenB, created.id);
  if (foreignMembers.status !== 404) {
    throw new Error(
      `Foreign user GET members expected 404, got ${foreignMembers.status}`,
    );
  }

  const unauthMembers = await listMembers(baseUrl, null, created.id);
  if (unauthMembers.status !== 401) {
    throw new Error(
      `Unauthenticated GET members expected 401, got ${unauthMembers.status}`,
    );
  }

  // Membership alone must not grant general project access for foreign user.
  // Seed a fake foreign membership pointing at A's project, then verify deny.
  const foreignMemberId = createProjectMemberId(created.id, userB.uid);
  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(foreignMemberId)
    .set(
      {
        id: foreignMemberId,
        projectId: created.id,
        userId: userB.uid,
        role: "contractor",
        status: "active",
        invitedBy: userA.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: false },
    );

  const foreignProjectGet = await getOwnedProject(baseUrl, tokenB, created.id);
  if (foreignProjectGet !== 404) {
    throw new Error(
      `Foreign user with ProjectMember still must get 404 on GET project, got ${foreignProjectGet}`,
    );
  }

  const foreignMembersWithRow = await listMembers(baseUrl, tokenB, created.id);
  if (foreignMembersWithRow.status !== 404) {
    throw new Error(
      `Foreign member GET /members must still be 404, got ${foreignMembersWithRow.status}`,
    );
  }

  // Remove seeded foreign membership before lazy-ensure checks.
  await db.collection(COLLECTIONS.projectMembers).doc(foreignMemberId).delete();

  // Lazy ensure for pre-1F projects: project without membership, then bootstrap.
  await db.collection(COLLECTIONS.projectMembers).doc(expectedMemberId).delete();
  const lazyBootstrap = await bootstrap(baseUrl, tokenA);
  if (lazyBootstrap.status !== 200) {
    throw new Error(`Expected 200 lazy bootstrap, got ${lazyBootstrap.status}`);
  }
  const membersAfterLazy = await listMembers(baseUrl, tokenA, created.id);
  if (
    membersAfterLazy.status !== 200 ||
    !Array.isArray(membersAfterLazy.body) ||
    membersAfterLazy.body.length !== 1
  ) {
    throw new Error("Lazy owner membership ensure via bootstrap failed");
  }
  assertOwnerMember(
    membersAfterLazy.body[0] as ProjectMember,
    created.id,
    userA.uid,
  );

  console.log("phase1f cloud project membership: PASS");
  console.log(
    JSON.stringify({
      localProjectId: LOCAL_PROJECT_ID,
      remoteProjectId: created.id,
      memberDocId: expectedMemberId,
      createStatus: created.status,
      repeatStatus: repeat.status,
      ownerMemberCount: 1,
      foreignGetMembers: foreignMembers.status,
      unauthGetMembers: unauthMembers.status,
      foreignGetProjectWithMember: foreignProjectGet,
      ownerUidAuthoritative: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase1f membership test failed:");
  console.error(error);
  process.exitCode = 1;
});
