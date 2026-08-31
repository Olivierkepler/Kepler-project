#!/usr/bin/env bash
# Repair Plan Import infrastructure: Cloud Tasks → Cloud Run → Vertex AI
# Idempotent. Requires gcloud auth with project admin / IAM admin on buildsigma-olivier-2026.
#
# Usage:
#   ./scripts/repair-plan-import-infra.sh            # inspect only
#   ./scripts/repair-plan-import-infra.sh --apply    # apply IAM fixes + redeploy agent if needed
#   ./scripts/repair-plan-import-infra.sh --apply --test-import=<importId>
set -euo pipefail

PROJECT="buildsigma-olivier-2026"
REGION="us-central1"
SERVICE="buildsigma-agent"
QUEUE="field-variance-agent"
INVOKER_SA="buildsigma-agent-invoker@${PROJECT}.iam.gserviceaccount.com"
EVIDENCE_BUCKET="buildsigma-olivier-2026-evidence"

APPLY=false
TEST_IMPORT_ID=""
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --test-import=*) TEST_IMPORT_ID="${arg#*=}" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENT_DIR="$(cd "${BACKEND_DIR}/../agent" && pwd)"

if [[ -f "${BACKEND_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

AGENT_SERVICE_URL="${AGENT_SERVICE_URL:-}"
if [[ -z "${AGENT_SERVICE_URL}" ]]; then
  echo "AGENT_SERVICE_URL missing in backend/.env" >&2
  exit 1
fi
AGENT_SERVICE_URL="${AGENT_SERVICE_URL%/}"

echo "=== Plan Import infrastructure repair ==="
echo "project=${PROJECT} region=${REGION} service=${SERVICE}"
echo "agentServiceUrl=${AGENT_SERVICE_URL}"
echo "invokerSa=${INVOKER_SA}"
echo "apply=${APPLY}"

echo
echo "--- Cloud Run service ---"
gcloud run services describe "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --format="yaml(status.url,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)"

RUNTIME_SA="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --format="value(spec.template.spec.serviceAccountName)")"

if [[ -z "${RUNTIME_SA}" ]]; then
  RUNTIME_SA="${PROJECT}@appspot.gserviceaccount.com"
  echo "WARN: runtime SA not set on service; defaulting to ${RUNTIME_SA}"
fi
echo "runtimeSa=${RUNTIME_SA}"

echo
echo "--- Cloud Run IAM (run.invoker for Cloud Tasks) ---"
if gcloud run services get-iam-policy "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/run.invoker AND bindings.members:serviceAccount:${INVOKER_SA}" \
  --format="value(bindings.role)" | grep -q run.invoker; then
  echo "OK: ${INVOKER_SA} already has roles/run.invoker on ${SERVICE}"
else
  echo "MISSING: ${INVOKER_SA} lacks roles/run.invoker on ${SERVICE}"
  if [[ "${APPLY}" == true ]]; then
    gcloud run services add-iam-policy-binding "${SERVICE}" \
      --project="${PROJECT}" \
      --region="${REGION}" \
      --member="serviceAccount:${INVOKER_SA}" \
      --role="roles/run.invoker"
    echo "APPLIED: roles/run.invoker"
  fi
fi

echo
echo "--- Runtime Vertex AI IAM ---"
if gcloud projects get-iam-policy "${PROJECT}" \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/aiplatform.user AND bindings.members:serviceAccount:${RUNTIME_SA}" \
  --format="value(bindings.role)" | grep -q aiplatform.user; then
  echo "OK: ${RUNTIME_SA} already has roles/aiplatform.user"
else
  echo "MISSING: ${RUNTIME_SA} lacks roles/aiplatform.user"
  if [[ "${APPLY}" == true ]]; then
    gcloud projects add-iam-policy-binding "${PROJECT}" \
      --member="serviceAccount:${RUNTIME_SA}" \
      --role="roles/aiplatform.user"
    echo "APPLIED: roles/aiplatform.user to ${RUNTIME_SA}"
  fi
fi

echo
echo "--- Authenticated Cloud Run probe (invoker SA impersonation) ---"
ID_TOKEN="$(gcloud auth print-identity-token \
  --impersonate-service-account="${INVOKER_SA}" \
  --audiences="${AGENT_SERVICE_URL}" \
  --project="${PROJECT}" 2>/dev/null || true)"

if [[ -z "${ID_TOKEN}" ]]; then
  echo "WARN: unable to mint invoker ID token (need iam.serviceAccounts.getAccessToken on ${INVOKER_SA})"
else
  HEALTH_CODE="$(curl -s -o /tmp/bs-agent-health.json -w "%{http_code}" \
    -H "Authorization: Bearer ${ID_TOKEN}" \
    "${AGENT_SERVICE_URL}/healthz")"
  echo "GET /healthz -> HTTP ${HEALTH_CODE}"
  cat /tmp/bs-agent-health.json
  echo

  PROBE_IMPORT="${TEST_IMPORT_ID:-probe-not-a-real-import}"
  PROCESS_CODE="$(curl -s -o /tmp/bs-agent-process.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${ID_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"importId\":\"${PROBE_IMPORT}\"}" \
    "${AGENT_SERVICE_URL}/internal/plan-imports/${PROBE_IMPORT}/process")"
  echo "POST /internal/plan-imports/.../process -> HTTP ${PROCESS_CODE}"
  cat /tmp/bs-agent-process.json
  echo
fi

if [[ "${APPLY}" == true ]]; then
  echo
  echo "--- Redeploy agent (current source, production OIDC env) ---"
  cd "${AGENT_DIR}"
  npm run build
  gcloud run deploy "${SERVICE}" \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --source . \
    --service-account="${RUNTIME_SA}" \
    --no-allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.5-flash,GOOGLE_GENAI_USE_ENTERPRISE=true,AGENT_OIDC_MODE=production,AGENT_SERVICE_URL=${AGENT_SERVICE_URL},CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL=${INVOKER_SA},EVIDENCE_STORAGE_BUCKET=${EVIDENCE_BUCKET}" \
    --quiet
  echo "Redeploy complete."
fi

echo
echo "--- Cloud Tasks queue ---"
gcloud tasks queues describe "${QUEUE}" \
  --project="${PROJECT}" \
  --location="${REGION}" \
  --format="yaml(name,rateLimits,retryConfig,state)" || true

echo
echo "--- Recent plan-import task names (if list permission) ---"
gcloud tasks list \
  --project="${PROJECT}" \
  --location="${REGION}" \
  --queue="${QUEUE}" \
  --filter="name:pi-process_" \
  --limit=10 \
  --format="table(name,scheduleTime,dispatchCount,responseCount,lastAttempt.responseStatus.code)" || true

echo
echo "Done. Re-run backend /process for a fresh import after --apply."
