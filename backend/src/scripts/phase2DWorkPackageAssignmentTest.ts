import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import type { WorkPackage } from "../domain/workPackage.js";
import type { WorkPackageAssignment } from "../domain/workPackageAssignment.js";
import { createWorkPackageAssignmentIfAbsent } from "../repositories/workPackageAssignmentsRepository.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-2d-assignments";
const LOCAL_ALT_PROJECT_ID = "project-2d-alt";
const LOCAL_LEGACY_ID = "project-2d-legacy";

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
}): Promise<string> {
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

  return id;
}

function assignmentsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/work-package-assignments`;
}

function assignmentPath(projectId: string, assignmentId: string): string {
  return `${assignmentsPath(projectId)}/${encodeURIComponent(assignmentId)}`;
}

function workPackagesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/work-packages`;
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase2d-a-${Date.now()}-Xx9!`;
  const passwordB = `phase2d-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const altProjectId = createRemoteProjectId(userA.uid, LOCAL_ALT_PROJECT_ID);
  const legacyProjectId = createRemoteProjectId(userA.uid, LOCAL_LEGACY_ID);

  const ownerMemberId = createProjectMemberId(remoteProjectId, userA.uid);
  const memberBId = createProjectMemberId(remoteProjectId, userB.uid);
  const altOwnerMemberId = createProjectMemberId(altProjectId, userA.uid);
  const altMemberBId = createProjectMemberId(altProjectId, userB.uid);

  const priorA = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .where("projectId", "==", remoteProjectId)
    .get();
  const priorAlt = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .where("projectId", "==", altProjectId)
    .get();
  const priorLegacy = await db
    .collection(COLLECTIONS.workPackageAssignments)
    .where("projectId", "==", legacyProjectId)
    .get();
  const priorWpA = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", remoteProjectId)
    .get();
  const priorWpAlt = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", altProjectId)
    .get();
  const priorWpLegacy = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", legacyProjectId)
    .get();

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(altProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(ownerMemberId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(memberBId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(altOwnerMemberId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(altMemberBId).delete(),
    ...priorA.docs.map((d) => d.ref.delete()),
    ...priorAlt.docs.map((d) => d.ref.delete()),
    ...priorLegacy.docs.map((d) => d.ref.delete()),
    ...priorWpA.docs.map((d) => d.ref.delete()),
    ...priorWpAlt.docs.map((d) => d.ref.delete()),
    ...priorWpLegacy.docs.map((d) => d.ref.delete()),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  // 1: unauthenticated cannot list
  const unauthList = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    idToken: null,
  });
  if (unauthList.status !== 401) {
    throw new Error(`Unauth list expected 401, got ${unauthList.status}`);
  }

  const bootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_PROJECT_ID,
      name: "Phase 2D Assignment Project",
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

  const altBootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_ALT_PROJECT_ID,
      name: "Phase 2D Alt Project",
      location: "Cambridge, MA",
      status: "active",
      progress: 0,
      openDeltas: 0,
      assignedTasks: 0,
    },
  });
  if (altBootstrap.status !== 201 && altBootstrap.status !== 200) {
    throw new Error(`Alt bootstrap failed (${altBootstrap.status})`);
  }

  const createWp = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: { name: "Electrical Rough-In", status: "ready" },
  });
  if (createWp.status !== 201) {
    throw new Error(`Create WorkPackage expected 201, got ${createWp.status}`);
  }
  const workPackage = createWp.body as WorkPackage;

  const createAltWp = await apiJson(baseUrl, workPackagesPath(altProjectId), {
    method: "POST",
    idToken: tokenA,
    body: { name: "Alt Scope" },
  });
  if (createAltWp.status !== 201) {
    throw new Error(`Alt WP create expected 201, got ${createAltWp.status}`);
  }
  const altWorkPackage = createAltWp.body as WorkPackage;

  // Ensure owner membership id from bootstrap
  const ownerId = createProjectMemberId(remoteProjectId, userA.uid);

  // 2: owner can list
  const ownerList = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    idToken: tokenA,
  });
  if (ownerList.status !== 200 || !Array.isArray(ownerList.body)) {
    throw new Error(`Owner list expected 200 array, got ${ownerList.status}`);
  }

  // Seed ACTIVE contractor for create success path
  const activeMemberId = await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });

  // 10 + 21–25: owner create with canonical identities, no userId
  const createOk = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      workPackageId: workPackage.id,
      projectMemberId: activeMemberId,
    },
  });
  if (createOk.status !== 201) {
    throw new Error(`Owner create expected 201, got ${createOk.status}`);
  }
  const assignment = createOk.body as WorkPackageAssignment & {
    userId?: string;
  };
  if (assignment.projectId !== remoteProjectId) {
    throw new Error("22: projectId must be canonical remote Project id");
  }
  if (assignment.workPackageId !== workPackage.id) {
    throw new Error("23: workPackageId must be canonical WorkPackage id");
  }
  if (assignment.projectMemberId !== activeMemberId) {
    throw new Error("24: projectMemberId must be canonical ProjectMember id");
  }
  if ("userId" in assignment && assignment.userId !== undefined) {
    throw new Error("25: Assignment must not contain userId");
  }
  if (assignment.status !== "assigned") {
    throw new Error("Default status should be assigned");
  }

  // 26–27: duplicate active rejected
  const createDup = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      workPackageId: workPackage.id,
      projectMemberId: activeMemberId,
    },
  });
  if (createDup.status !== 409) {
    throw new Error(`Duplicate active expected 409, got ${createDup.status}`);
  }

  // 28: concurrent duplicate creation → at most one active
  await apiJson(baseUrl, assignmentPath(remoteProjectId, assignment.id), {
    method: "DELETE",
    idToken: tokenA,
  });

  const concurrent = await Promise.all([
    createWorkPackageAssignmentIfAbsent({
      projectId: remoteProjectId,
      workPackageId: workPackage.id,
      projectMemberId: activeMemberId,
      status: "assigned",
    }),
    createWorkPackageAssignmentIfAbsent({
      projectId: remoteProjectId,
      workPackageId: workPackage.id,
      projectMemberId: activeMemberId,
      status: "assigned",
    }),
  ]);

  const concurrentCreated = concurrent.filter((r) => r.created);
  if (concurrentCreated.length !== 1) {
    throw new Error(
      `28: concurrent creates expected exactly 1 success, got ${concurrentCreated.length}`,
    );
  }
  const concurrentAssignment = concurrentCreated[0]!.assignment;

  // Role write denial + ACTIVE read (3–6, 11–14, 40)
  const activeRoles: ProjectMemberRole[] = [
    "project_admin",
    "contractor",
    "field_member",
    "viewer",
  ];

  for (const role of activeRoles) {
    await seedMember({
      projectId: remoteProjectId,
      userId: userB.uid,
      role,
      status: "active",
      invitedBy: userA.uid,
    });

    const listAsMember = await apiJson(
      baseUrl,
      assignmentsPath(remoteProjectId),
      { idToken: tokenB },
    );
    if (listAsMember.status !== 200) {
      throw new Error(
        `ACTIVE ${role} list expected 200, got ${listAsMember.status}`,
      );
    }

    const createAsMember = await apiJson(
      baseUrl,
      assignmentsPath(remoteProjectId),
      {
        method: "POST",
        idToken: tokenB,
        body: {
          workPackageId: workPackage.id,
          projectMemberId: ownerId,
        },
      },
    );
    if (createAsMember.status !== 404) {
      throw new Error(
        `ACTIVE ${role} create expected 404, got ${createAsMember.status}`,
      );
    }

    const patchAsMember = await apiJson(
      baseUrl,
      assignmentPath(remoteProjectId, concurrentAssignment.id),
      {
        method: "PATCH",
        idToken: tokenB,
        body: { status: "accepted" },
      },
    );
    if (patchAsMember.status !== 404) {
      throw new Error(
        `ACTIVE ${role} patch expected 404, got ${patchAsMember.status}`,
      );
    }

    const deleteAsMember = await apiJson(
      baseUrl,
      assignmentPath(remoteProjectId, concurrentAssignment.id),
      { method: "DELETE", idToken: tokenB },
    );
    if (deleteAsMember.status !== 404) {
      throw new Error(
        `ACTIVE ${role} delete expected 404, got ${deleteAsMember.status}`,
      );
    }
  }

  // 7: INVITED cannot list
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "invited",
    invitedBy: userA.uid,
  });
  const invitedList = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    idToken: tokenB,
  });
  if (invitedList.status !== 404) {
    throw new Error(`INVITED list expected 404, got ${invitedList.status}`);
  }

  // 8: REMOVED cannot list
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "removed",
    invitedBy: userA.uid,
  });
  const removedList = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    idToken: tokenB,
  });
  if (removedList.status !== 404) {
    throw new Error(`REMOVED list expected 404, got ${removedList.status}`);
  }

  // 9: unrelated cannot list
  await db.collection(COLLECTIONS.projectMembers).doc(memberBId).delete();
  const unrelatedList = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    { idToken: tokenB },
  );
  if (unrelatedList.status !== 404) {
    throw new Error(`Unrelated list expected 404, got ${unrelatedList.status}`);
  }

  // Referential integrity 15–20
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });

  // Cancel current so integrity creates don't hit duplicate
  await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, concurrentAssignment.id),
    {
      method: "PATCH",
      idToken: tokenA,
      body: { status: "cancelled" },
    },
  );

  const missingWp = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      workPackageId: "work-package-missing-2d",
      projectMemberId: activeMemberId,
    },
  });
  if (missingWp.status !== 400) {
    throw new Error(`15: missing WP expected 400, got ${missingWp.status}`);
  }

  const wrongProjectWp = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: altWorkPackage.id,
        projectMemberId: activeMemberId,
      },
    },
  );
  if (wrongProjectWp.status !== 400) {
    throw new Error(
      `16: WP other project expected 400, got ${wrongProjectWp.status}`,
    );
  }

  const missingMember = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: workPackage.id,
        projectMemberId: `${remoteProjectId}_missing-user`,
      },
    },
  );
  if (missingMember.status !== 400) {
    throw new Error(
      `17: missing member expected 400, got ${missingMember.status}`,
    );
  }

  const altMemberId = await seedMember({
    projectId: altProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });

  const wrongProjectMember = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: workPackage.id,
        projectMemberId: altMemberId,
      },
    },
  );
  if (wrongProjectMember.status !== 400) {
    throw new Error(
      `18: member other project expected 400, got ${wrongProjectMember.status}`,
    );
  }

  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "invited",
    invitedBy: userA.uid,
  });
  const invitedAssign = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: workPackage.id,
        projectMemberId: activeMemberId,
      },
    },
  );
  if (invitedAssign.status !== 400) {
    throw new Error(
      `19: INVITED member assign expected 400, got ${invitedAssign.status}`,
    );
  }

  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "removed",
    invitedBy: userA.uid,
  });
  const removedAssign = await apiJson(
    baseUrl,
    assignmentsPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: workPackage.id,
        projectMemberId: activeMemberId,
      },
    },
  );
  if (removedAssign.status !== 400) {
    throw new Error(
      `20: REMOVED member assign expected 400, got ${removedAssign.status}`,
    );
  }

  // 29: cancelled prior permits new assignment
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });
  // concurrentAssignment already cancelled above
  const reassign = await apiJson(baseUrl, assignmentsPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      workPackageId: workPackage.id,
      projectMemberId: activeMemberId,
    },
  });
  if (reassign.status !== 201) {
    throw new Error(
      `29: reassign after cancel expected 201, got ${reassign.status}`,
    );
  }
  const reassigned = reassign.body as WorkPackageAssignment;

  // 30: owner can update status
  const beforePatch = reassigned;
  await new Promise((r) => setTimeout(r, 5));
  const ownerPatch = await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, reassigned.id),
    {
      method: "PATCH",
      idToken: tokenA,
      body: { status: "in_progress" },
    },
  );
  if (ownerPatch.status !== 200) {
    throw new Error(`30: owner patch expected 200, got ${ownerPatch.status}`);
  }
  const patched = ownerPatch.body as WorkPackageAssignment;
  if (patched.status !== "in_progress") {
    throw new Error("30: status not updated");
  }
  if (
    patched.id !== beforePatch.id ||
    patched.projectId !== beforePatch.projectId ||
    patched.workPackageId !== beforePatch.workPackageId ||
    patched.projectMemberId !== beforePatch.projectMemberId
  ) {
    throw new Error("32: relationship IDs must remain immutable");
  }
  if (patched.createdAt !== beforePatch.createdAt) {
    throw new Error("createdAt must remain immutable");
  }
  if (patched.updatedAt === beforePatch.updatedAt) {
    throw new Error("updatedAt must change on status update");
  }

  // 32: relationship IDs in patch body ignored / invalid without status
  const badPatchIds = await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, reassigned.id),
    {
      method: "PATCH",
      idToken: tokenA,
      body: {
        workPackageId: altWorkPackage.id,
        projectMemberId: ownerId,
        projectId: altProjectId,
      },
    },
  );
  if (badPatchIds.status !== 400) {
    throw new Error(
      `32: patch without status expected 400, got ${badPatchIds.status}`,
    );
  }

  // 33: invalid status
  const invalidStatus = await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, reassigned.id),
    {
      method: "PATCH",
      idToken: tokenA,
      body: { status: "declined" },
    },
  );
  if (invalidStatus.status !== 400) {
    throw new Error(
      `33: invalid status expected 400, got ${invalidStatus.status}`,
    );
  }

  // 31 / 35 already covered in role loop; reaffirm foreign
  const foreignPatch = await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, reassigned.id),
    {
      method: "PATCH",
      idToken: tokenB,
      body: { status: "completed" },
    },
  );
  if (foreignPatch.status !== 404) {
    throw new Error(`31: non-owner patch expected 404, got ${foreignPatch.status}`);
  }

  // 34: owner can delete (physical)
  const ownerDelete = await apiJson(
    baseUrl,
    assignmentPath(remoteProjectId, reassigned.id),
    { method: "DELETE", idToken: tokenA },
  );
  if (ownerDelete.status !== 204) {
    throw new Error(`34: owner delete expected 204, got ${ownerDelete.status}`);
  }

  // 36–38: related entities still exist
  const memberStill = await db
    .collection(COLLECTIONS.projectMembers)
    .doc(activeMemberId)
    .get();
  if (!memberStill.exists) {
    throw new Error("36: ProjectMember must not be deleted with assignment");
  }

  const wpStill = await db
    .collection(COLLECTIONS.workPackages)
    .doc(workPackage.id)
    .get();
  if (!wpStill.exists) {
    throw new Error("37: WorkPackage must not be deleted with assignment");
  }

  // PlanItems: none required; confirm WP planItemIds untouched if any
  const wpDoc = wpStill.data() as WorkPackage;
  if (!Array.isArray(wpDoc.planItemIds)) {
    throw new Error("38: WorkPackage.planItemIds must remain intact");
  }

  // 39: legacy owner without ProjectMember can manage assignments
  await db
    .collection(COLLECTIONS.projects)
    .doc(legacyProjectId)
    .set(
      {
        id: legacyProjectId,
        localProjectId: LOCAL_LEGACY_ID,
        ownerUid: userA.uid,
        name: "Phase 2D Legacy Owner Project",
        location: "Somerville, MA",
        status: "planning",
        progress: 0,
        openDeltas: 0,
        assignedTasks: 0,
      },
      { merge: false },
    );

  const legacyWpCreate = await apiJson(
    baseUrl,
    workPackagesPath(legacyProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: { name: "Legacy Scope" },
    },
  );
  if (legacyWpCreate.status !== 201) {
    throw new Error(
      `Legacy WP create expected 201, got ${legacyWpCreate.status}`,
    );
  }
  const legacyWp = legacyWpCreate.body as WorkPackage;

  // Need an ACTIVE member under legacy project to assign
  const legacyMemberId = await seedMember({
    projectId: legacyProjectId,
    userId: userB.uid,
    role: "field_member",
    status: "active",
    invitedBy: userA.uid,
  });

  const legacyAssign = await apiJson(
    baseUrl,
    assignmentsPath(legacyProjectId),
    {
      method: "POST",
      idToken: tokenA,
      body: {
        workPackageId: legacyWp.id,
        projectMemberId: legacyMemberId,
      },
    },
  );
  if (legacyAssign.status !== 201) {
    throw new Error(
      `39: legacy owner assign expected 201, got ${legacyAssign.status}`,
    );
  }
  const legacyAssignment = legacyAssign.body as WorkPackageAssignment;

  // 41: WorkPackage authorization unchanged (member cannot create WP)
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });
  const memberWpCreate = await apiJson(
    baseUrl,
    workPackagesPath(remoteProjectId),
    {
      method: "POST",
      idToken: tokenB,
      body: { name: "Should Fail" },
    },
  );
  if (memberWpCreate.status !== 404) {
    throw new Error(
      `41: WP create by member expected 404, got ${memberWpCreate.status}`,
    );
  }

  // 42: ProjectMember administration unchanged (owner-only)
  const membersAsForeign = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
    { idToken: tokenB },
  );
  if (membersAsForeign.status !== 404) {
    throw new Error(
      `42: members list must remain owner-only, got ${membersAsForeign.status}`,
    );
  }

  // 43: discovery unchanged
  const discovery = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenA,
  });
  if (discovery.status !== 200 || !Array.isArray(discovery.body)) {
    throw new Error("43: /api/me/projects must remain 200 array");
  }

  // 44: project read authorization unchanged
  const projectGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenB },
  );
  if (projectGet.status !== 200) {
    throw new Error(
      `44: ACTIVE member project read expected 200, got ${projectGet.status}`,
    );
  }

  // 45: agent authorization unchanged
  const agentList = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs`,
    { idToken: tokenB },
  );
  if (agentList.status !== 404) {
    throw new Error(
      `45: agent-runs must remain owner-only for members, got ${agentList.status}`,
    );
  }

  // Cleanup
  await Promise.all([
    db
      .collection(COLLECTIONS.workPackageAssignments)
      .doc(concurrentAssignment.id)
      .delete(),
    db
      .collection(COLLECTIONS.workPackageAssignments)
      .doc(legacyAssignment.id)
      .delete(),
    db.collection(COLLECTIONS.workPackages).doc(workPackage.id).delete(),
    db.collection(COLLECTIONS.workPackages).doc(altWorkPackage.id).delete(),
    db.collection(COLLECTIONS.workPackages).doc(legacyWp.id).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(memberBId).delete(),
    db.collection(COLLECTIONS.projectMembers).doc(altMemberBId).delete(),
    db
      .collection(COLLECTIONS.projectMembers)
      .doc(createProjectMemberId(legacyProjectId, userB.uid))
      .delete(),
  ]);

  console.log("Phase 2D WorkPackageAssignment tests passed.");
  console.log(
    JSON.stringify(
      {
        remoteProjectId,
        workPackageId: workPackage.id,
        projectMemberId: activeMemberId,
        assignmentIdSample: concurrentAssignment.id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
