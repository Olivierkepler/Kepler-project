import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectInvitation } from "../domain/projectInvitation.js";
import type { ProjectMember } from "../domain/projectMember.js";
import { normalizeInvitationEmail } from "../validation/projectInvitation.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-1g-invitations";

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

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase1g-a-${Date.now()}-Xx9!`;
  const passwordB = `phase1g-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const ownerMemberId = createProjectMemberId(remoteProjectId, userA.uid);
  const contractorMemberId = createProjectMemberId(remoteProjectId, userB.uid);

  // Cleanup prior Phase 1G docs for this project.
  const priorInvites = await db
    .collection(COLLECTIONS.projectInvitations)
    .where("projectId", "==", remoteProjectId)
    .get();

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(ownerMemberId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(contractorMemberId).delete(),
    ...priorInvites.docs.map((doc) => doc.ref.delete()),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  const bootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 1G Invitation Project",
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

  const project = bootstrap.body as { id: string; ownerUid: string };

  if (project.id !== remoteProjectId || project.ownerUid !== userA.uid) {
    throw new Error("Bootstrap project identity mismatch");
  }

  // 4–5: owner role / arbitrary role rejected
  const ownerRoleInvite = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: tokenA,
      body: { email: EMAIL_B, role: "owner" },
    },
  );

  if (ownerRoleInvite.status !== 400) {
    throw new Error(`Owner role invite expected 400, got ${ownerRoleInvite.status}`);
  }

  const arbitraryRoleInvite = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: tokenA,
      body: { email: EMAIL_B, role: "superadmin" },
    },
  );

  if (arbitraryRoleInvite.status !== 400) {
    throw new Error(
      `Arbitrary role invite expected 400, got ${arbitraryRoleInvite.status}`,
    );
  }

  // 6–7: foreign / unauth cannot create
  const foreignCreate = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: tokenB,
      body: { email: EMAIL_B, role: "contractor" },
    },
  );

  if (foreignCreate.status !== 404) {
    throw new Error(`Foreign create expected 404, got ${foreignCreate.status}`);
  }

  const unauthCreate = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: null,
      body: { email: EMAIL_B, role: "contractor" },
    },
  );

  if (unauthCreate.status !== 401) {
    throw new Error(`Unauth create expected 401, got ${unauthCreate.status}`);
  }

  // 1–3: owner creates invitation; email normalized; invitedBy = owner
  const createInvite = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: tokenA,
      body: { email: `  ${EMAIL_B.toUpperCase()}  `, role: "contractor" },
    },
  );

  if (createInvite.status !== 201) {
    throw new Error(`Create invite expected 201, got ${createInvite.status}`);
  }

  const invitation = createInvite.body as ProjectInvitation;
  const expectedEmail = normalizeInvitationEmail(EMAIL_B);

  if (invitation.email !== expectedEmail) {
    throw new Error(`Email not normalized: ${invitation.email}`);
  }

  if (invitation.invitedBy !== userA.uid) {
    throw new Error("invitedBy must equal authenticated owner uid");
  }

  if (invitation.projectId !== remoteProjectId || invitation.status !== "pending") {
    throw new Error("Invitation projectId/status mismatch");
  }

  if (invitation.role !== "contractor") {
    throw new Error("Invitation role mismatch");
  }

  // 8: duplicate pending prevented
  const duplicateInvite = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    {
      method: "POST",
      idToken: tokenA,
      body: { email: EMAIL_B, role: "viewer" },
    },
  );

  if (duplicateInvite.status !== 409) {
    throw new Error(`Duplicate invite expected 409, got ${duplicateInvite.status}`);
  }

  // Owner list
  const ownerList = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/invitations`,
    { idToken: tokenA },
  );

  if (ownerList.status !== 200 || !Array.isArray(ownerList.body)) {
    throw new Error("Owner invitation list failed");
  }

  if ((ownerList.body as ProjectInvitation[]).length !== 1) {
    throw new Error("Owner list should contain exactly one invitation");
  }

  // 9–10: recipient discovery; other user cannot see it
  const myInvitesB = await apiJson(baseUrl, "/api/me/invitations", {
    idToken: tokenB,
  });

  if (myInvitesB.status !== 200 || !Array.isArray(myInvitesB.body)) {
    throw new Error("Recipient invitation discovery failed");
  }

  const pendingForB = myInvitesB.body as ProjectInvitation[];

  if (!pendingForB.some((item) => item.id === invitation.id)) {
    throw new Error("Recipient did not discover their pending invitation");
  }

  const myInvitesA = await apiJson(baseUrl, "/api/me/invitations", {
    idToken: tokenA,
  });

  if (myInvitesA.status !== 200 || !Array.isArray(myInvitesA.body)) {
    throw new Error("Owner me/invitations failed");
  }

  if (
    (myInvitesA.body as ProjectInvitation[]).some(
      (item) => item.id === invitation.id,
    )
  ) {
    throw new Error("Owner must not discover invitation addressed to B");
  }

  // 17: wrong-email user cannot accept
  const wrongAccept = await apiJson(
    baseUrl,
    `/api/invitations/${encodeURIComponent(invitation.id)}/accept`,
    { method: "POST", idToken: tokenA },
  );

  if (wrongAccept.status !== 403) {
    throw new Error(`Wrong-email accept expected 403, got ${wrongAccept.status}`);
  }

  // 11–16: correct recipient accepts
  const accept = await apiJson(
    baseUrl,
    `/api/invitations/${encodeURIComponent(invitation.id)}/accept`,
    { method: "POST", idToken: tokenB },
  );

  if (accept.status !== 200) {
    throw new Error(`Accept expected 200, got ${accept.status}`);
  }

  const acceptBody = accept.body as {
    member: ProjectMember;
    invitation: ProjectInvitation;
  };

  if (acceptBody.member.userId !== userB.uid) {
    throw new Error("Accepted member.userId mismatch");
  }

  if (acceptBody.member.role !== "contractor") {
    throw new Error("Accepted member.role must come from invitation");
  }

  if (acceptBody.member.invitedBy !== userA.uid) {
    throw new Error("Accepted member.invitedBy mismatch");
  }

  if (acceptBody.member.status !== "active") {
    throw new Error("Accepted member must be active");
  }

  if (acceptBody.invitation.status !== "accepted") {
    throw new Error("Invitation must become accepted");
  }

  if (acceptBody.invitation.acceptedByUserId !== userB.uid) {
    throw new Error("acceptedByUserId mismatch");
  }

  const membersSnap = await db
    .collection(COLLECTIONS.projectMembers)
    .where("projectId", "==", remoteProjectId)
    .get();

  const contractorMembers = membersSnap.docs
    .map((doc) => doc.data() as ProjectMember)
    .filter((item) => item.userId === userB.uid);

  if (contractorMembers.length !== 1) {
    throw new Error(
      `Expected exactly one membership for B, got ${contractorMembers.length}`,
    );
  }

  // 18: already accepted does not create duplicate
  const acceptAgain = await apiJson(
    baseUrl,
    `/api/invitations/${encodeURIComponent(invitation.id)}/accept`,
    { method: "POST", idToken: tokenB },
  );

  if (acceptAgain.status !== 409) {
    throw new Error(`Re-accept expected 409, got ${acceptAgain.status}`);
  }

  const membersAfterReaccept = await db
    .collection(COLLECTIONS.projectMembers)
    .where("projectId", "==", remoteProjectId)
    .get();

  const contractorAfterReaccept = membersAfterReaccept.docs
    .map((doc) => doc.data() as ProjectMember)
    .filter((item) => item.userId === userB.uid);

  if (contractorAfterReaccept.length !== 1) {
    throw new Error("Re-accept created duplicate membership");
  }

  // 21: accepted membership still cannot access owner-protected project APIs
  const foreignProjectGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenB },
  );

  if (foreignProjectGet.status !== 404) {
    throw new Error(
      `Member GET project expected 404, got ${foreignProjectGet.status}`,
    );
  }

  const foreignMembersGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
    { idToken: tokenB },
  );

  if (foreignMembersGet.status !== 404) {
    throw new Error(
      `Member GET members expected 404, got ${foreignMembersGet.status}`,
    );
  }

  // 22: owner access continues
  const ownerProjectGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenA },
  );

  if (ownerProjectGet.status !== 200) {
    throw new Error(`Owner GET project expected 200, got ${ownerProjectGet.status}`);
  }

  // 19: removed membership is not silently reactivated
  await db.collection(COLLECTIONS.projectMembers).doc(contractorMemberId).set(
    {
      id: contractorMemberId,
      projectId: remoteProjectId,
      userId: userB.uid,
      role: "contractor",
      status: "removed",
      invitedBy: userA.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: false },
  );

  // Prior invitation is accepted — create a fresh invite after deleting blocking accepted row
  // by marking a new email path: use decline+reinvite pattern via direct write of pending invite
  // after removing accepted invite's blocking effect — accepted still blocks create.
  // Directly seed a new pending invitation for the removed-membership case.
  const removedCaseInviteId = `project-invitation-removed-${Date.now()}`;
  await db
    .collection(COLLECTIONS.projectInvitations)
    .doc(removedCaseInviteId)
    .set(
      {
        id: removedCaseInviteId,
        projectId: remoteProjectId,
        email: expectedEmail,
        role: "field_member",
        status: "pending",
        invitedBy: userA.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acceptedByUserId: null,
      },
      { merge: false },
    );

  // Note: normally addProjectInvitationIfAbsent would block because accepted invite exists.
  // This seeded pending invite is intentional for the removed-membership accept path only.
  const acceptRemoved = await apiJson(
    baseUrl,
    `/api/invitations/${encodeURIComponent(removedCaseInviteId)}/accept`,
    { method: "POST", idToken: tokenB },
  );

  if (acceptRemoved.status !== 409) {
    throw new Error(
      `Accept with removed membership expected 409, got ${acceptRemoved.status}`,
    );
  }

  const memberAfterRemovedAttempt = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(contractorMemberId)
    .get();

  if ((memberAfterRemovedAttempt.data() as ProjectMember).status !== "removed") {
    throw new Error("Removed membership was mutated during accept");
  }

  // 20: decline — use a separate email-path via direct pending invite for EMAIL_A as invitee
  // Owner cannot be invitee of own pending for decline with tokenA matching invitation email.
  const declineInviteId = `project-invitation-decline-${Date.now()}`;
  await db
    .collection(COLLECTIONS.projectInvitations)
    .doc(declineInviteId)
    .set(
      {
        id: declineInviteId,
        projectId: remoteProjectId,
        email: normalizeInvitationEmail(EMAIL_A),
        role: "viewer",
        status: "pending",
        invitedBy: userB.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        acceptedByUserId: null,
      },
      { merge: false },
    );

  const decline = await apiJson(
    baseUrl,
    `/api/invitations/${encodeURIComponent(declineInviteId)}/decline`,
    { method: "POST", idToken: tokenA },
  );

  if (decline.status !== 200) {
    throw new Error(`Decline expected 200, got ${decline.status}`);
  }

  if ((decline.body as ProjectInvitation).status !== "declined") {
    throw new Error("Decline did not set status declined");
  }

  const memberForA = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(createProjectMemberId(remoteProjectId, userA.uid))
    .get();

  // Owner member may exist from bootstrap; ensure decline did not create a viewer membership.
  if (memberForA.exists) {
    const ownerMember = memberForA.data() as ProjectMember;
    if (ownerMember.role !== "owner") {
      throw new Error("Decline incorrectly altered owner membership role");
    }
  }

  // Cleanup seeded docs
  await Promise.all([
    db.collection(COLLECTIONS.projectInvitations).doc(removedCaseInviteId).delete(),
    db.collection(COLLECTIONS.projectInvitations).doc(declineInviteId).delete(),
  ]);

  console.log("phase1g cloud project invitations: PASS");
  console.log(
    JSON.stringify({
      remoteProjectId,
      invitationId: invitation.id,
      normalizedEmail: expectedEmail,
      invitedBy: invitation.invitedBy,
      acceptMemberUserId: acceptBody.member.userId,
      acceptMemberRole: acceptBody.member.role,
      invitationStatus: acceptBody.invitation.status,
      memberStillDeniedProjectAccess: foreignProjectGet.status === 404,
      ownerAccessOk: ownerProjectGet.status === 200,
      declineImplemented: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("phase1g invitation test failed:");
  console.error(error);
  process.exitCode = 1;
});
