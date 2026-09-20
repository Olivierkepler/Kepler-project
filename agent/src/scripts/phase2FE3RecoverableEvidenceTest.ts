/**
 * Phase 2F-E.3 — Recoverable Field Variance evidence-quality failures.
 * Run: npm run test:fe3-recoverable-evidence
 */
import { createStubEvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import { createStubFieldVarianceAgentRunner } from "../agent/fieldVarianceAgent.js";
import {
  buildFieldVarianceAgentRunId,
  canTransitionAgentRunStatus,
  isTerminalAgentRunStatus,
  type AgentRun,
  type AgentRunStateUpdate,
} from "../domain/agentRun.js";
import type { Evidence } from "../domain/evidence.js";
import {
  classifyRecoverableEvidenceMediaFailure,
  isEligibleForFailedEvidenceRecovery,
  isRecoverableEvidenceErrorCategory,
} from "../domain/recoverableEvidenceFailure.js";
import { analyzeEvidenceForAgentRun } from "../services/analyzeEvidence.js";
import { executeFieldVarianceAssessmentCycle } from "../services/fieldVarianceAssessmentCycle.js";
import type { DomainLoaders } from "../tools/toolContext.js";
import {
  applyAgentRunStateUpdate,
  applyRecoverFailedFieldVarianceEvidence,
  applyRequestReplacementDeltaEvidence,
  applyResumeFromDeltaEvidence,
} from "../validation/agentRun.js";

const OWNER = "owner-1";
const PROJECT_ID = "proj_fe3";
const LOCAL_DELTA = "delta-local-fe3";
const REMOTE_DELTA = `${PROJECT_ID}_${LOCAL_DELTA}`;
const RUN_ID = buildFieldVarianceAgentRunId(REMOTE_DELTA);
const NOW = "2026-09-03T12:00:00.000Z";
const BAD_EVIDENCE_ID = "ev-bad-jpeg";

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
    status: "running",
    currentStep: "analyze_evidence",
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
    outcome: null,
    lastEvidenceId: BAD_EVIDENCE_ID,
    errorCategory: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: BAD_EVIDENCE_ID,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    localEvidenceId: "evidence-bad",
    type: "photo",
    note: "",
    objectPath: `users/${OWNER}/projects/${PROJECT_ID}/evidence/${BAD_EVIDENCE_ID}/photo.jpg`,
    contentType: "image/jpeg",
    createdAt: NOW,
    localMeasurementId: null,
    localDeltaId: LOCAL_DELTA,
    ...overrides,
  };
}

function invalidJpegBytes(): Buffer {
  return Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
}

function loadersWith(evidence: Evidence[]): DomainLoaders {
  return {
    getProjectById: async () => undefined,
    getPlanItemById: async () => undefined,
    getMeasurementById: async () => undefined,
    getDeltaById: async () => ({
      id: REMOTE_DELTA,
      localDeltaId: LOCAL_DELTA,
      projectId: PROJECT_ID,
      planItemId: "plan-remote-1",
      measurementId: "meas-remote-1",
      type: "length",
      plannedValue: 40,
      actualValue: 25,
      difference: -15,
      percentDifference: -37.5,
      unit: "ft",
      unitCost: 1,
      costImpact: 1,
      productionRatePerDay: 1,
      scheduleImpactDays: 0,
      laborHoursPerUnit: 1,
      laborImpactHours: 1,
      status: "open",
      dispositionReason: "",
      disposedAt: null,
      createdAt: NOW,
    }),
    getEvidenceForProject: async () => evidence,
  };
}

