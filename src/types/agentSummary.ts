export type EvidenceRelevance =
  | "relevant"
  | "possibly_relevant"
  | "not_relevant"
  | "insufficient_information"
  | "unsupported_media";

export type AgentSummaryEvidenceAssessment = {
  evidenceId: string | null;
  evidenceType: "photo" | "note" | null;
  relevance: EvidenceRelevance | null;
  userVisibleRationale: string | null;
};

export type AgentSummaryDocumentedImpact = {
  plannedValue: number | null;
  actualValue: number | null;
  difference: number | null;
  percentDifference: number | null;
  costImpact: number | null;
  laborImpactHours: number | null;
  scheduleImpactDays: number | null;
};

export type AgentSummary = {
  id: string;
  agentRunId: string;
  projectId: string;
  createdAt: string;
  varianceSummary: string;
  documentationSummary: string;
  evidenceAssessment: AgentSummaryEvidenceAssessment;
  documentedImpact: AgentSummaryDocumentedImpact;
  recommendedHumanNextStep: string | null;
  sourceRefs: {
    evidenceIds: string[];
  };
};
