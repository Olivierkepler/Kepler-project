/**
 * Phase 2F-E.3 — Backend recoverable evidence + resume trigger regression.
 * Run: npm run test:fe3-recoverable-evidence
 *
 * Pure domain + trigger stubs — no Firestore / production mutation.
 */
import {
  buildFieldVarianceAgentRunId,
  canTransitionAgentRunStatus,
  isTerminalAgentRunStatus,
  type AgentRun,
} from "../domain/agentRun.js";
import {
  isEligibleForFailedEvidenceRecovery,
  isRecoverableEvidenceErrorCategory,
} from "../domain/recoverableEvidenceFailure.js";
import type { Evidence } from "../domain/evidence.js";
import { triggerFieldVarianceResumeForNewEvidence } from "../services/fieldVarianceResumeTrigger.js";
import {
  applyRecoverFailedFieldVarianceEvidence,
  applyRequestReplacementDeltaEvidence,
} from "../validation/agentRun.js";
import { toAgentRunSummaryDTO as toDto } from "../dto/agentRunDto.js";

const OWNER = "owner-1";
const PROJECT_ID = "proj_fe3";
const LOCAL_DELTA = "delta-local-fe3";
const REMOTE_DELTA = `${PROJECT_ID}_${LOCAL_DELTA}`;
const RUN_ID = buildFieldVarianceAgentRunId(REMOTE_DELTA);
const NOW = "2026-09-03T12:00:00.000Z";
const BAD_EVIDENCE_ID = "ev-bad";

let failures = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: RUN_ID,
    schemaVersion: 1,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    workflowType: "field_variance",
    triggerType: "delta_created",
    triggerSourceId: REMOTE_DELTA,
    idempotencyKey: RUN_ID,
    status: "failed",
    currentStep: "failed",
    attemptCount: 2,
    maxAttempts: 5,
    contextRefs: {
      remoteDeltaId: REMOTE_DELTA,
      localDeltaId: LOCAL_DELTA,
      remoteMeasurementId: "meas-remote-1",
      localMeasurementId: "meas-local-1",
      remotePlanItemId: "plan-remote-1",
    },
    pendingRequest: null,
    outcome: {
      kind: "failed",
      summaryId: null,
      userVisibleRationale: "failed",
    },
    lastEvidenceId: BAD_EVIDENCE_ID,
    errorCategory:
      "Failed to decode image data. Please make sure the image is valid.",
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-new",
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    localEvidenceId: "evidence-new",
    type: "photo",
    note: "",
    objectPath: `users/${OWNER}/projects/${PROJECT_ID}/evidence/ev-new/photo.jpg`,
    contentType: "image/jpeg",
    createdAt: NOW,
    localMeasurementId: null,
    localDeltaId: LOCAL_DELTA,
    ...overrides,
  };
}

