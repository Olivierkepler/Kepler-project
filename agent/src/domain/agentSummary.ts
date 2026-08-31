import {
  AgentRunError,
  FIELD_VARIANCE_WORKFLOW_TYPE,
  type AgentRun,
} from "./agentRun.js";
import type { EvidenceRelevance } from "./evidenceAnalysis.js";

export const AGENT_SUMMARY_SCHEMA_VERSION = 1 as const;

/**
 * Agent-generated Field Variance documentation artifact (Phase A7).
 * Distinct from SavedFieldReport and Delta disposition.
 * No raw model prompts, CoT, image bytes, or signed URLs.
 */
export type AgentSummary = {
  id: string;
  schemaVersion: typeof AGENT_SUMMARY_SCHEMA_VERSION;
  ownerUid: string;
  projectId: string;
  agentRunId: string;
  workflowType: typeof FIELD_VARIANCE_WORKFLOW_TYPE;
  remoteDeltaId: string;
  localDeltaId: string;
  remoteMeasurementId: string;
  localMeasurementId: string;
  remotePlanItemId: string;
  createdAt: string;
  varianceSummary: string;
  documentationSummary: string;
  evidenceAssessment: {
    evidenceId: string | null;
    evidenceType: "photo" | "note" | null;
    relevance: EvidenceRelevance | null;
    userVisibleRationale: string | null;
  };
  documentedImpact: {
    plannedValue: number | null;
    actualValue: number | null;
    difference: number | null;
    percentDifference: number | null;
    costImpact: number | null;
    laborImpactHours: number | null;
    scheduleImpactDays: number | null;
  };
  recommendedHumanNextStep: string | null;
  sourceRefs: {
    evidenceIds: string[];
  };
};

/**
 * Deterministic Firestore document id for one summary per AgentRun.
 */
export function buildAgentSummaryId(agentRunId: string): string {
  const trimmed = agentRunId.trim();
  if (!trimmed) {
    throw new AgentRunError(
      "invalid_agent_run_id",
      "agentRunId is required for AgentSummary id",
    );
  }
  if (trimmed.includes("/")) {
    throw new AgentRunError(
      "invalid_agent_run_id",
      "agentRunId must not contain '/'",
    );
  }
  return `agent-summary:${trimmed}`;
}

export function buildAgentSummaryIdentityFromRun(agentRun: AgentRun): {
  id: string;
  ownerUid: string;
  projectId: string;
  agentRunId: string;
  remoteDeltaId: string;
  localDeltaId: string;
  remoteMeasurementId: string;
  localMeasurementId: string;
  remotePlanItemId: string;
} {
  return {
    id: buildAgentSummaryId(agentRun.id),
    ownerUid: agentRun.ownerUid,
    projectId: agentRun.projectId,
    agentRunId: agentRun.id,
    remoteDeltaId: agentRun.contextRefs.remoteDeltaId,
    localDeltaId: agentRun.contextRefs.localDeltaId,
    remoteMeasurementId: agentRun.contextRefs.remoteMeasurementId,
    localMeasurementId: agentRun.contextRefs.localMeasurementId,
    remotePlanItemId: agentRun.contextRefs.remotePlanItemId,
  };
}
