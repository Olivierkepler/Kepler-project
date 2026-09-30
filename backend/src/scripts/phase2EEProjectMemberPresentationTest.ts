/**
 * Phase 2E-E — Project Team read-model presentation enrichment.
 *
 * Covers:
 * A. presentation enrichment preserves canonical membership fields
 * B. displayName/email/avatarUrl when resolvable
 * C. invited/active/removed status unchanged
 * D. no storage path exposed
 * E. chat participant DTO still excludes management semantics
 * F. avatar signing failure degrades to null
 * G–I. live HTTP: owner 200, non-owner 404, unauth 401 (when API available)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import type { ProjectMember } from "../domain/projectMember.js";
import type { UserProfile } from "../domain/userProfile.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import { buildChatParticipantPresentations } from "../services/chat/chatParticipantPresentation.js";
import {
  buildProjectMembersWithPresentation,
  type ProjectMemberWithPresentation,
} from "../services/projectMemberPresentation.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-2ee-member-presentation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

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

function hasStoragePathLeak(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(value, "avatarStoragePath");
}

function makeMember(
  overrides: Partial<ProjectMember> &
    Pick<ProjectMember, "id" | "projectId" | "userId" | "role" | "status">,
): ProjectMember {
  const now = new Date().toISOString();
  return {
    invitedBy: overrides.invitedBy ?? overrides.userId,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<UserProfile> & Pick<UserProfile, "uid">,
): UserProfile {
  const now = new Date().toISOString();
  return {
    displayName: overrides.displayName ?? "",
    email: overrides.email ?? "",
    avatarStoragePath: overrides.avatarStoragePath ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

async function runPresentationUnitTests(): Promise<{
  withNames: number;
  withEmails: number;
  withAvatars: number;
  statuses: Record<string, number>;
}> {
  const projectId = "proj_unit_2ee";
  const ownerUid = "uid_owner_2ee";
  const fieldUid = "uid_field_2ee";
  const invitedUid = "uid_invited_2ee";
  const removedUid = "uid_removed_2ee";
  const missingProfileUid = "uid_missing_2ee";

  const members: ProjectMember[] = [
    makeMember({
      id: createProjectMemberId(projectId, ownerUid),
      projectId,
      userId: ownerUid,
      role: "owner",
      status: "active",
    }),
    makeMember({
      id: createProjectMemberId(projectId, fieldUid),
      projectId,
      userId: fieldUid,
      role: "field_member",
      status: "active",
    }),
    makeMember({
      id: createProjectMemberId(projectId, invitedUid),
      projectId,
      userId: invitedUid,
      role: "viewer",
      status: "invited",
    }),
    makeMember({
      id: createProjectMemberId(projectId, removedUid),
      projectId,
      userId: removedUid,
      role: "contractor",
      status: "removed",
    }),
    makeMember({
      id: createProjectMemberId(projectId, missingProfileUid),
      projectId,
      userId: missingProfileUid,
      role: "field_member",
      status: "active",
    }),
  ];

  const profiles: UserProfile[] = [
    makeProfile({
      uid: ownerUid,
      displayName: "Owner Name",
      email: "owner@example.com",
      avatarStoragePath: null,
    }),
    makeProfile({
      uid: fieldUid,
      displayName: "Field Name",
      email: "field@example.com",
      avatarStoragePath: null,
    }),
    makeProfile({
      uid: invitedUid,
      displayName: "Invited Name",
      email: "invited@example.com",
      avatarStoragePath: null,
    }),
    makeProfile({
      uid: removedUid,
      displayName: "Removed Name",
      email: "removed@example.com",
      avatarStoragePath: null,
    }),
  ];

  const presented = await buildProjectMembersWithPresentation(members, profiles);

  assert(presented.length === members.length, "A: member count preserved");

  for (let i = 0; i < members.length; i += 1) {
    const source = members[i]!;
    const row = presented[i]!;
    assert(row.id === source.id, "B: canonical id preserved");
    assert(row.projectId === source.projectId, "B: projectId preserved");
    assert(row.userId === source.userId, "B: userId preserved");
    assert(row.role === source.role, "B: role preserved");
    assert(row.status === source.status, "E: status preserved");
    assert(row.invitedBy === source.invitedBy, "B: invitedBy preserved");
    assert(row.createdAt === source.createdAt, "B: createdAt preserved");
    assert(row.updatedAt === source.updatedAt, "B: updatedAt preserved");
    assert(!hasStoragePathLeak(row), "F: no avatarStoragePath leak");
  }

  assert(presented[0]!.displayName === "Owner Name", "C: owner displayName");
  assert(presented[0]!.email === "owner@example.com", "C: owner email");
  assert(presented[0]!.avatarUrl === null, "C: null avatar when no path");

  assert(presented[1]!.displayName === "Field Name", "C: field displayName");
  assert(presented[1]!.email === "field@example.com", "C: field email");

  assert(presented[2]!.status === "invited", "E: invited unchanged");
  assert(presented[2]!.displayName === "Invited Name", "C: invited name");

  assert(presented[3]!.status === "removed", "E: removed unchanged");
  assert(presented[3]!.displayName === "Removed Name", "C: removed name");

  assert(presented[4]!.displayName === null, "C: missing profile → null name");
  assert(presented[4]!.email === null, "C: missing profile → null email");
  assert(presented[4]!.avatarUrl === null, "C: missing profile → null avatar");

  // Avatar failure must not fail the whole enrichment batch.
  const failingProfiles: UserProfile[] = [
    makeProfile({
      uid: fieldUid,
      displayName: "Field Name",
      email: "field@example.com",
      avatarStoragePath: "",
    }),
  ];
  const resilient = await buildProjectMembersWithPresentation(
    [members[1]!],
    failingProfiles,
  );
  assert(resilient.length === 1, "I: list survives empty avatar path");
  assert(resilient[0]!.avatarUrl === null, "I: empty path → null avatar");
  assert(resilient[0]!.displayName === "Field Name", "I: name still returned");
  assert(resilient[0]!.status === "active", "I: authz/status unchanged");

  // Chat presentation reuses the same resolver and stays chat-shaped.
  const chat = await buildChatParticipantPresentations({
    members: members.filter((member) => member.status === "active"),
    profiles,
  });
  assert(
    chat.every((item) => !("status" in item)),
    "G: chat DTO has no membership status",
  );
  assert(
    chat.every((item) => !hasStoragePathLeak(item)),
    "F: chat DTO has no storage path",
  );
  assert(
    chat.every((item) => typeof item.projectMemberId === "string"),
    "G: chat DTO keeps projectMemberId",
  );

  const statuses: Record<string, number> = {};
  for (const row of presented) {
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
  }

  return {
    withNames: presented.filter((row) => Boolean(row.displayName)).length,
    withEmails: presented.filter((row) => Boolean(row.email)).length,
    withAvatars: presented.filter((row) => Boolean(row.avatarUrl)).length,
    statuses,
  };
}

function isMemberPresentationRow(
  value: unknown,
): value is ProjectMemberWithPresentation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.projectId === "string" &&
    typeof record.userId === "string" &&
    typeof record.role === "string" &&
    typeof record.status === "string" &&
    typeof record.invitedBy === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.displayName === null || typeof record.displayName === "string") &&
    (record.email === null || typeof record.email === "string") &&
    (record.avatarUrl === null || typeof record.avatarUrl === "string") &&
    !("avatarStoragePath" in record)
  );
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

async function listMessageable(
  baseUrl: string,
  idToken: string,
  projectId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/conversations/messageable-members`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
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
      name: "Phase 2E-E Member Presentation",
      location: "Boston, MA",
      status: "active",
      progress: 0,
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

async function runLiveHttpTests(): Promise<{
  ran: boolean;
  ownerStatus?: number;
  nonOwnerStatus?: number;
  unauthStatus?: number;
  memberCount?: number;
  withNames?: number;
  withEmails?: number;
  withAvatars?: number;
  messageableStatus?: number;
  messageableExcludesCaller?: boolean;
}> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";

  try {
    await fetch(`${baseUrl}/api/me/profile`, { method: "GET" });
  } catch {
    return { ran: false };
  }

  const apiKey = loadWebApiKey();
  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);
  const passwordA = `phase2ee-a-${Date.now()}-Xx9!`;
  const passwordB = `phase2ee-b-${Date.now()}-Yy8!`;
  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const expectedRemoteId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const expectedMemberId = createProjectMemberId(expectedRemoteId, userA.uid);
  const fieldMemberId = createProjectMemberId(expectedRemoteId, userB.uid);

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(expectedRemoteId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(expectedMemberId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(fieldMemberId).delete(),
  ]);

  // Ensure profiles exist for presentation fields (no avatar path).
  const now = new Date().toISOString();
  await db
    .collection(COLLECTIONS.userProfiles)
    .doc(userA.uid)
    .set(
      {
        uid: userA.uid,
        displayName: "Phase 2EE Owner",
        email: EMAIL_A,
        avatarStoragePath: null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  await db
    .collection(COLLECTIONS.userProfiles)
    .doc(userB.uid)
    .set(
      {
        uid: userB.uid,
        displayName: "Phase 2EE Field",
        email: EMAIL_B,
        avatarStoragePath: null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const created = await bootstrap(baseUrl, tokenA);
  assert(
    created.status === 201 || created.status === 200,
    `bootstrap expected 201/200, got ${created.status}`,
  );

  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(fieldMemberId)
    .set(
      {
        id: fieldMemberId,
        projectId: created.id,
        userId: userB.uid,
        role: "field_member",
        status: "active",
        invitedBy: userA.uid,
        createdAt: now,
        updatedAt: now,
      },
      { merge: false },
    );

  const ownerMembers = await listMembers(baseUrl, tokenA, created.id);
  assert(ownerMembers.status === 200, `A: owner /members 200, got ${ownerMembers.status}`);
  assert(Array.isArray(ownerMembers.body), "A: owner /members returns array");
  const rows = ownerMembers.body as unknown[];
  assert(rows.length >= 2, "A: owner sees seeded members");
  assert(
    rows.every(isMemberPresentationRow),
    "B/C: rows preserve canonical fields + optional presentation",
  );
  assert(
    rows.every((row) => !hasStoragePathLeak(row)),
    "F: live response has no storage path",
  );

  const withNames = rows.filter(
    (row) =>
      typeof (row as ProjectMemberWithPresentation).displayName === "string" &&
      Boolean((row as ProjectMemberWithPresentation).displayName),
  ).length;
  const withEmails = rows.filter(
    (row) =>
      typeof (row as ProjectMemberWithPresentation).email === "string" &&
      Boolean((row as ProjectMemberWithPresentation).email),
  ).length;
  const withAvatars = rows.filter(
    (row) =>
      typeof (row as ProjectMemberWithPresentation).avatarUrl === "string" &&
      Boolean((row as ProjectMemberWithPresentation).avatarUrl),
  ).length;
  assert(withNames >= 2, "C: presentation names returned when profiles exist");
  assert(withEmails >= 2, "C: presentation emails returned when profiles exist");

  const nonOwner = await listMembers(baseUrl, tokenB, created.id);
  assert(
    nonOwner.status === 404,
    `D: non-owner /members remains 404, got ${nonOwner.status}`,
  );

  const unauth = await listMembers(baseUrl, null, created.id);
  assert(unauth.status === 401, `D: unauth /members 401, got ${unauth.status}`);

  const messageable = await listMessageable(baseUrl, tokenA, created.id);
  assert(
    messageable.status === 200,
    `G: messageable-members 200, got ${messageable.status}`,
  );
  assert(Array.isArray(messageable.body), "G: messageable returns array");
  const messageableRows = messageable.body as Array<Record<string, unknown>>;
  const excludesCaller = messageableRows.every(
    (row) => row.userId !== userA.uid && row.projectMemberId !== expectedMemberId,
  );
  assert(excludesCaller, "H: messageable-members still excludes caller");
  assert(
    messageableRows.every((row) => !("status" in row)),
    "G: messageable DTO unchanged (no status)",
  );

  // Cleanup seeded field membership + project leftovers for this local id.
  await Promise.all([
    db.collection(COLLECTIONS.projectMembers).doc(fieldMemberId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(expectedMemberId).delete(),
    db.collection(COLLECTIONS.projects).doc(expectedRemoteId).delete(),
  ]);

  return {
    ran: true,
    ownerStatus: ownerMembers.status,
    nonOwnerStatus: nonOwner.status,
    unauthStatus: unauth.status,
    memberCount: rows.length,
    withNames,
    withEmails,
    withAvatars,
    messageableStatus: messageable.status,
    messageableExcludesCaller: excludesCaller,
  };
}

async function main(): Promise<void> {
  const unit = await runPresentationUnitTests();

  let live: Awaited<ReturnType<typeof runLiveHttpTests>> & {
    skipReason?: string;
  };
  try {
    live = await runLiveHttpTests();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "live http unavailable";
    live = {
      ran: false,
      skipReason: message.includes("insufficient permission")
        ? "firebase_admin_insufficient_permission"
        : "live_http_unavailable",
    };
  }

  console.log("phase2ee project member presentation: PASS");
  console.log(
    JSON.stringify({
      unit,
      live,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase2ee project member presentation failed:");
  console.error(error);
  process.exitCode = 1;
});
