/**
 * Phase 2P.2 — Plan Import secure upload foundation tests.
 *
 * Covers validation, path tenancy, authz boundaries (service-layer),
 * and optional live HTTP when test credentials + API URL are configured.
 *
 * Run: npx tsx src/scripts/phase2P2PlanImportUploadTest.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { assertProjectOwnedByUser, ProjectAccessError } from "../auth/projectAccess.js";
import type { Project } from "../domain/project.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import {
  createRemotePlanImportFileId,
  createRemotePlanImportId,
} from "../domain/planImportId.js";
import type { PlanImport } from "../domain/planImport.js";
import {
  getPlanImportById,
  setPlanImport,
} from "../repositories/planImportsRepository.js";
import {
  buildPlanImportObjectPath,
  isAllowedPlanImportMimeType,
  PLAN_IMPORT_MAX_FILE_BYTES,
  PLAN_IMPORT_MAX_FILES,
} from "../storage/planImportStorage.js";
import {
  parsePlanImportCreateInput,
  planImportCreatePayloadMatches,
} from "../validation/planImport.js";

const OWNER_UID = "phase2p2-owner-uid";
const FOREIGN_UID = "phase2p2-foreign-uid";
const LOCAL_PROJECT_ID = "project-2p2-plan-import";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEq(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function loadEnvFileIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function seedProject(): Promise<Project> {
  const id = createRemoteProjectId(OWNER_UID, LOCAL_PROJECT_ID);
  const project: Project = {
    id,
    localProjectId: LOCAL_PROJECT_ID,
    name: "Phase 2P.2 Plan Import",
    location: "Test Site",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
    ownerUid: OWNER_UID,
  };
  await db.collection(COLLECTIONS.projects).doc(id).set(project);
  return project;
}

async function cleanup(projectId: string, importId?: string): Promise<void> {
  if (importId) {
    await db.collection(COLLECTIONS.planImports).doc(importId).delete();
  }
  await db.collection(COLLECTIONS.projects).doc(projectId).delete();
}

function testValidation(): void {
  console.log("\n--- Validation ---");

  assert(
    isAllowedPlanImportMimeType("application/pdf"),
    "pdf allowed",
  );
  assert(
    isAllowedPlanImportMimeType("image/jpeg"),
    "jpeg allowed",
  );
  assert(
    isAllowedPlanImportMimeType("image/png"),
    "png allowed",
  );
  assert(
    !isAllowedPlanImportMimeType("image/gif"),
    "gif rejected",
  );
  console.log("PASS MIME allowlist");

  const good = parsePlanImportCreateInput({
    localImportId: "local-import-1",
    files: [
      {
        localFileId: "f1",
        name: "plan.pdf",
        mimeType: "application/pdf",
        size: 1024,
      },
      {
        localFileId: "f2",
        name: "photo.jpg",
        mimeType: "image/jpg",
        size: 2048,
      },
    ],
  });
  assert(good != null, "valid create payload");
  assertEq("normalized jpg", good!.files[1]!.mimeType, "image/jpeg");
  console.log("PASS supported metadata accepted");

  try {
    parsePlanImportCreateInput({
      localImportId: "local-import-bad-mime",
      files: [
        {
          localFileId: "f1",
          name: "x.gif",
          mimeType: "image/gif",
          size: 100,
        },
      ],
    });
    throw new Error("expected unsupported MIME denial");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("Unsupported"),
      "unsupported MIME message",
    );
  }
  console.log("PASS unsupported MIME denied");

  try {
    parsePlanImportCreateInput({
      localImportId: "local-import-big",
      files: [
        {
          localFileId: "f1",
          name: "big.pdf",
          mimeType: "application/pdf",
          size: PLAN_IMPORT_MAX_FILE_BYTES + 1,
        },
      ],
    });
    throw new Error("expected size denial");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("MB"),
      "size limit message",
    );
  }
  console.log("PASS size limit enforced");

  try {
    parsePlanImportCreateInput({
      localImportId: "local-import-zero",
      files: [
        {
          localFileId: "f1",
          name: "empty.pdf",
          mimeType: "application/pdf",
          size: 0,
        },
      ],
    });
    throw new Error("expected zero-byte denial");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("greater than zero"),
      "zero-byte message",
    );
  }
  console.log("PASS zero-byte denied");

  const tooMany = Array.from({ length: PLAN_IMPORT_MAX_FILES + 1 }, (_, i) => ({
    localFileId: `f${i}`,
    name: `f${i}.pdf`,
    mimeType: "application/pdf",
    size: 10,
  }));
  try {
    parsePlanImportCreateInput({
      localImportId: "local-import-many",
      files: tooMany,
    });
    throw new Error("expected file count denial");
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes("at most"),
      "file count message",
    );
  }
  console.log("PASS file count enforced");

  assertEq(
    "null body",
    parsePlanImportCreateInput(null),
    null,
  );
  console.log("PASS structural null");
}

async function testAuthzAndPersistence(): Promise<{
  projectId: string;
  importId: string;
}> {
  console.log("\n--- Authz + persistence ---");

  const project = await seedProject();
  const projectId = project.id;

  const owned = await assertProjectOwnedByUser(projectId, OWNER_UID);
  assertEq("owner access", owned.ownerUid, OWNER_UID);
  console.log("PASS owner access");

  try {
    await assertProjectOwnedByUser(projectId, FOREIGN_UID);
    throw new Error("expected foreign denial");
  } catch (error) {
    assert(
      error instanceof ProjectAccessError && error.statusCode === 404,
      "foreign access 404",
    );
  }
  console.log("PASS unauthorized project access denied (404)");

  const localImportId = "local-import-persist-1";
  const importId = createRemotePlanImportId(projectId, localImportId);
  const fileId = createRemotePlanImportFileId(importId, "file-1");
  const storagePath = buildPlanImportObjectPath(
    OWNER_UID,
    projectId,
    importId,
    fileId,
    "application/pdf",
  );

  assert(
    storagePath.startsWith(`users/${OWNER_UID}/projects/${projectId}/plan-imports/`),
    "storage path tenancy",
  );
  console.log("PASS storage path convention");

  const now = new Date().toISOString();
  const created: PlanImport = {
    id: importId,
    projectId,
    ownerUid: OWNER_UID,
    createdByUid: OWNER_UID,
    localImportId,
    status: "uploading",
    files: [
      {
        id: fileId,
        localFileId: "file-1",
        name: "Electrical-plan.pdf",
        mimeType: "application/pdf",
        size: 4200,
        storagePath,
        uploadStatus: "pending",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  await setPlanImport(created);
  const loaded = await getPlanImportById(importId);
  assert(loaded != null, "import created");
  assertEq("status", loaded!.status, "uploading");
  assertEq("file count", loaded!.files.length, 1);
  console.log("PASS import created");

  const input = parsePlanImportCreateInput({
    localImportId,
    files: [
      {
        localFileId: "file-1",
        name: "Electrical-plan.pdf",
        mimeType: "application/pdf",
        size: 4200,
      },
    ],
  });
  assert(input != null, "retry input");
  assert(
    planImportCreatePayloadMatches(loaded!, input!),
    "idempotent create payload match",
  );
  console.log("PASS create payload match (idempotency helper)");

  // Simulate commit success transition (without GCS — object check is HTTP-tested).
  const committed: PlanImport = {
    ...loaded!,
    status: "uploaded",
    updatedAt: new Date().toISOString(),
    files: loaded!.files.map((file) => ({
      ...file,
      uploadStatus: "uploaded",
    })),
  };
  await setPlanImport(committed);
  const after = await getPlanImportById(importId);
  assertEq("committed status", after!.status, "uploaded");
  console.log("PASS status transition uploading → uploaded");

  // Idempotent second commit of already-uploaded
  await setPlanImport(committed);
  const again = await getPlanImportById(importId);
  assertEq("idempotent commit", again!.status, "uploaded");
  console.log("PASS commit idempotent when already uploaded");

  return { projectId, importId };
}

async function optionalHttpSmoke(): Promise<void> {
  const emailA = process.env.BUILDSIGMA_TEST_EMAIL_A?.trim();
  const passwordA = process.env.BUILDSIGMA_TEST_PASSWORD_A?.trim();
  const emailB = process.env.BUILDSIGMA_TEST_EMAIL_B?.trim();
  const passwordB = process.env.BUILDSIGMA_TEST_PASSWORD_B?.trim();
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  const baseUrl = (
    process.env.BUILDSIGMA_API_URL ??
    "https://buildsigma-api-mjze4f27ya-ue.a.run.app"
  ).replace(/\/$/, "");

  if (!emailA || !passwordA || !emailB || !passwordB || !apiKey) {
    console.log(
      "\nSKIP live HTTP smoke (set BUILDSIGMA_TEST_EMAIL_A/B, passwords, FIREBASE_WEB_API_KEY)",
    );
    return;
  }

  console.log("\n--- Live HTTP smoke ---");

  async function idToken(email: string, password: string): Promise<string> {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    if (!response.ok) {
      throw new Error(`sign-in failed ${response.status}`);
    }
    const payload = (await response.json()) as { idToken?: string };
    if (!payload.idToken) {
      throw new Error("missing idToken");
    }
    return payload.idToken;
  }

  function uidFromToken(token: string): string {
    const json = Buffer.from(token.split(".")[1]!, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { user_id?: string; sub?: string };
    return payload.user_id ?? payload.sub ?? "";
  }

  async function requestJson(
    token: string | null,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; payload: unknown }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  }

  const tokenA = await idToken(emailA, passwordA);
  const tokenB = await idToken(emailB, passwordB);
  const uidA = uidFromToken(tokenA);
  const localProjectId = `phase2p2-pi-${Date.now()}`;
  const remoteProjectId = createRemoteProjectId(uidA, localProjectId);
  const localImportId = `local-import-${Date.now()}`;

  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();

  const unauth = await requestJson(null, "POST", `/api/projects/${remoteProjectId}/plan-imports`, {
    localImportId,
    files: [
      {
        localFileId: "f1",
        name: "a.pdf",
        mimeType: "application/pdf",
        size: 12,
      },
    ],
  });
  assertEq("unauthenticated create", unauth.status, 401);
  console.log("PASS unauthenticated create denied");

  const bootstrap = await requestJson(tokenA, "POST", "/api/projects/bootstrap", {
    localProjectId,
    name: "Phase 2P.2 HTTP",
    location: "Test",
    status: "active",
    progress: 0,
    openDeltas: 0,
    assignedTasks: 0,
  });
  assert(
    bootstrap.status === 200 || bootstrap.status === 201,
    `bootstrap ${bootstrap.status}`,
  );

  const foreign = await requestJson(
    tokenB,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports`,
    {
      localImportId,
      files: [
        {
          localFileId: "f1",
          name: "a.pdf",
          mimeType: "application/pdf",
          size: 12,
        },
      ],
    },
  );
  assertEq("cross-project create", foreign.status, 404);
  console.log("PASS cross-project access denied");

  const tinyPdf = Buffer.from(
    "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
    "utf8",
  );

  const created = await requestJson(
    tokenA,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports`,
    {
      localImportId,
      files: [
        {
          localFileId: "f1",
          name: "tiny.pdf",
          mimeType: "application/pdf",
          size: tinyPdf.length,
        },
      ],
    },
  );
  assertEq("create import", created.status, 201);
  const createdBody = created.payload as {
    import?: { id?: string; status?: string };
    uploads?: Array<{
      uploadUrl?: string;
      storagePath?: string;
      contentType?: string;
    }>;
  };
  assert(createdBody.import?.id != null, "import id returned");
  assertEq("create status", createdBody.import?.status, "uploading");
  assert(
    Array.isArray(createdBody.uploads) && createdBody.uploads.length === 1,
    "signed upload returned",
  );
  console.log("PASS signed upload metadata returned");

  const importId = createdBody.import!.id!;
  const upload = createdBody.uploads![0]!;

  const commitMissing = await requestJson(
    tokenA,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports/${importId}/commit`,
  );
  assertEq("commit missing object", commitMissing.status, 409);
  console.log("PASS commit fails safely if object missing");

  const put = await fetch(upload.uploadUrl!, {
    method: "PUT",
    headers: {
      "Content-Type": upload.contentType ?? "application/pdf",
    },
    body: tinyPdf,
  });
  assert(put.status >= 200 && put.status < 300, `GCS PUT ${put.status}`);

  const commitOk = await requestJson(
    tokenA,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports/${importId}/commit`,
  );
  assertEq("commit success", commitOk.status, 200);
  const commitBody = commitOk.payload as {
    import?: { status?: string };
  };
  assertEq("uploaded status", commitBody.import?.status, "uploaded");
  console.log("PASS commit succeeds when objects exist");

  const commitAgain = await requestJson(
    tokenA,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports/${importId}/commit`,
  );
  assertEq("commit idempotent", commitAgain.status, 200);
  console.log("PASS commit is idempotent");

  const createAgain = await requestJson(
    tokenA,
    "POST",
    `/api/projects/${remoteProjectId}/plan-imports`,
    {
      localImportId,
      files: [
        {
          localFileId: "f1",
          name: "tiny.pdf",
          mimeType: "application/pdf",
          size: tinyPdf.length,
        },
      ],
    },
  );
  assertEq("create retry after upload", createAgain.status, 200);
  console.log("PASS create idempotent after upload");

  await db.collection(COLLECTIONS.planImports).doc(importId).delete();
  await db.collection(COLLECTIONS.projects).doc(remoteProjectId).delete();
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();

  console.log("Phase 2P.2 Plan Import upload foundation tests");
  testValidation();
  const { projectId, importId } = await testAuthzAndPersistence();
  await cleanup(projectId, importId);
  await optionalHttpSmoke();
  console.log("\nPhase 2P.2 tests complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
