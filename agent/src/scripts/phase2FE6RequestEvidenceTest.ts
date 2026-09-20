/**
 * Phase 2F-E.6 — request_evidence → waiting_for_evidence correction.
 * Run: npm run test:fe6-request-evidence
 *
 * Pure in-memory cycle + validation — no Firestore / production mutation.
 */
import { createStubEvidenceAnalysisRunner } from "../agent/evidenceAnalysisAgent.js";
import { createStubFieldVarianceAgentRunner } from "../agent/fieldVarianceAgent.js";
import type { FieldVarianceAssessment } from "../domain/assessment.js";
import type { EvidenceAnalysis } from "../domain/evidenceAnalysis.js";
import {
  buildFieldVarianceAgentRunId,
  type AgentRun,
  type AgentRunStateUpdate,
} from "../domain/agentRun.js";
import type { Evidence } from "../domain/evidence.js";
import { isEligibleForStickyRequestEvidenceRecovery } from "../domain/stickyRequestEvidenceRecovery.js";
import { executeFieldVarianceAssessmentCycle } from "../services/fieldVarianceAssessmentCycle.js";
import {
  applyAgentRunStateUpdate,
  applyRecoverStickyRequestEvidence,
  applyRequestAdditionalDeltaEvidence,
  applyRequestDeltaEvidence,
  applyRequestReplacementDeltaEvidence,
} from "../validation/agentRun.js";
import type { DomainLoaders } from "../tools/toolContext.js";

const OWNER = "owner-1";
const PROJECT_ID = "proj_fe6";
const LOCAL_DELTA = "delta-local-fe6";
const REMOTE_DELTA = `${PROJECT_ID}_${LOCAL_DELTA}`;
const RUN_ID = buildFieldVarianceAgentRunId(REMOTE_DELTA);
const NOW = "2026-09-03T14:00:00.000Z";
const ANALYZED_EVIDENCE_ID = "ev-analyzed-fe6";

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
    currentStep: "check_evidence_policy",
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
    lastEvidenceId: ANALYZED_EVIDENCE_ID,
    errorCategory: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: ANALYZED_EVIDENCE_ID,
    ownerUid: OWNER,
    projectId: PROJECT_ID,
    localEvidenceId: "evidence-analyzed",
    type: "photo",
    note: "",
    objectPath: `users/${OWNER}/projects/${PROJECT_ID}/evidence/${ANALYZED_EVIDENCE_ID}/photo.jpg`,
    contentType: "image/jpeg",
    createdAt: NOW,
    localMeasurementId: null,
    localDeltaId: LOCAL_DELTA,
    ...overrides,
  };
}

function makeAnalysis(
  overrides: Partial<EvidenceAnalysis> = {},
): EvidenceAnalysis {
  return {
    evidenceId: ANALYZED_EVIDENCE_ID,
    evidenceType: "photo",
    relevance: "insufficient_information",
    description: "Photo is related but does not show the full installed condition.",
    supportsDocumentedVariance: false,
    needsAdditionalEvidence: true,
    suggestedFollowUp: "Capture another clear photo of the affected work.",
    userVisibleRationale: "More documentation is needed.",
    ...overrides,
  };
}

function makeAssessment(
  overrides: Partial<FieldVarianceAssessment> = {},
): FieldVarianceAssessment {
  return {
    summary: "Variance needs more documentation.",
    evidenceAssessment: "Existing photo is insufficient.",
    recommendedAction: "request_evidence",
    userVisibleRationale:
      "Provide additional evidence showing the installed condition.",
    ...overrides,
  };
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Array(100).fill(1)]);
}

type Store = {
  runs: Map<string, AgentRun>;
  evidence: Evidence[];
  additionalCalls: number;
  replacementCalls: number;
  classicRequestCalls: number;
};

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
      plannedValue: 10,
      actualValue: 12,
      difference: 2,
      percentDifference: 20,
      unit: "ft",
      unitCost: 1,
      costImpact: 2,
      productionRatePerDay: 1,
      scheduleImpactDays: 0,
      laborHoursPerUnit: 1,
      laborImpactHours: 2,
      status: "open",
      dispositionReason: "",
      disposedAt: null,
      createdAt: NOW,
    }),
    getEvidenceForProject: async () => evidence,
  };
}

