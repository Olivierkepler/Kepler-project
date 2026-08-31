/**
 * Phase A8 presentation helper self-check.
 * Run: npx tsx src/utils/domain/agentRunPresentation.selftest.ts
 */

import type { AgentRunSummary } from "../../types/agentRun";
import {
  buildAgentRunPresentation,
  shouldPollAgentRun,
} from "./agentRunPresentation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function baseRun(
  overrides: Partial<AgentRunSummary> = {},
): AgentRunSummary {
  return {
    id: "field-variance:delta-1",
    workflowType: "field_variance",
    status: "queued",
    currentStep: "queued",
    pendingRequest: null,
    outcome: null,
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
    completedAt: null,
    lastEvidenceId: null,
    deltaContext: {
      localDeltaId: "local-delta-1",
      remoteDeltaId: "delta-1",
      localMeasurementId: "local-measurement-1",
      remotePlanItemId: "remote-plan-1",
    },
    ...overrides,
  };
}

const original = baseRun();

assert(
  buildAgentRunPresentation(baseRun()).badge === "QUEUED",
  "queued → QUEUED",
);

assert(
  buildAgentRunPresentation(
    baseRun({ status: "running", currentStep: "load_context" }),
  ).badge === "ANALYZING",
  "running/load_context → ANALYZING",
);

assert(
  buildAgentRunPresentation(
    baseRun({ status: "running", currentStep: "analyze_evidence" }),
  ).badge === "ANALYZING EVIDENCE",
  "running/analyze_evidence → ANALYZING EVIDENCE",
);

assert(
  buildAgentRunPresentation(
    baseRun({ status: "running", currentStep: "prepare_summary" }),
  ).badge === "PREPARING SUMMARY",
  "running/prepare_summary → PREPARING SUMMARY",
);

assert(
  buildAgentRunPresentation(
    baseRun({
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest: {
        kind: "delta_evidence",
        message: "Add a field photo or note documenting this difference.",
        requestedAt: "2026-08-23T08:01:00.000Z",
      requestedProjectMemberId: null,
      },
    }),
  ).badge === "NEEDS EVIDENCE",
  "waiting_for_evidence → NEEDS EVIDENCE",
);

assert(
  buildAgentRunPresentation(
    baseRun({
      status: "completed",
      currentStep: "completed",
      outcome: {
        kind: "summary_ready",
        summaryId: "agent-summary:field-variance:delta-1",
        userVisibleRationale: "Ready for review.",
      },
    }),
  ).badge === "SUMMARY READY",
  "completed/summary_ready → SUMMARY READY",
);

assert(
  buildAgentRunPresentation(
    baseRun({ status: "failed", currentStep: "failed" }),
  ).badge === "NEEDS ATTENTION",
  "failed → NEEDS ATTENTION",
);

assert(
  buildAgentRunPresentation(
    baseRun({
      status: "escalated",
      currentStep: "escalated",
      outcome: {
        kind: "escalated",
        summaryId: null,
        userVisibleRationale: "Needs human review.",
      },
    }),
  ).badge === "ESCALATED",
  "escalated → ESCALATED",
);

const waitingPresentation = buildAgentRunPresentation(
  baseRun({
    status: "waiting_for_evidence",
    currentStep: "waiting_for_evidence",
    pendingRequest: {
      kind: "delta_evidence",
      message: "Add evidence.",
      requestedAt: "2026-08-23T08:01:00.000Z",
      requestedProjectMemberId: null,
    },
  }),
);

assert(
  waitingPresentation.ctaType === "add_evidence",
  "Evidence CTA only when waiting with pending request",
);

const completedPresentation = buildAgentRunPresentation(
  baseRun({
    status: "completed",
    currentStep: "completed",
    outcome: {
      kind: "summary_ready",
      summaryId: "agent-summary:field-variance:delta-1",
      userVisibleRationale: "Ready.",
    },
  }),
);

assert(
  completedPresentation.ctaType === "review_summary",
  "Summary CTA only when completed with summaryId",
);

const progress = buildAgentRunPresentation(
  baseRun({ status: "running", currentStep: "assess_variance" }),
).progressSteps;

assert(progress.length === 6, "progress steps count");
assert(
  progress.every((step) => typeof step.label === "string"),
  "no fake timeline history generated",
);

assert(original.status === "queued", "input not mutated");

assert(
  shouldPollAgentRun(baseRun({ status: "running", currentStep: "load_context" })),
  "poll while running",
);

assert(
  !shouldPollAgentRun(
    baseRun({ status: "waiting_for_evidence", currentStep: "waiting_for_evidence" }),
  ),
  "do not poll while waiting_for_evidence",
);

console.log("agentRunPresentation.selftest: PASS");