async function main(): Promise<void> {
  // A. Classification
  {
    const classified = classifyRecoverableEvidenceMediaFailure(
      new Error(
        "Failed to decode image data. Please make sure the image is valid.",
      ),
    );
    check(
      classified !== null && classified.code === "unsupported_media",
      "A. undecodable JPEG message → unsupported_media",
    );
    check(
      classifyRecoverableEvidenceMediaFailure(
        new Error("RESOURCE_EXHAUSTED: quota exceeded"),
      ) === null,
      "A2. quota error is not recoverable evidence",
    );
    check(
      classifyRecoverableEvidenceMediaFailure(
        new Error("Deadline exceeded: timeout"),
      ) === null,
      "A3. timeout is not recoverable evidence",
    );
  }

  // A/B/C/D/E/F/G/H — cycle soft recovery
  {
    const photo = makeEvidence();
    const store = {
      runs: new Map<string, AgentRun>([
        [RUN_ID, makeAgentRun({ lastEvidenceId: BAD_EVIDENCE_ID })],
      ]),
      evidence: [photo],
      taskEnqueueCount: 0,
      replacementCalls: 0,
    };

    const cycle = await executeFieldVarianceAssessmentCycle(
      store.runs.get(RUN_ID)!,
      {
        loaders: loadersWith(store.evidence),
        updateAgentRunStateFn: async (id, update: AgentRunStateUpdate) => {
          const current = store.runs.get(id)!;
          const next = applyAgentRunStateUpdate(current, update);
          store.runs.set(id, next);
          return next;
        },
        requestReplacementDeltaEvidenceFn: async (id, input) => {
          store.replacementCalls += 1;
          const current = store.runs.get(id)!;
          const result = applyRequestReplacementDeltaEvidence(current, input);
          store.runs.set(id, result.agentRun);
          return result;
        },
        resolveRequestedProjectMemberIdFn: async () => null,
        preferredEvidenceId: BAD_EVIDENCE_ID,
        loadPhotoBytesFn: async () => ({
          ok: true,
          photo: {
            evidenceId: BAD_EVIDENCE_ID,
            mimeType: "image/jpeg",
            byteSize: invalidJpegBytes().length,
            bytes: invalidJpegBytes(),
          },
        }),
        runEvidenceAnalysis: async () => {
          throw new Error("model should not be called for invalid magic bytes");
        },
        runAgent: createStubFieldVarianceAgentRunner({
          summary: "should not run",
          evidenceAssessment: "n/a",
          recommendedAction: "prepare_summary",
          userVisibleRationale: "should not run",
        }),
      },
    );

    check(cycle.kind === "waiting_for_evidence", "B. running → waiting_for_evidence");
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.agentRun.status === "waiting_for_evidence" &&
        cycle.agentRun.currentStep === "waiting_for_evidence",
      "B2. status/step waiting_for_evidence",
    );
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.pendingRequest.kind === "delta_evidence",
      "C. pendingKind = delta_evidence",
    );
    check(cycle.agentRun.id === RUN_ID, "D. same AgentRun ID");
    check(
      cycle.agentRun.contextRefs.remoteDeltaId === REMOTE_DELTA &&
        cycle.agentRun.contextRefs.localDeltaId === LOCAL_DELTA,
      "E. Delta identity unchanged",
    );
    check(
      cycle.agentRun.contextRefs.remoteMeasurementId === "meas-remote-1",
      "F. Measurement identity unchanged",
    );
    check(store.evidence[0] === photo, "G. invalid Evidence retained in store");
    check(
      cycle.agentRun.lastEvidenceId === BAD_EVIDENCE_ID,
      "H. lastEvidenceId retained (blocks replay)",
    );
    check(store.taskEnqueueCount === 0, "I. no Cloud Task enqueue on reopen");
    check(store.replacementCalls === 1, "I2. one replacement request write");
    check(
      cycle.agentRun.errorCategory === "unsupported_media",
      "H2. errorCategory preserved as unsupported_media",
    );
  }

  // analyzeEvidence decode path (Gemini text)
  {
    const photo = makeEvidence({ id: "ev-decode" });
    const result = await analyzeEvidenceForAgentRun(
      makeAgentRun({ lastEvidenceId: "ev-decode" }),
      { hasDirectDeltaEvidence: true, directDeltaEvidenceCount: 1 },
      {
        loaders: loadersWith([photo]),
        preferredEvidenceId: "ev-decode",
        loadPhotoBytesFn: async () => ({
          ok: true,
          photo: {
            evidenceId: "ev-decode",
            mimeType: "image/jpeg",
            byteSize: 12,
            bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4, 5, 6, 7, 8]),
          },
        }),
        runEvidenceAnalysis: async () => {
          throw new Error(
            "Failed to decode image data. Please make sure the image is valid.",
          );
        },
      },
    );
    check(
      result.kind === "analyzed" &&
        result.analysis.relevance === "unsupported_media",
      "A4. Gemini decode error normalized to unsupported_media analysis",
    );
  }

  // J/K — genuine failure still terminalizes
  {
    const photo = makeEvidence();
    const store = {
      runs: new Map<string, AgentRun>([[RUN_ID, makeAgentRun()]]),
    };

    const cycle = await executeFieldVarianceAssessmentCycle(
      store.runs.get(RUN_ID)!,
      {
        loaders: loadersWith([photo]),
        updateAgentRunStateFn: async (id, update) => {
          const current = store.runs.get(id)!;
          const next = applyAgentRunStateUpdate(current, update);
          store.runs.set(id, next);
          return next;
        },
        resolveRequestedProjectMemberIdFn: async () => null,
        preferredEvidenceId: BAD_EVIDENCE_ID,
        loadPhotoBytesFn: async () => ({
          ok: true,
          photo: {
            evidenceId: BAD_EVIDENCE_ID,
            mimeType: "image/jpeg",
            byteSize: 12,
            bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4, 5, 6, 7, 8]),
          },
        }),
        runEvidenceAnalysis: createStubEvidenceAnalysisRunner({
          evidenceId: BAD_EVIDENCE_ID,
          evidenceType: "photo",
          relevance: "relevant",
          description: "ok",
          supportsDocumentedVariance: true,
          needsAdditionalEvidence: false,
          suggestedFollowUp: null,
          userVisibleRationale: "ok",
        }),
        runAgent: async () => {
          throw new Error("firestore_unavailable: unexpected repository failure");
        },
      },
    );

    check(cycle.kind === "failed", "J. genuine execution error → failed");
    check(
      cycle.kind === "failed" &&
        cycle.agentRun.status === "failed" &&
        cycle.agentRun.currentStep === "failed",
      "J2. failed/failed persisted",
    );
    check(isTerminalAgentRunStatus("failed"), "K. failed remains terminal status");
    check(
      canTransitionAgentRunStatus("failed", "waiting_for_evidence"),
      "K2. failed→waiting allowed only for explicit recovery path",
    );
    check(
      !canTransitionAgentRunStatus("failed", "running"),
      "K3. failed→running still rejected",
    );
  }

  // L–Y legacy recovery (pure)
  {
    const failed = makeAgentRun({
      status: "failed",
      currentStep: "failed",
      errorCategory:
        "Failed to decode image data. Please make sure the image is valid.",
      lastEvidenceId: BAD_EVIDENCE_ID,
      completedAt: NOW,
      pendingRequest: null,
    });

    check(
      isEligibleForFailedEvidenceRecovery(failed),
      "L. eligible failed decode-error run",
    );
    check(
      isRecoverableEvidenceErrorCategory(failed.errorCategory),
      "L2. historical errorCategory recognized",
    );

    const recovered = applyRecoverFailedFieldVarianceEvidence(failed, {
      nowIso: "2026-09-03T13:00:00.000Z",
    });
    check(recovered.outcome === "recovered", "L3. recover outcome");
    check(
      recovered.agentRun.status === "waiting_for_evidence" &&
        recovered.agentRun.currentStep === "waiting_for_evidence",
      "M. reopened waiting_for_evidence",
    );
    check(
      recovered.agentRun.pendingRequest?.kind === "delta_evidence",
      "N. pendingKind delta_evidence",
    );
    check(recovered.agentRun.id === RUN_ID, "O. same AgentRun");
    check(
      recovered.agentRun.contextRefs.remoteDeltaId === REMOTE_DELTA,
      "P. same Delta refs",
    );
    check(
      recovered.agentRun.contextRefs.remoteMeasurementId === "meas-remote-1",
      "Q. no new Measurement identity",
    );
    check(
      recovered.agentRun.lastEvidenceId === BAD_EVIDENCE_ID,
      "T2. lastEvidenceId retained after reopen (no auto-process)",
    );

    const again = applyRecoverFailedFieldVarianceEvidence(recovered.agentRun);
    check(again.outcome === "existing", "U. repeated reopen idempotent");

    const unrelated = makeAgentRun({
      status: "failed",
      currentStep: "failed",
      errorCategory: "firestore_unavailable",
      completedAt: NOW,
    });
    check(
      !isEligibleForFailedEvidenceRecovery(unrelated),
      "V. unrelated failed cannot reopen",
    );

    try {
      applyRecoverFailedFieldVarianceEvidence(unrelated);
      check(false, "V2. unrelated throws");
    } catch (error) {
      check(
        error instanceof Error &&
          (error as { code?: string }).code === "evidence_recovery_not_eligible",
        "V2. unrelated throws not_eligible",
      );
    }

    const completed = makeAgentRun({
      status: "completed",
      currentStep: "completed",
      completedAt: NOW,
      errorCategory: "unsupported_media",
    });
    check(!isEligibleForFailedEvidenceRecovery(completed), "W. completed cannot reopen");

    const escalated = makeAgentRun({
      status: "escalated",
      currentStep: "escalated",
      completedAt: NOW,
      errorCategory: "unsupported_media",
    });
    check(!isEligibleForFailedEvidenceRecovery(escalated), "X. escalated cannot reopen");
  }

  // Resume after reopen — new evidence only
  {
    const waiting = applyRecoverFailedFieldVarianceEvidence(
      makeAgentRun({
        status: "failed",
        currentStep: "failed",
        errorCategory: "unsupported_media",
        lastEvidenceId: BAD_EVIDENCE_ID,
        completedAt: NOW,
      }),
    ).agentRun;

    const same = applyResumeFromDeltaEvidence(waiting, {
      evidenceId: BAD_EVIDENCE_ID,
    });
    check(
      same.outcome === "already_resumed",
      "resume: same bad Evidence → already_resumed (no reprocess)",
    );

    const next = applyResumeFromDeltaEvidence(waiting, {
      evidenceId: "ev-new-valid",
    });
    check(
      next.outcome === "resumed" &&
        next.agentRun.id === RUN_ID &&
        next.agentRun.lastEvidenceId === "ev-new-valid" &&
        next.agentRun.status === "running",
      "resume: NEW Evidence → same AgentRun running",
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }

  console.log("\nAll Phase 2F-E.3 agent recoverable-evidence checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