async function runCycle(
  store: Store,
  assessment: FieldVarianceAssessment,
  analysis: EvidenceAnalysis,
): Promise<Awaited<ReturnType<typeof executeFieldVarianceAssessmentCycle>>> {
  return executeFieldVarianceAssessmentCycle(store.runs.get(RUN_ID)!, {
    loaders: loadersWith(store.evidence),
    updateAgentRunStateFn: async (id, update: AgentRunStateUpdate) => {
      const current = store.runs.get(id)!;
      const next = applyAgentRunStateUpdate(current, update);
      store.runs.set(id, next);
      return next;
    },
    requestDeltaEvidenceFn: async (id, input) => {
      store.classicRequestCalls += 1;
      const current = store.runs.get(id)!;
      const result = applyRequestDeltaEvidence(current, input);
      store.runs.set(id, result.agentRun);
      return result;
    },
    requestReplacementDeltaEvidenceFn: async (id, input) => {
      store.replacementCalls += 1;
      const current = store.runs.get(id)!;
      const result = applyRequestReplacementDeltaEvidence(current, input);
      store.runs.set(id, result.agentRun);
      return result;
    },
    requestAdditionalDeltaEvidenceFn: async (id, input) => {
      store.additionalCalls += 1;
      const current = store.runs.get(id)!;
      const result = applyRequestAdditionalDeltaEvidence(current, input);
      store.runs.set(id, result.agentRun);
      return result;
    },
    resolveRequestedProjectMemberIdFn: async () => null,
    enableEvidenceAnalysis: true,
    preferredEvidenceId: ANALYZED_EVIDENCE_ID,
    loadPhotoBytesFn: async () => ({
      ok: true,
      photo: {
        evidenceId: ANALYZED_EVIDENCE_ID,
        mimeType: "image/jpeg",
        byteSize: jpegBytes().length,
        bytes: jpegBytes(),
      },
    }),
    runEvidenceAnalysis: createStubEvidenceAnalysisRunner(analysis),
    runAgent: createStubFieldVarianceAgentRunner(assessment),
  });
}

