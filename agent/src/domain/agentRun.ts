/**
 * Field Variance AgentRun — trusted operational workflow state (Phase A1).
 * No model prompts, chain-of-thought, or AI execution fields.
 */

export const AGENT_RUN_SCHEMA_VERSION = 1 as const;

export const FIELD_VARIANCE_WORKFLOW_TYPE = "field_variance" as const;
export const DELTA_CREATED_TRIGGER_TYPE = "delta_created" as const;

export const DEFAULT_AGENT_RUN_MAX_ATTEMPTS = 5;

export type AgentRunWorkflowType = typeof FIELD_VARIANCE_WORKFLOW_TYPE;
export type AgentRunTriggerType = typeof DELTA_CREATED_TRIGGER_TYPE;

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

export type AgentRunContextRefs = {
  remoteDeltaId: string;
  localDeltaId: string;
  remoteMeasurementId: string;
  localMeasurementId: string;
  remotePlanItemId: string;
};

export type AgentRunPendingRequest = {
  kind: "delta_evidence";
  message: string;
  requestedAt: string;
  requestId: string;
  /**
   * Canonical ProjectMember.id when a unique active assignee was resolved
   * for the Plan Item. null = owner-routed fallback (no unique assignee).
   * Application-controlled — never chosen by the model.
   */
  requestedProjectMemberId: string | null;
};

export type AgentRunOutcome = {
  kind: "summary_ready" | "escalated" | "failed";
  summaryId: string | null;
  userVisibleRationale: string;
};

export type AgentRun = {
  id: string;
  schemaVersion: typeof AGENT_RUN_SCHEMA_VERSION;
  ownerUid: string;
  projectId: string;
  workflowType: AgentRunWorkflowType;
  triggerType: AgentRunTriggerType;
  triggerSourceId: string;
  idempotencyKey: string;
  status: AgentRunStatus;
  currentStep: AgentRunStep;
  attemptCount: number;
  maxAttempts: number;
  contextRefs: AgentRunContextRefs;
  pendingRequest: AgentRunPendingRequest | null;
  outcome: AgentRunOutcome | null;
  lastEvidenceId: string | null;
  errorCategory: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateAgentRunInput = {
  ownerUid: string;
  projectId: string;
  triggerSourceId: string;
  contextRefs: AgentRunContextRefs;
  maxAttempts?: number;
};

/**
 * Narrow state update. Tenant/source identity and contextRefs are immutable.
 */
export type AgentRunStateUpdate = {
  status?: AgentRunStatus;
  currentStep?: AgentRunStep;
  pendingRequest?: AgentRunPendingRequest | null;
  outcome?: AgentRunOutcome | null;
  lastEvidenceId?: string | null;
  errorCategory?: string | null;
};

export class AgentRunError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentRunError";
    this.code = code;
  }
}

const AGENT_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "queued",
  "running",
  "waiting_for_evidence",
  "completed",
  "failed",
  "escalated",
]);

const AGENT_RUN_STEPS: ReadonlySet<AgentRunStep> = new Set([
  "queued",
  "load_context",
  "assess_variance",
  "check_evidence_policy",
  "request_evidence",
  "waiting_for_evidence",
  "analyze_evidence",
  "prepare_summary",
  "record_outcome",
  "completed",
  "failed",
  "escalated",
]);

const RUNNING_STEPS: ReadonlySet<AgentRunStep> = new Set([
  "load_context",
  "assess_variance",
  "check_evidence_policy",
  "request_evidence",
  "analyze_evidence",
  "prepare_summary",
  "record_outcome",
]);

const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "completed",
  "failed",
  "escalated",
]);

const ALLOWED_STATUS_TRANSITIONS: Record<
  AgentRunStatus,
  ReadonlySet<AgentRunStatus>
> = {
  queued: new Set(["running"]),
  running: new Set([
    "queued",
    "waiting_for_evidence",
    "completed",
    "failed",
    "escalated",
  ]),
  waiting_for_evidence: new Set(["running", "failed", "escalated"]),
  completed: new Set(),
  // Narrow: only explicit recoverable-evidence recovery may leave failed.
  // /start and /resume still treat failed as terminal via isTerminalAgentRunStatus.
  failed: new Set(["waiting_for_evidence"]),
  escalated: new Set(),
};

export function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return (
    typeof value === "string" && AGENT_RUN_STATUSES.has(value as AgentRunStatus)
  );
}

export function isAgentRunStep(value: unknown): value is AgentRunStep {
  return typeof value === "string" && AGENT_RUN_STEPS.has(value as AgentRunStep);
}

export function isTerminalAgentRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Pure status transition gate for the Field Variance workflow.
 */
export function canTransitionAgentRunStatus(
  from: AgentRunStatus,
  to: AgentRunStatus,
): boolean {
  if (from === to) {
    return true;
  }

  return ALLOWED_STATUS_TRANSITIONS[from].has(to);
}

/**
 * Prevents clearly inconsistent status/step pairs.
 * status === "running" may use any active workflow step.
 */
export function isAgentRunStepConsistentWithStatus(
  status: AgentRunStatus,
  step: AgentRunStep,
): boolean {
  switch (status) {
    case "queued":
      return step === "queued";
    case "waiting_for_evidence":
      return step === "waiting_for_evidence";
    case "completed":
      return step === "completed";
    case "failed":
      return step === "failed";
    case "escalated":
      return step === "escalated";
    case "running":
      return RUNNING_STEPS.has(step);
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Domain identity / idempotency key for one Field Variance run per remote Delta.
 * Not a Cloud Tasks task name (A2 owns transport IDs).
 */
export function buildFieldVarianceIdempotencyKey(
  remoteDeltaId: string,
): string {
  const trimmed = remoteDeltaId.trim();

  if (!trimmed) {
    throw new AgentRunError(
      "invalid_remote_delta_id",
      "remoteDeltaId is required",
    );
  }

  if (trimmed.includes("/")) {
    throw new AgentRunError(
      "invalid_remote_delta_id",
      "remoteDeltaId must not contain '/'",
    );
  }

  return `field-variance:${trimmed}`;
}

/**
 * Deterministic Firestore document id for a Field Variance AgentRun.
 */
export function buildFieldVarianceAgentRunId(remoteDeltaId: string): string {
  return buildFieldVarianceIdempotencyKey(remoteDeltaId);
}

export function assertCanTransitionAgentRunStatus(
  from: AgentRunStatus,
  to: AgentRunStatus,
): void {
  if (!canTransitionAgentRunStatus(from, to)) {
    throw new AgentRunError(
      "illegal_status_transition",
      `Illegal AgentRun status transition: ${from} → ${to}`,
    );
  }
}
