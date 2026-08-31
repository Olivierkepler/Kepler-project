export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_for_evidence"
  | "completed"
  | "failed"
  | "escalated";

export type AgentRunStep =
  | "queued"
  | "load_context"
  | "assess_variance"
  | "check_evidence_policy"
  | "request_evidence"
  | "waiting_for_evidence"
  | "analyze_evidence"
  | "prepare_summary"
  | "record_outcome"
  | "completed"
  | "failed"
  | "escalated";

export type AgentRunPendingRequest = {
  kind: "delta_evidence";
  message: string;
  requestedAt: string;
  /** Canonical ProjectMember.id when uniquely targeted; null = owner fallback. */
  requestedProjectMemberId: string | null;
};

export type AgentRunOutcome = {
  kind: "summary_ready" | "escalated" | "failed";
  summaryId: string | null;
  userVisibleRationale: string;
};

export type AgentRunDeltaContext = {
  localDeltaId: string;
  remoteDeltaId: string;
  localMeasurementId: string;
  remotePlanItemId: string;
};

export type AgentRunSummary = {
  id: string;
  workflowType: "field_variance";
  status: AgentRunStatus;
  currentStep: AgentRunStep;
  pendingRequest: AgentRunPendingRequest | null;
  outcome: AgentRunOutcome | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastEvidenceId: string | null;
  deltaContext: AgentRunDeltaContext;
};