async function main(): Promise<void> {
  // --- Bug reproduction: presence + request_evidence must wait ---
  {
    const photo = makeEvidence();
    const store: Store = {
      runs: new Map([[RUN_ID, makeAgentRun()]]),
      evidence: [photo],
      additionalCalls: 0,
      replacementCalls: 0,
      classicRequestCalls: 0,
    };

    const cycle = await runCycle(store, makeAssessment(), makeAnalysis());

    check(
      cycle.kind === "waiting_for_evidence",
      "1. bugfix: request_evidence + existing Evidence → waiting_for_evidence",
    );
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.agentRun.status === "waiting_for_evidence" &&
        cycle.agentRun.currentStep === "waiting_for_evidence",
      "2. status/step waiting_for_evidence",
    );
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.pendingRequest.kind === "delta_evidence",
      "3. pendingKind = delta_evidence",
    );
    check(
      cycle.agentRun.lastEvidenceId === ANALYZED_EVIDENCE_ID,
      "4. lastEvidenceId preserved (analyzed Evidence)",
    );
    check(store.additionalCalls === 1, "5. additional Evidence request used");
    check(store.classicRequestCalls === 0, "5b. classic A4 path not used when Evidence exists");
    check(store.replacementCalls === 0, "5c. media replacement path not used");
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.pendingRequest.message.includes("installed condition"),
      "6. safe assessment rationale persisted as Evidence request",
    );
    check(cycle.agentRun.id === RUN_ID, "7. same AgentRun");
    check(
      cycle.agentRun.contextRefs.localDeltaId === LOCAL_DELTA &&
        cycle.agentRun.contextRefs.remoteDeltaId === REMOTE_DELTA,
      "8. same Delta",
    );
    check(
      cycle.agentRun.errorCategory === null,
      "9. errorCategory not unsupported_media for post-analysis request",
    );
  }

  // --- Completion path unchanged ---
  {
    const store: Store = {
      runs: new Map([[RUN_ID, makeAgentRun()]]),
      evidence: [makeEvidence()],
      additionalCalls: 0,
      replacementCalls: 0,
      classicRequestCalls: 0,
    };
    const cycle = await runCycle(
      store,
      makeAssessment({
        recommendedAction: "prepare_summary",
        userVisibleRationale: "Ready to summarize.",
      }),
      makeAnalysis({
        relevance: "relevant",
        needsAdditionalEvidence: false,
        supportsDocumentedVariance: true,
      }),
    );
    check(
      cycle.kind === "started" &&
        cycle.agentRun.status === "running" &&
        cycle.agentRun.pendingRequest === null,
      "10. prepare_summary path unchanged (started/running)",
    );
    check(store.additionalCalls === 0, "10b. no Evidence request on prepare_summary");
  }

  // --- Escalation path unchanged ---
  {
    const store: Store = {
      runs: new Map([[RUN_ID, makeAgentRun()]]),
      evidence: [makeEvidence()],
      additionalCalls: 0,
      replacementCalls: 0,
      classicRequestCalls: 0,
    };
    const cycle = await runCycle(
      store,
      makeAssessment({
        recommendedAction: "escalate",
        userVisibleRationale: "Needs human review.",
      }),
      makeAnalysis({
        relevance: "relevant",
        needsAdditionalEvidence: false,
      }),
    );
    check(
      cycle.kind === "started" && cycle.agentRun.pendingRequest === null,
      "11. escalate assessment remains started for resume escalate write",
    );
  }

  // --- Unsupported media soft path unchanged ---
  {
    const store: Store = {
      runs: new Map([[RUN_ID, makeAgentRun()]]),
      evidence: [makeEvidence()],
      additionalCalls: 0,
      replacementCalls: 0,
      classicRequestCalls: 0,
    };
    const cycle = await runCycle(
      store,
      makeAssessment({ recommendedAction: "prepare_summary" }),
      makeAnalysis({ relevance: "unsupported_media" }),
    );
    check(
      cycle.kind === "waiting_for_evidence" &&
        cycle.agentRun.errorCategory === "unsupported_media",
      "12. unsupported_media still uses replacement waiting path",
    );
    check(store.replacementCalls === 1, "12b. replacement request used");
    check(store.additionalCalls === 0, "12c. additional path not used for media");
  }

  // --- Sticky recovery eligibility + apply ---
  {
    const sticky = makeAgentRun({
      status: "running",
      currentStep: "assess_variance",
      lastEvidenceId: ANALYZED_EVIDENCE_ID,
      pendingRequest: null,
    });
    check(
      isEligibleForStickyRequestEvidenceRecovery(sticky),
      "13. sticky fixture eligible",
    );

    const recovered = applyRecoverStickyRequestEvidence(sticky, {
      message: "Provide additional evidence showing the installed condition.",
    });
    check(recovered.outcome === "recovered", "14. sticky recovery outcome recovered");
    check(
      recovered.agentRun.status === "waiting_for_evidence" &&
        recovered.agentRun.currentStep === "waiting_for_evidence" &&
        recovered.agentRun.pendingRequest?.kind === "delta_evidence",
      "15. sticky → waiting + delta_evidence",
    );
    check(
      recovered.agentRun.lastEvidenceId === ANALYZED_EVIDENCE_ID,
      "16. sticky recovery preserves lastEvidenceId",
    );
    check(recovered.agentRun.id === RUN_ID, "17. sticky same AgentRun");

    const again = applyRecoverStickyRequestEvidence(recovered.agentRun, {});
    check(again.outcome === "existing", "18. sticky recovery idempotent");
    check(
      again.agentRun.pendingRequest?.requestId ===
        recovered.agentRun.pendingRequest?.requestId,
      "18b. same pending request on repeat",
    );

    check(
      !isEligibleForStickyRequestEvidenceRecovery(
        makeAgentRun({
          status: "running",
          currentStep: "analyze_evidence",
          lastEvidenceId: ANALYZED_EVIDENCE_ID,
        }),
      ),
      "19. wrong currentStep denied",
    );
    check(
      !isEligibleForStickyRequestEvidenceRecovery(
        makeAgentRun({
          status: "completed",
          currentStep: "completed",
          lastEvidenceId: ANALYZED_EVIDENCE_ID,
          completedAt: NOW,
          outcome: {
            kind: "summary_ready",
            summaryId: "sum-1",
            userVisibleRationale: "done",
          },
        }),
      ),
      "20. completed denied",
    );
    check(
      !isEligibleForStickyRequestEvidenceRecovery(
        makeAgentRun({
          status: "escalated",
          currentStep: "escalated",
          lastEvidenceId: ANALYZED_EVIDENCE_ID,
          completedAt: NOW,
          outcome: {
            kind: "escalated",
            summaryId: null,
            userVisibleRationale: "escalated",
          },
        }),
      ),
      "21. escalated denied",
    );
    check(
      !isEligibleForStickyRequestEvidenceRecovery(
        makeAgentRun({
          status: "failed",
          currentStep: "failed",
          lastEvidenceId: ANALYZED_EVIDENCE_ID,
          errorCategory: "unsupported_media",
          outcome: {
            kind: "failed",
            summaryId: null,
            userVisibleRationale: "failed",
          },
          completedAt: NOW,
        }),
      ),
      "22. failed denied (use recover-evidence for media)",
    );
    check(
      !isEligibleForStickyRequestEvidenceRecovery(
        makeAgentRun({
          status: "running",
          currentStep: "assess_variance",
          lastEvidenceId: null,
        }),
      ),
      "23. no lastEvidenceId denied",
    );
  }

  // --- Pure additional write retains lastEvidenceId ---
  {
    const running = makeAgentRun({
      status: "running",
      currentStep: "assess_variance",
    });
    const result = applyRequestAdditionalDeltaEvidence(running, {
      message: "Capture another clear photo showing the affected work.",
    });
    check(
      result.outcome === "created" &&
        result.agentRun.lastEvidenceId === ANALYZED_EVIDENCE_ID &&
        result.agentRun.pendingRequest?.kind === "delta_evidence",
      "24. additional write keeps lastEvidenceId + pendingKind",
    );
  }

  if (failures > 0) {
    console.error(`\nFE6 FAILED with ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nFE6 ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
