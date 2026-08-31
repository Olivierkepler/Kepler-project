import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { createProjectMemberId } from "../domain/projectMemberId.js";
import { createRemotePlanItemId } from "../domain/planItemId.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import type { ProjectMemberRole } from "../domain/projectMember.js";
import type { WorkPackage } from "../domain/workPackage.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "project-2c-work-packages";
const LOCAL_ALT_PROJECT_ID = "project-2c-alt";
const LOCAL_LEGACY_ID = "project-2c-legacy";
const LOCAL_PLAN_A = "plan-2c-a";
const LOCAL_PLAN_B = "plan-2c-b";
const LOCAL_PLAN_ALT = "plan-2c-alt";

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

function workPackagesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/work-packages`;
}

function workPackagePath(projectId: string, workPackageId: string): string {
  return `${workPackagesPath(projectId)}/${encodeURIComponent(workPackageId)}`;
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:8080";
  const apiKey = loadWebApiKey();

  const userA = await getAuth().getUserByEmail(EMAIL_A);
  const userB = await getAuth().getUserByEmail(EMAIL_B);

  const passwordA = `phase2c-a-${Date.now()}-Xx9!`;
  const passwordB = `phase2c-b-${Date.now()}-Yy8!`;

  await getAuth().updateUser(userA.uid, { password: passwordA });
  await getAuth().updateUser(userB.uid, { password: passwordB });

  const remoteProjectId = createRemoteProjectId(userA.uid, LOCAL_PROJECT_ID);
  const altProjectId = createRemoteProjectId(userA.uid, LOCAL_ALT_PROJECT_ID);
  const legacyProjectId = createRemoteProjectId(userA.uid, LOCAL_LEGACY_ID);

  const remotePlanA = createRemotePlanItemId(remoteProjectId, LOCAL_PLAN_A);
  const remotePlanB = createRemotePlanItemId(remoteProjectId, LOCAL_PLAN_B);
  const remotePlanAlt = createRemotePlanItemId(altProjectId, LOCAL_PLAN_ALT);

  const memberIds = [
    createProjectMemberId(remoteProjectId, userA.uid),
    createProjectMemberId(remoteProjectId, userB.uid),
    createProjectMemberId(altProjectId, userA.uid),
    createProjectMemberId(legacyProjectId, userA.uid),
  ];

  const priorPackages = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", remoteProjectId)
    .get();
  const priorAltPackages = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", altProjectId)
    .get();
  const priorLegacyPackages = await db
    .collection(COLLECTIONS.workPackages)
    .where("projectId", "==", legacyProjectId)
    .get();

  await Promise.all([
    db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(altProjectId).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    ...memberIds.map((id) =>
      db.collection(COLLECTIONS.projectMembers).doc(id).delete(),
    ),
    db.collection(COLLECTIONS.planItems).doc(remotePlanA).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanB).delete(),
    db.collection(COLLECTIONS.planItems).doc(remotePlanAlt).delete(),
    ...priorPackages.docs.map((doc) => doc.ref.delete()),
    ...priorAltPackages.docs.map((doc) => doc.ref.delete()),
    ...priorLegacyPackages.docs.map((doc) => doc.ref.delete()),
  ]);

  const tokenA = await idTokenForEmailPassword(EMAIL_A, passwordA, apiKey);
  const tokenB = await idTokenForEmailPassword(EMAIL_B, passwordB, apiKey);

  // 1: unauthenticated cannot list
  const unauthList = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
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
      name: "Phase 2C Work Package Project",
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

  const altBootstrap = await apiJson(baseUrl, "/api/projects/bootstrap", {
    method: "POST",
    idToken: tokenA,
    body: {
      localProjectId: LOCAL_ALT_PROJECT_ID,
      name: "Phase 2C Alt Project",
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

  // Seed cloud PlanItems (canonical remote ids)
  const planBootstrap = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items/bootstrap`,
    {
      method: "POST",
      idToken: tokenA,
      body: {
        items: [
          {
            localPlanItemId: LOCAL_PLAN_A,
            type: "length",
            label: "WP Plan A",
            plannedValue: 10,
            unit: "ft",
            unitCost: 1,
            productionRatePerDay: 1,
            laborHoursPerUnit: 1,
          },
          {
            localPlanItemId: LOCAL_PLAN_B,
            type: "length",
            label: "WP Plan B",
            plannedValue: 20,
            unit: "ft",
            unitCost: 1,
            productionRatePerDay: 1,
            laborHoursPerUnit: 1,
          },
        ],
      },
    },
  );

  if (planBootstrap.status !== 200) {
    throw new Error(`Plan bootstrap failed (${planBootstrap.status})`);
  }

  const altPlanBootstrap = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(altProjectId)}/plan-items/bootstrap`,
    {
      method: "POST",
      idToken: tokenA,
      body: {
        items: [
          {
            localPlanItemId: LOCAL_PLAN_ALT,
            type: "length",
            label: "WP Plan Alt",
            plannedValue: 5,
            unit: "ft",
            unitCost: 1,
            productionRatePerDay: 1,
            laborHoursPerUnit: 1,
          },
        ],
      },
    },
  );

  if (altPlanBootstrap.status !== 200) {
    throw new Error(`Alt plan bootstrap failed (${altPlanBootstrap.status})`);
  }

  // 2: owner can list
  const ownerList = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    idToken: tokenA,
  });
  if (ownerList.status !== 200) {
    throw new Error(`Owner list expected 200, got ${ownerList.status}`);
  }
  if (!Array.isArray(ownerList.body)) {
    throw new Error("Owner list body must be an array");
  }

  // 10: owner can create (empty planItemIds)
  const createEmpty = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      name: "Electrical Rough-In",
      description: "Rough-in scope",
      status: "ready",
      planItemIds: [],
    },
  });
  if (createEmpty.status !== 201) {
    throw new Error(`Owner create expected 201, got ${createEmpty.status}`);
  }

  const createdEmpty = createEmpty.body as WorkPackage;
  if (createdEmpty.projectId !== remoteProjectId) {
    throw new Error("23: WorkPackage.projectId must be canonical REMOTE id");
  }
  if (!Array.isArray(createdEmpty.planItemIds) || createdEmpty.planItemIds.length !== 0) {
    throw new Error("19: empty planItemIds must be accepted");
  }
  if (createdEmpty.status !== "ready" || createdEmpty.name !== "Electrical Rough-In") {
    throw new Error("Create fields not persisted correctly");
  }

  // 20 + 24: multiple canonical cloud PlanItem ids
  const createMulti = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      name: "Trim Package",
      planItemIds: [remotePlanA, remotePlanB],
    },
  });
  if (createMulti.status !== 201) {
    throw new Error(`Multi planItem create expected 201, got ${createMulti.status}`);
  }
  const createdMulti = createMulti.body as WorkPackage;
  if (
    createdMulti.planItemIds.length !== 2 ||
    !createdMulti.planItemIds.includes(remotePlanA) ||
    !createdMulti.planItemIds.includes(remotePlanB)
  ) {
    throw new Error("20/24: planItemIds must store canonical cloud PlanItem ids");
  }
  if (createdMulti.status !== "draft") {
    throw new Error("Default status on create should be draft");
  }

  // 21: cross-project PlanItem reference rejected
  const crossProject = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      name: "Bad Cross Ref",
      planItemIds: [remotePlanAlt],
    },
  });
  if (crossProject.status !== 400) {
    throw new Error(`Cross-project planItem expected 400, got ${crossProject.status}`);
  }

  // 18: invalid status rejected
  const invalidStatus = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: { name: "Bad Status", status: "declined" },
  });
  if (invalidStatus.status !== 400) {
    throw new Error(`Invalid status expected 400, got ${invalidStatus.status}`);
  }

  // Duplicate planItemIds rejected
  const dupPlanIds = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    method: "POST",
    idToken: tokenA,
    body: {
      name: "Dup Plans",
      planItemIds: [remotePlanA, remotePlanA],
    },
  });
  if (dupPlanIds.status !== 400) {
    throw new Error(`Duplicate planItemIds expected 400, got ${dupPlanIds.status}`);
  }

  // Role read matrix for ACTIVE members (3–6), write denial (11–13, 26)
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
      workPackagesPath(remoteProjectId),
      { idToken: tokenB },
    );
    if (listAsMember.status !== 200) {
      throw new Error(
        `ACTIVE ${role} list expected 200, got ${listAsMember.status}`,
      );
    }

    const createAsMember = await apiJson(
      baseUrl,
      workPackagesPath(remoteProjectId),
      {
        method: "POST",
        idToken: tokenB,
        body: { name: `Should Fail ${role}` },
      },
    );
    if (createAsMember.status !== 404) {
      throw new Error(
        `ACTIVE ${role} create expected 404, got ${createAsMember.status}`,
      );
    }

    const patchAsMember = await apiJson(
      baseUrl,
      workPackagePath(remoteProjectId, createdEmpty.id),
      {
        method: "PATCH",
        idToken: tokenB,
        body: { name: "Hacked" },
      },
    );
    if (patchAsMember.status !== 404) {
      throw new Error(
        `ACTIVE ${role} patch expected 404, got ${patchAsMember.status}`,
      );
    }

    const deleteAsMember = await apiJson(
      baseUrl,
      workPackagePath(remoteProjectId, createdEmpty.id),
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
  const invitedList = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
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
  const removedList = await apiJson(baseUrl, workPackagesPath(remoteProjectId), {
    idToken: tokenB,
  });
  if (removedList.status !== 404) {
    throw new Error(`REMOVED list expected 404, got ${removedList.status}`);
  }

  // 9: unrelated authenticated user cannot list
  await db
    .collection(COLLECTIONS.projectMembers)
    .doc(createProjectMemberId(remoteProjectId, userB.uid))
    .delete();
  const unrelatedList = await apiJson(
    baseUrl,
    workPackagesPath(remoteProjectId),
    { idToken: tokenB },
  );
  if (unrelatedList.status !== 404) {
    throw new Error(`Unrelated list expected 404, got ${unrelatedList.status}`);
  }

  // 14: owner can update mutable fields
  const beforeUpdate = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdEmpty.id),
    { idToken: tokenA },
  );
  if (beforeUpdate.status !== 200) {
    throw new Error(`Get by id expected 200, got ${beforeUpdate.status}`);
  }
  const before = beforeUpdate.body as WorkPackage;

  await new Promise((r) => setTimeout(r, 5));

  const ownerUpdate = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdEmpty.id),
    {
      method: "PATCH",
      idToken: tokenA,
      body: {
        name: "Electrical Rough-In Updated",
        status: "in_progress",
        planItemIds: [remotePlanA],
        description: "Updated notes",
      },
    },
  );
  if (ownerUpdate.status !== 200) {
    throw new Error(`Owner update expected 200, got ${ownerUpdate.status}`);
  }
  const updated = ownerUpdate.body as WorkPackage;
  if (
    updated.name !== "Electrical Rough-In Updated" ||
    updated.status !== "in_progress" ||
    updated.description !== "Updated notes" ||
    updated.planItemIds.length !== 1 ||
    updated.planItemIds[0] !== remotePlanA
  ) {
    throw new Error("14: owner update did not apply mutable fields");
  }
  if (updated.id !== before.id || updated.projectId !== before.projectId) {
    throw new Error("Immutable id/projectId must not change");
  }
  if (updated.createdAt !== before.createdAt) {
    throw new Error("createdAt must remain immutable");
  }
  if (updated.updatedAt === before.updatedAt) {
    throw new Error("updatedAt must change on update");
  }

  // 15 already covered in role loop; reaffirm with no membership
  const foreignUpdate = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdEmpty.id),
    {
      method: "PATCH",
      idToken: tokenB,
      body: { name: "Nope" },
    },
  );
  if (foreignUpdate.status !== 404) {
    throw new Error(`Non-owner update expected 404, got ${foreignUpdate.status}`);
  }

  // 25: legacy owner without ProjectMember can read/write via ownerUid
  await db
    .collection(COLLECTIONS.projects)
    .doc(legacyProjectId)
    .set(
      {
        id: legacyProjectId,
        localProjectId: LOCAL_LEGACY_ID,
        ownerUid: userA.uid,
        name: "Phase 2C Legacy Owner Project",
        location: "Somerville, MA",
        status: "planning",
        progress: 0,
        openDeltas: 0,
        assignedTasks: 0,
      },
      { merge: false },
    );

  const legacyList = await apiJson(baseUrl, workPackagesPath(legacyProjectId), {
    idToken: tokenA,
  });
  if (legacyList.status !== 200) {
    throw new Error(`Legacy owner list expected 200, got ${legacyList.status}`);
  }

  const legacyCreate = await apiJson(baseUrl, workPackagesPath(legacyProjectId), {
    method: "POST",
    idToken: tokenA,
    body: { name: "Legacy Scope" },
  });
  if (legacyCreate.status !== 201) {
    throw new Error(
      `Legacy owner create expected 201, got ${legacyCreate.status}`,
    );
  }
  const legacyWp = legacyCreate.body as WorkPackage;

  // 16: owner can delete
  const ownerDelete = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdMulti.id),
    { method: "DELETE", idToken: tokenA },
  );
  if (ownerDelete.status !== 204) {
    throw new Error(`Owner delete expected 204, got ${ownerDelete.status}`);
  }

  const afterDelete = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdMulti.id),
    { idToken: tokenA },
  );
  if (afterDelete.status !== 404) {
    throw new Error("Deleted work package should 404 on get");
  }

  // 17: non-owner cannot delete
  const foreignDelete = await apiJson(
    baseUrl,
    workPackagePath(remoteProjectId, createdEmpty.id),
    { method: "DELETE", idToken: tokenB },
  );
  if (foreignDelete.status !== 404) {
    throw new Error(`Non-owner delete expected 404, got ${foreignDelete.status}`);
  }

  // 22: WorkPackage delete does NOT delete referenced PlanItems
  const planStillThere = await db
    .collection(COLLECTIONS.planItems)
    .doc(remotePlanA)
    .get();
  if (!planStillThere.exists) {
    throw new Error("22: referenced PlanItem must not be deleted with WorkPackage");
  }

  // 27: project discovery unchanged shape
  const discovery = await apiJson(baseUrl, "/api/me/projects", {
    idToken: tokenA,
  });
  if (discovery.status !== 200 || !Array.isArray(discovery.body)) {
    throw new Error("27: /api/me/projects must remain unchanged (200 array)");
  }

  // 28: existing Project / PlanItem APIs remain readable
  const projectGet = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}`,
    { idToken: tokenA },
  );
  if (projectGet.status !== 200) {
    throw new Error(`28: project GET expected 200, got ${projectGet.status}`);
  }

  const planList = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/plan-items`,
    { idToken: tokenA },
  );
  if (planList.status !== 200) {
    throw new Error(`28: plan-items GET expected 200, got ${planList.status}`);
  }

  // 29: collaboration administration remains owner-only
  const membersAsForeign = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/members`,
    { idToken: tokenB },
  );
  if (membersAsForeign.status !== 404) {
    throw new Error(
      `29: members list must remain owner-only, got ${membersAsForeign.status}`,
    );
  }

  // 30: agent authorization remains owner-only
  await seedMember({
    projectId: remoteProjectId,
    userId: userB.uid,
    role: "contractor",
    status: "active",
    invitedBy: userA.uid,
  });
  const agentList = await apiJson(
    baseUrl,
    `/api/projects/${encodeURIComponent(remoteProjectId)}/agent-runs`,
    { idToken: tokenB },
  );
  if (agentList.status !== 404) {
    throw new Error(
      `30: agent-runs must remain owner-only for members, got ${agentList.status}`,
    );
  }

  // Cleanup created work packages
  await Promise.all([
    db.collection(COLLECTIONS.workPackages).doc(createdEmpty.id).delete(),
    db.collection(COLLECTIONS.workPackages).doc(legacyWp.id).delete(),
    db.collection(COLLECTIONS.projects).doc(legacyProjectId).delete(),
    db
      .collection(COLLECTIONS.projectMembers)
      .doc(createProjectMemberId(remoteProjectId, userB.uid))
      .delete(),
  ]);

  console.log("Phase 2C WorkPackage tests passed.");
  console.log(
    JSON.stringify(
      {
        remoteProjectId,
        createdEmptyId: createdEmpty.id,
        planItemIdsCanonical: [remotePlanA, remotePlanB],
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
