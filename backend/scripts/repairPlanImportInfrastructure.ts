/**
 * Infrastructure repair + validation for Plan Import Cloud Tasks → Agent → Vertex.
 * Uses Application Default Credentials. Safe to run repeatedly (idempotent IAM checks).
 *
 * Run: npx tsx scripts/repairPlanImportInfrastructure.ts
 * Optional: npx tsx scripts/repairPlanImportInfrastructure.ts --apply
 * Optional: npx tsx scripts/repairPlanImportInfrastructure.ts --apply --test-import=<importId>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

type Json = Record<string, unknown>;

const PROJECT = "buildsigma-olivier-2026";
const REGION = "us-central1";
const SERVICE = "buildsigma-agent";
const QUEUE = "field-variance-agent";
const INVOKER_SA = `buildsigma-agent-invoker@${PROJECT}.iam.gserviceaccount.com`;
const API_INVOKER_SA = `buildsigma-api-runtime@${PROJECT}.iam.gserviceaccount.com`;

const apply = process.argv.includes("--apply");
const testImportArg = process.argv.find((arg) =>
  arg.startsWith("--test-import="),
);
const testImportId = testImportArg?.split("=")[1]?.trim() || null;

function loadBackendEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env");
  const out: Record<string, string> = {};
  try {
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
      out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    // Fall back to process.env below.
  }
  return out;
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Unable to obtain access token from ADC");
  }
  return token.token;
}

async function api(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: res.status, body };
}

function asJson(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function policyHasBinding(
  policy: Json,
  role: string,
  member: string,
): boolean {
  const bindings = policy.bindings;
  if (!Array.isArray(bindings)) {
    return false;
  }
  for (const binding of bindings) {
    const b = asJson(binding);
    if (b.role !== role) {
      continue;
    }
    const members = b.members;
    if (Array.isArray(members) && members.includes(member)) {
      return true;
    }
  }
  return false;
}

async function ensureRunInvokerBinding(
  token: string,
  agentUrl: string,
  serviceAccountEmail: string,
): Promise<{ hadBinding: boolean; applied: boolean }> {
  const member = `serviceAccount:${serviceAccountEmail}`;
  const role = "roles/run.invoker";
  const getUrl = `https://run.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/services/${SERVICE}:getIamPolicy`;
  const current = await api(token, getUrl, { method: "GET" });
  if (current.status >= 400) {
    throw new Error(
      `getIamPolicy failed (${current.status}): ${JSON.stringify(current.body)}`,
    );
  }

  const policy = asJson(current.body);
  const hadBinding = policyHasBinding(policy, role, member);
  if (hadBinding || !apply) {
    return { hadBinding, applied: false };
  }

  const bindings = Array.isArray(policy.bindings)
    ? [...policy.bindings.map((item) => asJson(item))]
    : [];
  const existing = bindings.find((b) => b.role === role);
  if (existing) {
    const members = Array.isArray(existing.members)
      ? [...existing.members]
      : [];
    if (!members.includes(member)) {
      members.push(member);
    }
    existing.members = members;
  } else {
    bindings.push({ role, members: [member] });
  }

  const setUrl = `https://run.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/services/${SERVICE}:setIamPolicy`;
  const setRes = await api(token, setUrl, {
    method: "POST",
    body: JSON.stringify({ policy: { ...policy, bindings } }),
  });
  if (setRes.status >= 400) {
    throw new Error(
      `setIamPolicy failed (${setRes.status}): ${JSON.stringify(setRes.body)}`,
    );
  }
  void agentUrl;
  return { hadBinding, applied: true };
}

async function ensureProjectRole(
  token: string,
  member: string,
  role: string,
): Promise<{ hadBinding: boolean; applied: boolean }> {
  const getUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`;
  const current = await api(token, getUrl, { method: "POST", body: "{}" });
  if (current.status >= 400) {
    throw new Error(
      `project getIamPolicy failed (${current.status}): ${JSON.stringify(current.body)}`,
    );
  }

  const policy = asJson(current.body);
  const hadBinding = policyHasBinding(policy, role, member);
  if (hadBinding || !apply) {
    return { hadBinding, applied: false };
  }

  const bindings = Array.isArray(policy.bindings)
    ? [...policy.bindings.map((item) => asJson(item))]
    : [];
  const existing = bindings.find((b) => b.role === role);
  if (existing) {
    const members = Array.isArray(existing.members)
      ? [...existing.members]
      : [];
    if (!members.includes(member)) {
      members.push(member);
    }
    existing.members = members;
  } else {
    bindings.push({ role, members: [member] });
  }

  const setUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`;
  const setRes = await api(token, setUrl, {
    method: "POST",
    body: JSON.stringify({
      policy: { ...policy, bindings },
    }),
  });
  if (setRes.status >= 400) {
    throw new Error(
      `project setIamPolicy failed (${setRes.status}): ${JSON.stringify(setRes.body)}`,
    );
  }
  return { hadBinding, applied: true };
}

async function mintInvokerIdToken(audience: string): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const sourceClient = await auth.getClient();
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${INVOKER_SA}:generateIdToken`;
  const accessToken = await sourceClient.getAccessToken();
  if (!accessToken.token) {
    throw new Error("Unable to obtain access token for SA impersonation");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audience,
      includeEmail: true,
    }),
  });
  const body = asJson(await res.json().catch(async () => ({})));
  if (res.status >= 400 || typeof body.token !== "string") {
    throw new Error(
      `generateIdToken failed (${res.status}): ${JSON.stringify(body)}`,
    );
  }
  return body.token;
}

async function main(): Promise<void> {
  const fileEnv = loadBackendEnv();
  const agentServiceUrl = (
    fileEnv.AGENT_SERVICE_URL ??
    process.env.AGENT_SERVICE_URL ??
    ""
  ).replace(/\/$/, "");
  if (!agentServiceUrl) {
    throw new Error("AGENT_SERVICE_URL missing in backend/.env");
  }

  console.log(
    JSON.stringify({
      event: "repair_started",
      project: PROJECT,
      region: REGION,
      service: SERVICE,
      queue: QUEUE,
      invokerSa: INVOKER_SA,
      agentServiceUrl,
      apply,
      testImportId,
    }),
  );

  const token = await getAccessToken();

  const serviceUrl = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${SERVICE}`;
  const serviceRes = await api(token, serviceUrl, { method: "GET" });
  if (serviceRes.status >= 400) {
    throw new Error(
      `Cloud Run describe failed (${serviceRes.status}): ${JSON.stringify(serviceRes.body)}`,
    );
  }

  const service = asJson(serviceRes.body);
  const uri = typeof service.uri === "string" ? service.uri : null;
  const latestReady =
    typeof service.latestReadyRevision === "string"
      ? service.latestReadyRevision
      : null;
  const template = asJson(service.template);
  const runtimeSa =
    typeof template.serviceAccount === "string"
      ? template.serviceAccount
      : null;
  const containers = template.containers;

  const templateContainer =
    Array.isArray(containers) && containers[0]
      ? asJson(containers[0] as Json)
      : {};
  const envEntries = Array.isArray(templateContainer.env)
    ? templateContainer.env
    : [];
  const envMap: Record<string, string> = {};
  for (const entry of envEntries) {
    const e = asJson(entry);
    if (typeof e.name === "string") {
      envMap[e.name] =
        typeof e.value === "string" ? e.value : String(e.value ?? "");
    }
  }

  console.log(
    JSON.stringify({
      event: "cloud_run_service",
      uri,
      latestReadyRevision: latestReady,
      runtimeServiceAccount: runtimeSa,
      env: {
        GEMINI_MODEL: envMap.GEMINI_MODEL ?? null,
        GOOGLE_CLOUD_PROJECT: envMap.GOOGLE_CLOUD_PROJECT ?? null,
        GOOGLE_CLOUD_LOCATION: envMap.GOOGLE_CLOUD_LOCATION ?? null,
        GOOGLE_GENAI_USE_ENTERPRISE:
          envMap.GOOGLE_GENAI_USE_ENTERPRISE ?? null,
        AGENT_OIDC_MODE: envMap.AGENT_OIDC_MODE ?? null,
        EVIDENCE_STORAGE_BUCKET: envMap.EVIDENCE_STORAGE_BUCKET ?? null,
        CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL:
          envMap.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL ?? null,
        AGENT_SERVICE_URL: envMap.AGENT_SERVICE_URL ?? null,
      },
    }),
  );

  const invokerBinding = await ensureRunInvokerBinding(token, agentServiceUrl, INVOKER_SA);
  console.log(
    JSON.stringify({
      event: "run_invoker_binding",
      member: `serviceAccount:${INVOKER_SA}`,
      hadBinding: invokerBinding.hadBinding,
      applied: invokerBinding.applied,
    }),
  );

  const keplerApiInvokerBinding = await ensureRunInvokerBinding(token, agentServiceUrl, API_INVOKER_SA);
  console.log(JSON.stringify({
    event: "kepler_api_run_invoker_binding",
    member: `serviceAccount:${API_INVOKER_SA}`,
    hadBinding: keplerApiInvokerBinding.hadBinding,
    applied: keplerApiInvokerBinding.applied,
    requiredAgentEnv: "KEPLER_API_INVOKER_SERVICE_ACCOUNT_EMAIL",
  }));

  if (runtimeSa) {
    const vertexMember = `serviceAccount:${runtimeSa}`;
    const vertexRole = "roles/aiplatform.user";
    const vertex = await ensureProjectRole(token, vertexMember, vertexRole);
    console.log(
      JSON.stringify({
        event: "runtime_vertex_binding",
        runtimeServiceAccount: runtimeSa,
        role: vertexRole,
        hadBinding: vertex.hadBinding,
        applied: vertex.applied,
      }),
    );
  }

  // Authenticated health check (OIDC audience = service base URL).
  const audience = agentServiceUrl;
  let authProbeStatus: number | null = null;
  let authProbeBody: unknown = null;
  try {
    const idToken = await mintInvokerIdToken(audience);
    const healthUrl = `${agentServiceUrl}/healthz`;
    const probe = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    authProbeStatus = probe.status;
    authProbeBody = await probe.json().catch(async () => probe.text());
  } catch (error) {
    authProbeBody =
      error instanceof Error ? error.message : String(error);
  }

  console.log(
    JSON.stringify({
      event: "authenticated_health_probe",
      url: `${agentServiceUrl}/healthz`,
      status: authProbeStatus,
      body: authProbeBody,
    }),
  );

  const importId =
    testImportId ??
    "kem7N1ij3lX7KOUDXW8YjF5NWGN2_project-001_plan-import-1787782262653-72241";
  try {
    const idToken = await mintInvokerIdToken(audience);
    const processUrl = `${agentServiceUrl}/internal/plan-imports/${encodeURIComponent(importId)}/process`;
    const started = Date.now();
    const probe = await fetch(processUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ importId }),
    });
    const durationMs = Date.now() - started;
    const body = await probe.json().catch(async () => probe.text());
    console.log(
      JSON.stringify({
        event: "authenticated_plan_import_probe",
        importId,
        status: probe.status,
        durationMs,
        body,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "authenticated_plan_import_probe",
        importId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const queueUrl = `https://cloudtasks.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/queues/${QUEUE}`;
  const queueRes = await api(token, queueUrl, { method: "GET" });
  console.log(
    JSON.stringify({
      event: "cloud_tasks_queue",
      status: queueRes.status,
      body: queueRes.body,
    }),
  );

  console.log(JSON.stringify({ event: "repair_complete", apply }));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "repair_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
