/**
 * Phase A8 — authenticated read APIs for AgentRun + AgentSummary.
 *
 * Requires:
 * - ADC for Firestore seed/cleanup
 * - Running API at BUILDSIGMA_API_BASE_URL (default http://127.0.0.1:18080)
 * - Test users buildsigma-test-a@example.com / buildsigma-test-b@example.com
 *
 * Run: npx tsx src/scripts/phaseAgentA8Test.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAuth } from "firebase-admin/auth";

import "../config/firebase.js";
import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import { buildAgentSummaryId } from "../domain/agentSummary.js";
import { buildFieldVarianceAgentRunId } from "../domain/agentRun.js";
import { createRemoteProjectId } from "../domain/projectId.js";
import {
  assertAgentRunDtoHasNoInternalFields,
  assertAgentSummaryDtoHasNoInternalFields,
} from "../dto/agentRunDto.js";

const EMAIL_A = "buildsigma-test-a@example.com";
const EMAIL_B = "buildsigma-test-b@example.com";
const LOCAL_PROJECT_ID = "phase-a8-project";

const REMOTE_DELTA_ID = "phase-a8-delta-remote";
const LOCAL_DELTA_ID = "phase-a8-delta-local";
const AGENT_RUN_ID = buildFieldVarianceAgentRunId(REMOTE_DELTA_ID);
const SUMMARY_ID = buildAgentSummaryId(AGENT_RUN_ID);

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
      name: "A8 Agent Activity Test",
      location: "Boston, MA",
      status: "active",
      progress: 10,
      openDeltas: 1,
      assignedTasks: 1,
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

async function seedAgentRunAndSummary(
  ownerUid: string,
  projectId: string,
): Promise<void> {
  const now = "2026-08-23T08:00:00.000Z";

  await db.collection(COLLECTIONS.agentRuns).doc(AGENT_RUN_ID).set({
    id: AGENT_RUN_ID,
    schemaVersion: 1,
    ownerUid,
    projectId,
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: REMOTE_DELTA_ID,
    idempotencyKey: AGENT_RUN_ID,
    status: "completed",
    currentStep: "completed",
    attemptCount: 1,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: REMOTE_DELTA_ID,
      localDeltaId: LOCAL_DELTA_ID,
      remoteMeasurementId: "phase-a8-measurement-remote",
      localMeasurementId: "phase-a8-measurement-local",
      remotePlanItemId: "phase-a8-plan-remote",
    },
    pendingRequest: null,
    outcome: {
      kind: "summary_ready",
      summaryId: SUMMARY_ID,
      userVisibleRationale: "Field variance documentation is ready for review.",
    },
    lastEvidenceId: "phase-a8-evidence-1",
    errorCategory: null,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });

  await db.collection(COLLECTIONS.agentSummaries).doc(SUMMARY_ID).set({
    id: SUMMARY_ID,
    schemaVersion: 1,
    ownerUid,
    projectId,
    agentRunId: AGENT_RUN_ID,
    workflowType: "field_variance",
    remoteDeltaId: REMOTE_DELTA_ID,
    localDeltaId: LOCAL_DELTA_ID,
    remoteMeasurementId: "phase-a8-measurement-remote",
    localMeasurementId: "phase-a8-measurement-local",
    remotePlanItemId: "phase-a8-plan-remote",
    createdAt: now,
    varianceSummary: "Actual conduit run differs from planned length.",
    documentationSummary: "Photo evidence documents the installed run length.",
    evidenceAssessment: {
      evidenceId: "phase-a8-evidence-1",
      evidenceType: "photo",
      relevance: "relevant",
      userVisibleRationale: "Photo shows the measured conduit run.",
    },
    documentedImpact: {
      plannedValue: 120,
      actualValue: 118,
      difference: -2,
      percentDifference: -1.67,
      costImpact: -9,
      laborImpactHours: -0.3,
      scheduleImpactDays: -0.05,
    },
    recommendedHumanNextStep:
      "Review the documented variance with the project lead.",
    sourceRefs: {
      evidenceIds: ["phase-a8-evidence-1"],
    },
  });
}

async function cleanup(): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.agentRuns).doc(AGENT_RUN_ID).delete(),
    db.collection(COLLECTIONS.agentSummaries).doc(SUMMARY_ID).delete(),
  ]);
}

async function listAgentRuns(
  baseUrl: string,
  token: string,
  projectId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/agent-runs`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return { status: response.status, body: await response.json() };
}

async function getAgentRun(
  baseUrl: string,
  token: string,
  projectId: string,
  agentRunId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/agent-runs/${encodeURIComponent(agentRunId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return { status: response.status, body: await response.json() };
}

async function getAgentSummary(
  baseUrl: string,
  token: string,
  projectId: string,
  summaryId: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/agent-summaries/${encodeURIComponent(summaryId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return { status: response.status, body: await response.json() };
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.BUILDSIGMA_API_BASE_URL ?? "http://127.0.0.1:18080";
  const apiKey = loadWebApiKey();
  const password = process.env.BUILDSIGMA_TEST_PASSWORD ?? "BuildSigma123!";

  const [userA, userB] = await Promise.all([
    getAuth().getUserByEmail(EMAIL_A),
    getAuth().getUserByEmail(EMAIL_B),
  ]);

  const [tokenA, tokenB] = await Promise.all([
    idTokenForEmailPassword(EMAIL_A, password, apiKey),
    idTokenForEmailPassword(EMAIL_B, password, apiKey),
  ]);

  const projectA = await bootstrapProject(baseUrl, tokenA);
  const projectB = createRemoteProjectId(userB.uid, LOCAL_PROJECT_ID);

  await cleanup();
  await seedAgentRunAndSummary(userA.uid, projectA);

  try {
    const list = await listAgentRuns(baseUrl, tokenA, projectA);

    if (list.status !== 200 || !Array.isArray(list.body)) {
      throw new Error(`Expected owner list 200, got ${list.status}`);
    }

    if (list.body.length < 1) {
      throw new Error("Expected at least one AgentRun for owner");
    }

    for (const item of list.body) {
      if (!assertAgentRunDtoHasNoInternalFields(item)) {
        throw new Error("AgentRun list item leaked internal fields");
      }
    }

    const foreignList = await listAgentRuns(baseUrl, tokenB, projectA);

    if (foreignList.status !== 404) {
      throw new Error(`Expected foreign list 404, got ${foreignList.status}`);
    }

    const wrongProjectList = await listAgentRuns(baseUrl, tokenA, projectB);

    if (wrongProjectList.status !== 404) {
      throw new Error(
        `Expected wrong project list 404, got ${wrongProjectList.status}`,
      );
    }

    const run = await getAgentRun(baseUrl, tokenA, projectA, AGENT_RUN_ID);

    if (run.status !== 200 || typeof run.body !== "object" || run.body === null) {
      throw new Error(`Expected owner get run 200, got ${run.status}`);
    }

    if (!assertAgentRunDtoHasNoInternalFields(run.body)) {
      throw new Error("AgentRun detail leaked internal fields");
    }

    const foreignRun = await getAgentRun(
      baseUrl,
      tokenB,
      projectA,
      AGENT_RUN_ID,
    );

    if (foreignRun.status !== 404) {
      throw new Error(`Expected foreign run 404, got ${foreignRun.status}`);
    }

    const wrongProjectRun = await getAgentRun(
      baseUrl,
      tokenA,
      projectB,
      AGENT_RUN_ID,
    );

    if (wrongProjectRun.status !== 404) {
      throw new Error(
        `Expected wrong project run 404, got ${wrongProjectRun.status}`,
      );
    }

    const summary = await getAgentSummary(
      baseUrl,
      tokenA,
      projectA,
      SUMMARY_ID,
    );

    if (
      summary.status !== 200 ||
      typeof summary.body !== "object" ||
      summary.body === null
    ) {
      throw new Error(`Expected owner summary 200, got ${summary.status}`);
    }

    if (!assertAgentSummaryDtoHasNoInternalFields(summary.body)) {
      throw new Error("AgentSummary leaked internal fields");
    }

    const foreignSummary = await getAgentSummary(
      baseUrl,
      tokenB,
      projectA,
      SUMMARY_ID,
    );

    if (foreignSummary.status !== 404) {
      throw new Error(
        `Expected foreign summary 404, got ${foreignSummary.status}`,
      );
    }

    const wrongProjectSummary = await getAgentSummary(
      baseUrl,
      tokenA,
      projectB,
      SUMMARY_ID,
    );

    if (wrongProjectSummary.status !== 404) {
      throw new Error(
        `Expected wrong project summary 404, got ${wrongProjectSummary.status}`,
      );
    }

    console.log("phaseAgentA8Test: PASS");
    console.log(
      JSON.stringify({
        listCount: (list.body as unknown[]).length,
        runId: AGENT_RUN_ID,
        summaryId: SUMMARY_ID,
        foreignList: foreignList.status,
        foreignRun: foreignRun.status,
        foreignSummary: foreignSummary.status,
      }),
    );
  } finally {
    await cleanup();
  }
}

main().catch((error: unknown) => {
  console.error("phaseAgentA8Test failed:");
  console.error(error);
  process.exitCode = 1;
});
