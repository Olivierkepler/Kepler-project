import type { AgentRun } from "../domain/agentRun.js";
import type { AgentSummary } from "../domain/agentSummary.js";

export type AgentRunPendingRequestDTO = {
  kind: "delta_evidence";
  message: string;
  requestedAt: string;
  /** Canonical ProjectMember.id when uniquely targeted; null = owner fallback. */
  requestedProjectMemberId: string | null;
};

export type AgentRunOutcomeDTO = {
  kind: "summary_ready" | "escalated" | "failed";
  summaryId: string | null;
  userVisibleRationale: string;
};

export type AgentRunDeltaContextDTO = {
  localDeltaId: string;
  remoteDeltaId: string;
  localMeasurementId: string;
  remotePlanItemId: string;
};

export type AgentRunSummaryDTO = {
  id: string;
  workflowType: AgentRun["workflowType"];
  status: AgentRun["status"];
  currentStep: AgentRun["currentStep"];
  pendingRequest: AgentRunPendingRequestDTO | null;
  outcome: AgentRunOutcomeDTO | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastEvidenceId: string | null;
  deltaContext: AgentRunDeltaContextDTO;
};

export type AgentSummaryEvidenceAssessmentDTO = {
  evidenceId: string | null;
  evidenceType: "photo" | "note" | null;
  relevance: AgentSummary["evidenceAssessment"]["relevance"];
  userVisibleRationale: string | null;
};

export type AgentSummaryDocumentedImpactDTO = {
  plannedValue: number | null;
  actualValue: number | null;
  difference: number | null;
  percentDifference: number | null;
  costImpact: number | null;
  laborImpactHours: number | null;
  scheduleImpactDays: number | null;
};

export type AgentSummaryDTO = {
  id: string;
  agentRunId: string;
  projectId: string;
  createdAt: string;
  varianceSummary: string;
  documentationSummary: string;
  evidenceAssessment: AgentSummaryEvidenceAssessmentDTO;
  documentedImpact: AgentSummaryDocumentedImpactDTO;
  recommendedHumanNextStep: string | null;
  sourceRefs: {
    evidenceIds: string[];
  };
};

export function toAgentRunSummaryDTO(agentRun: AgentRun): AgentRunSummaryDTO {
  return {
    id: agentRun.id,
    workflowType: agentRun.workflowType,
    status: agentRun.status,
    currentStep: agentRun.currentStep,
    pendingRequest: agentRun.pendingRequest
      ? {
          kind: agentRun.pendingRequest.kind,
          message: agentRun.pendingRequest.message,
          requestedAt: agentRun.pendingRequest.requestedAt,
          requestedProjectMemberId:
            agentRun.pendingRequest.requestedProjectMemberId,
        }
      : null,
    outcome: agentRun.outcome
      ? {
          kind: agentRun.outcome.kind,
          summaryId: agentRun.outcome.summaryId,
          userVisibleRationale: agentRun.outcome.userVisibleRationale,
        }
      : null,
    createdAt: agentRun.createdAt,
    updatedAt: agentRun.updatedAt,
    completedAt: agentRun.completedAt,
    lastEvidenceId: agentRun.lastEvidenceId,
    deltaContext: {
      localDeltaId: agentRun.contextRefs.localDeltaId,
      remoteDeltaId: agentRun.contextRefs.remoteDeltaId,
      localMeasurementId: agentRun.contextRefs.localMeasurementId,
      remotePlanItemId: agentRun.contextRefs.remotePlanItemId,
    },
  };
}

export function toAgentSummaryDTO(summary: AgentSummary): AgentSummaryDTO {
  return {
    id: summary.id,
    agentRunId: summary.agentRunId,
    projectId: summary.projectId,
    createdAt: summary.createdAt,
    varianceSummary: summary.varianceSummary,
    documentationSummary: summary.documentationSummary,
    evidenceAssessment: {
      evidenceId: summary.evidenceAssessment.evidenceId,
      evidenceType: summary.evidenceAssessment.evidenceType,
      relevance: summary.evidenceAssessment.relevance,
      userVisibleRationale: summary.evidenceAssessment.userVisibleRationale,
    },
    documentedImpact: { ...summary.documentedImpact },
    recommendedHumanNextStep: summary.recommendedHumanNextStep,
    sourceRefs: {
      evidenceIds: [...summary.sourceRefs.evidenceIds],
    },
  };
}

const INTERNAL_AGENT_RUN_KEYS = new Set([
  "ownerUid",
  "schemaVersion",
  "triggerType",
  "triggerSourceId",
  "idempotencyKey",
  "attemptCount",
  "maxAttempts",
  "errorCategory",
  "contextRefs",
  "requestId",
]);

export function assertAgentRunDtoHasNoInternalFields(
  value: unknown,
): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (INTERNAL_AGENT_RUN_KEYS.has(key)) {
      return false;
    }
  }

  const record = value as Record<string, unknown>;
  const pending = record.pendingRequest;
  if (
    pending !== null &&
    typeof pending === "object" &&
    "requestId" in (pending as Record<string, unknown>)
  ) {
    return false;
  }

  return true;
}

const INTERNAL_SUMMARY_KEYS = new Set([
  "ownerUid",
  "schemaVersion",
  "workflowType",
  "remoteDeltaId",
  "localDeltaId",
  "remoteMeasurementId",
  "localMeasurementId",
  "remotePlanItemId",
]);

export function assertAgentSummaryDtoHasNoInternalFields(
  value: unknown,
): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (INTERNAL_SUMMARY_KEYS.has(key)) {
      return false;
    }
  }

  return true;
}