async function main(): Promise<void> {
  check(
    isRecoverableEvidenceErrorCategory(
      "Failed to decode image data. Please make sure the image is valid.",
    ),
    "historical decode errorCategory recoverable",
  );
  check(isTerminalAgentRunStatus("failed"), "failed remains terminal for start/resume");
  check(
    canTransitionAgentRunStatus("failed", "waiting_for_evidence"),
    "failed→waiting allowed for explicit recovery",
  );

  const failed = makeAgentRun();
  check(isEligibleForFailedEvidenceRecovery(failed), "L. eligible");

  const recovered = applyRecoverFailedFieldVarianceEvidence(failed);
  check(recovered.outcome === "recovered", "L. recovered");
  check(
    recovered.agentRun.status === "waiting_for_evidence" &&
      recovered.agentRun.pendingRequest?.kind === "delta_evidence",
    "M/N. waiting + delta_evidence",
  );
  check(recovered.agentRun.id === RUN_ID, "O. same AgentRun");
  check(
    recovered.agentRun.lastEvidenceId === BAD_EVIDENCE_ID,
    "lastEvidenceId retained",
  );
  check(
    applyRecoverFailedFieldVarianceEvidence(recovered.agentRun).outcome ===
      "existing",
    "U. idempotent reopen",
  );

  const dto = toDto(failed);
  check(dto.canRecoverEvidence === true, "DTO canRecoverEvidence true for eligible failed");
  check(
    toDto(recovered.agentRun).canRecoverEvidence === false,
    "DTO canRecoverEvidence false after reopen",
  );
  check(
    toDto(
      makeAgentRun({ errorCategory: "firestore_unavailable" }),
    ).canRecoverEvidence === false,
    "V. unrelated failed DTO not recoverable",
  );
  check(
    toDto(
      makeAgentRun({
        status: "completed",
        currentStep: "completed",
        errorCategory: "unsupported_media",
      }),
    ).canRecoverEvidence === false,
    "W. completed not recoverable",
  );
  check(
    toDto(
      makeAgentRun({
        status: "escalated",
        currentStep: "escalated",
        errorCategory: "unsupported_media",
      }),
    ).canRecoverEvidence === false,
    "X. escalated not recoverable",
  );

  // Replacement request from running (presence already true)
  {
    const running = makeAgentRun({
      status: "running",
      currentStep: "analyze_evidence",
      errorCategory: null,
      completedAt: null,
      outcome: null,
    });
    const result = applyRequestReplacementDeltaEvidence(running, {});
    check(
      result.outcome === "created" &&
        result.agentRun.status === "waiting_for_evidence" &&
        result.agentRun.lastEvidenceId === BAD_EVIDENCE_ID,
      "replacement request allowed despite existing lastEvidenceId",
    );
  }

  // Resume trigger after reopen — NEW Evidence
  {
    const waiting = recovered.agentRun;
    let enqueueCount = 0;
    const store = new Map<string, AgentRun>([[RUN_ID, waiting]]);

    const newEvidence = makeEvidence({ id: "ev-new-valid" });
    const result = await triggerFieldVarianceResumeForNewEvidence(newEvidence, {
      getAgentRunByIdFn: async (id) => store.get(id),
      loadEnvFn: () => ({
        projectId: "p",
        location: "us-central1",
        queue: "q",
        agentServiceUrl: "https://agent.example.com",
        invokerServiceAccountEmail: "sa@example.com",
      }),
      enqueueFn: async () => {
        enqueueCount += 1;
        return {
          outcome: "created" as const,
          taskId: "fv-resume-test",
          url: "https://agent.example.com/r",
          payload: { agentRunId: RUN_ID, evidenceId: "ev-new-valid" },
        };
      },
    });

    check(
      result.outcome === "enqueued" && enqueueCount === 1,
      "31. reopened + NEW Delta Evidence → exactly one resume task",
    );
    check(
      result.outcome === "enqueued" && result.agentRunId === RUN_ID,
      "31b. same AgentRun",
    );

    const measurementLinked = makeEvidence({
      id: "ev-meas",
      localDeltaId: null,
      localMeasurementId: "meas-local-1",
    });
    const skipMeas = await triggerFieldVarianceResumeForNewEvidence(
      measurementLinked,
      {
        getAgentRunByIdFn: async (id) => store.get(id),
        loadEnvFn: () => ({
          projectId: "p",
          location: "us-central1",
          queue: "q",
          agentServiceUrl: "https://agent.example.com",
          invokerServiceAccountEmail: "sa@example.com",
        }),
        enqueueFn: async () => {
          enqueueCount += 1;
          return {
            outcome: "created" as const,
            taskId: "fv-resume-test2",
            url: "https://agent.example.com/r",
            payload: { agentRunId: RUN_ID, evidenceId: "ev-meas" },
          };
        },
      },
    );
    check(
      skipMeas.outcome === "skipped" &&
        skipMeas.reason === "not_delta_evidence" &&
        enqueueCount === 1,
      "measurement-linked Evidence → no resume",
    );

    const sameBad = makeEvidence({
      id: BAD_EVIDENCE_ID,
      localEvidenceId: "evidence-bad",
    });
    const sameResult = await triggerFieldVarianceResumeForNewEvidence(sameBad, {
      getAgentRunByIdFn: async (id) => store.get(id),
      loadEnvFn: () => ({
        projectId: "p",
        location: "us-central1",
        queue: "q",
        agentServiceUrl: "https://agent.example.com",
        invokerServiceAccountEmail: "sa@example.com",
      }),
      enqueueFn: async () => {
        enqueueCount += 1;
        return {
          outcome: "created" as const,
          taskId: "fv-resume-dup",
          url: "https://agent.example.com/r",
          payload: { agentRunId: RUN_ID, evidenceId: BAD_EVIDENCE_ID },
        };
      },
    });
    // Trigger may still enqueue; agent applyResume already_resumed protects replay.
    check(
      sameResult.outcome === "enqueued" || sameResult.outcome === "skipped",
      "same Evidence trigger returns enqueued|skipped (agent protects replay)",
    );
  }

  // Failed run: new Evidence must NOT resume
  {
    let enqueueCount = 0;
    const result = await triggerFieldVarianceResumeForNewEvidence(
      makeEvidence({ id: "ev-while-failed" }),
      {
        getAgentRunByIdFn: async () => makeAgentRun(),
        enqueueFn: async () => {
          enqueueCount += 1;
          return {
            outcome: "created" as const,
            taskId: "fv-bad",
            url: "https://agent.example.com/r",
            payload: { agentRunId: RUN_ID, evidenceId: "ev-while-failed" },
          };
        },
      },
    );
    check(
      result.outcome === "skipped" &&
        result.reason === "not_waiting" &&
        enqueueCount === 0,
      "new Evidence while failed → skip (not_waiting)",
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }

  console.log("\nAll Phase 2F-E.3 backend recoverable-evidence checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
