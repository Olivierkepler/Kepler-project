import {
  AgentRunError,
  FIELD_VARIANCE_WORKFLOW_TYPE,
} from "./agentRun.js";
import type { EvidenceRelevance } from "./evidenceAnalysis.js";

export const AGENT_SUMMARY_SCHEMA_VERSION = 1 as const;

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
