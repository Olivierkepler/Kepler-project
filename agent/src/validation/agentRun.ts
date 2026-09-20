import {
  AGENT_RUN_SCHEMA_VERSION,
  AgentRunError,
  DELTA_CREATED_TRIGGER_TYPE,
  DEFAULT_AGENT_RUN_MAX_ATTEMPTS,
  FIELD_VARIANCE_WORKFLOW_TYPE,
  assertCanTransitionAgentRunStatus,
  buildFieldVarianceAgentRunId,
  buildFieldVarianceIdempotencyKey,
  isAgentRunStatus,
  isAgentRunStep,
  isAgentRunStepConsistentWithStatus,
  isTerminalAgentRunStatus,
  type AgentRun,
  type AgentRunContextRefs,
  type AgentRunOutcome,
  type AgentRunPendingRequest,
  type AgentRunStateUpdate,
  type AgentRunStatus,
  type CreateAgentRunInput,
} from "../domain/agentRun.js";
import {
  ADDITIONAL_DELTA_EVIDENCE_REQUEST_MESSAGE,
  buildDeltaEvidenceRequestId,
  normalizeDeltaEvidenceRequestMessage,
} from "../domain/deltaEvidenceRequest.js";
import {
  REPLACEMENT_EVIDENCE_REQUEST_MESSAGE,
  UNSUPPORTED_MEDIA_ERROR_CATEGORY,
  isEligibleForFailedEvidenceRecovery,
} from "../domain/recoverableEvidenceFailure.js";
import { isEligibleForStickyRequestEvidenceRecovery } from "../domain/stickyRequestEvidenceRecovery.js";
import { isFiniteNumber, isNonEmptyString, isRecord } from "./primitives.js";

function isValidTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isNonEmptyString(value)) {
    return undefined;
  }

  return value.trim();
}

function normalizeContextRefs(
  value: unknown,
): AgentRunContextRefs | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.remoteDeltaId) ||
    !isNonEmptyString(value.localDeltaId) ||
    !isNonEmptyString(value.remoteMeasurementId) ||
    !isNonEmptyString(value.localMeasurementId) ||
    !isNonEmptyString(value.remotePlanItemId)
  ) {
    return undefined;
  }

  return {
    remoteDeltaId: value.remoteDeltaId.trim(),
    localDeltaId: value.localDeltaId.trim(),
    remoteMeasurementId: value.remoteMeasurementId.trim(),
    localMeasurementId: value.localMeasurementId.trim(),
    remotePlanItemId: value.remotePlanItemId.trim(),
  };
}

function normalizePendingRequest(
  value: unknown,
): AgentRunPendingRequest | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (value.kind !== "delta_evidence") {
    return undefined;
  }

  if (
    !isNonEmptyString(value.message) ||
    !isValidTimestamp(value.requestedAt) ||
    !isNonEmptyString(value.requestId)
  ) {
    return undefined;
  }

  // Legacy documents without the field normalize to null (owner fallback).
  let requestedProjectMemberId: string | null = null;
  if (value.requestedProjectMemberId === null) {
    requestedProjectMemberId = null;
  } else if (isNonEmptyString(value.requestedProjectMemberId)) {
    requestedProjectMemberId = value.requestedProjectMemberId.trim();
  } else if (value.requestedProjectMemberId !== undefined) {
    return undefined;
  }

  return {
    kind: "delta_evidence",
    message: value.message.trim(),
    requestedAt: value.requestedAt.trim(),
    requestId: value.requestId.trim(),
    requestedProjectMemberId,
  };
}

function normalizeOutcome(
  value: unknown,
): AgentRunOutcome | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (
    value.kind !== "summary_ready" &&
    value.kind !== "escalated" &&
    value.kind !== "failed"
  ) {
    return undefined;
  }

  const summaryId = normalizeNullableString(value.summaryId);

  if (summaryId === undefined) {
    return undefined;
  }

  if (value.kind === "summary_ready" && summaryId === null) {
    return undefined;
  }

  if (!isNonEmptyString(value.userVisibleRationale)) {
    return undefined;
  }

  return {
    kind: value.kind,
    summaryId,
    userVisibleRationale: value.userVisibleRationale.trim(),
  };
}

function assertCompletedAtSemantics(
  status: AgentRunStatus,
  completedAt: string | null,
): void {
  if (isTerminalAgentRunStatus(status)) {
    if (!isValidTimestamp(completedAt)) {
      throw new AgentRunError(
        "invalid_completed_at",
        "Terminal AgentRun status requires a valid completedAt timestamp",
      );
    }
    return;
  }

  if (completedAt !== null) {
    throw new AgentRunError(
      "invalid_completed_at",
      "Active AgentRun status requires completedAt === null",
    );
  }
}

/**
 * Validates and normalizes a persisted AgentRun document.
 * Throws AgentRunError on invalid shape. Does not log the document body.
 */
export function normalizeAgentRun(data: unknown): AgentRun {
  if (!isRecord(data)) {
    throw new AgentRunError("invalid_agent_run", "AgentRun must be an object");
  }

  if (data.schemaVersion !== AGENT_RUN_SCHEMA_VERSION) {
    throw new AgentRunError(
      "invalid_schema_version",
      "AgentRun schemaVersion must be 1",
    );
  }

  if (!isNonEmptyString(data.id)) {
    throw new AgentRunError("invalid_id", "AgentRun id is required");
  }

  if (!isNonEmptyString(data.ownerUid)) {
    throw new AgentRunError("invalid_owner_uid", "AgentRun ownerUid is required");
  }

  if (!isNonEmptyString(data.projectId)) {
    throw new AgentRunError(
      "invalid_project_id",
      "AgentRun projectId is required",
    );
  }

  if (data.workflowType !== FIELD_VARIANCE_WORKFLOW_TYPE) {
    throw new AgentRunError(
      "invalid_workflow_type",
      "AgentRun workflowType must be field_variance",
    );
  }

  if (data.triggerType !== DELTA_CREATED_TRIGGER_TYPE) {
    throw new AgentRunError(
      "invalid_trigger_type",
      "AgentRun triggerType must be delta_created",
    );
  }

  if (!isNonEmptyString(data.triggerSourceId)) {
    throw new AgentRunError(
      "invalid_trigger_source_id",
      "AgentRun triggerSourceId is required",
    );
  }

  if (!isNonEmptyString(data.idempotencyKey)) {
    throw new AgentRunError(
      "invalid_idempotency_key",
      "AgentRun idempotencyKey is required",
    );
  }

  if (!isAgentRunStatus(data.status)) {
    throw new AgentRunError("invalid_status", "AgentRun status is invalid");
  }

  if (!isAgentRunStep(data.currentStep)) {
    throw new AgentRunError("invalid_step", "AgentRun currentStep is invalid");
  }

  if (!isAgentRunStepConsistentWithStatus(data.status, data.currentStep)) {
    throw new AgentRunError(
      "inconsistent_step_status",
      "AgentRun currentStep is inconsistent with status",
    );
  }

  if (
    !isFiniteNumber(data.attemptCount) ||
    !Number.isInteger(data.attemptCount) ||
    data.attemptCount < 0
  ) {
    throw new AgentRunError(
      "invalid_attempt_count",
      "AgentRun attemptCount must be an integer >= 0",
    );
  }

  if (
    !isFiniteNumber(data.maxAttempts) ||
    !Number.isInteger(data.maxAttempts) ||
    data.maxAttempts <= 0
  ) {
    throw new AgentRunError(
      "invalid_max_attempts",
      "AgentRun maxAttempts must be an integer > 0",
    );
  }

  if (data.attemptCount > data.maxAttempts) {
    throw new AgentRunError(
      "attempt_count_exceeds_max",
      "AgentRun attemptCount cannot exceed maxAttempts",
    );
  }

  const contextRefs = normalizeContextRefs(data.contextRefs);

  if (!contextRefs) {
    throw new AgentRunError(
      "invalid_context_refs",
      "AgentRun contextRefs are invalid",
    );
  }

  const pendingRequest = normalizePendingRequest(data.pendingRequest);

  if (pendingRequest === undefined) {
    throw new AgentRunError(
      "invalid_pending_request",
      "AgentRun pendingRequest is invalid",
    );
  }

  const outcome = normalizeOutcome(data.outcome);

  if (outcome === undefined) {
    throw new AgentRunError("invalid_outcome", "AgentRun outcome is invalid");
  }

  const lastEvidenceId = normalizeNullableString(data.lastEvidenceId);

  if (lastEvidenceId === undefined) {
    throw new AgentRunError(
      "invalid_last_evidence_id",
      "AgentRun lastEvidenceId is invalid",
    );
  }

  const errorCategory = normalizeNullableString(data.errorCategory);

  if (errorCategory === undefined) {
    throw new AgentRunError(
      "invalid_error_category",
      "AgentRun errorCategory is invalid",
    );
  }

  if (!isValidTimestamp(data.createdAt)) {
    throw new AgentRunError(
      "invalid_created_at",
      "AgentRun createdAt must be a valid timestamp",
    );
  }

  if (!isValidTimestamp(data.updatedAt)) {
    throw new AgentRunError(
      "invalid_updated_at",
      "AgentRun updatedAt must be a valid timestamp",
    );
  }

  const completedAt =
    data.completedAt === null
      ? null
      : isValidTimestamp(data.completedAt)
        ? data.completedAt.trim()
        : undefined;

  if (completedAt === undefined) {
    throw new AgentRunError(
      "invalid_completed_at",
      "AgentRun completedAt is invalid",
    );
  }

  assertCompletedAtSemantics(data.status, completedAt);

  return {
    id: data.id.trim(),
    schemaVersion: AGENT_RUN_SCHEMA_VERSION,
    ownerUid: data.ownerUid.trim(),
    projectId: data.projectId.trim(),
    workflowType: FIELD_VARIANCE_WORKFLOW_TYPE,
    triggerType: DELTA_CREATED_TRIGGER_TYPE,
    triggerSourceId: data.triggerSourceId.trim(),
    idempotencyKey: data.idempotencyKey.trim(),
    status: data.status,
    currentStep: data.currentStep,
    attemptCount: data.attemptCount,
    maxAttempts: data.maxAttempts,
    contextRefs,
    pendingRequest,
    outcome,
    lastEvidenceId,
    errorCategory,
    createdAt: data.createdAt.trim(),
    updatedAt: data.updatedAt.trim(),
    completedAt,
  };
}

/**
 * Builds the initial queued AgentRun for create-if-absent.
 */
export function buildQueuedAgentRun(
  input: CreateAgentRunInput,
  nowIso: string = new Date().toISOString(),
): AgentRun {
  if (!isNonEmptyString(input.ownerUid)) {
    throw new AgentRunError("invalid_owner_uid", "ownerUid is required");
  }

  if (!isNonEmptyString(input.projectId)) {
    throw new AgentRunError("invalid_project_id", "projectId is required");
  }

  if (!isNonEmptyString(input.triggerSourceId)) {
    throw new AgentRunError(
      "invalid_trigger_source_id",
      "triggerSourceId is required",
    );
  }

  const contextRefs = normalizeContextRefs(input.contextRefs);

  if (!contextRefs) {
    throw new AgentRunError("invalid_context_refs", "contextRefs are invalid");
  }

  if (contextRefs.remoteDeltaId !== input.triggerSourceId.trim()) {
    throw new AgentRunError(
      "context_delta_mismatch",
      "contextRefs.remoteDeltaId must match triggerSourceId",
    );
  }

  const maxAttempts =
    input.maxAttempts === undefined
      ? DEFAULT_AGENT_RUN_MAX_ATTEMPTS
      : input.maxAttempts;

  if (
    !isFiniteNumber(maxAttempts) ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts <= 0
  ) {
    throw new AgentRunError(
      "invalid_max_attempts",
      "maxAttempts must be an integer > 0",
    );
  }

  const triggerSourceId = input.triggerSourceId.trim();
  const id = buildFieldVarianceAgentRunId(triggerSourceId);
  const idempotencyKey = buildFieldVarianceIdempotencyKey(triggerSourceId);

  return normalizeAgentRun({
    id,
    schemaVersion: AGENT_RUN_SCHEMA_VERSION,
    ownerUid: input.ownerUid.trim(),
    projectId: input.projectId.trim(),
    workflowType: FIELD_VARIANCE_WORKFLOW_TYPE,
    triggerType: DELTA_CREATED_TRIGGER_TYPE,
    triggerSourceId,
    idempotencyKey,
    status: "queued",
    currentStep: "queued",
    attemptCount: 0,
    maxAttempts,
    contextRefs,
    pendingRequest: null,
    outcome: null,
    lastEvidenceId: null,
    errorCategory: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
  });
}

export function applyAgentRunStateUpdate(
  current: AgentRun,
  update: AgentRunStateUpdate,
  nowIso: string = new Date().toISOString(),
): AgentRun {
  const nextStatus = update.status ?? current.status;
  const nextStep = update.currentStep ?? current.currentStep;

  assertCanTransitionAgentRunStatus(current.status, nextStatus);

  if (!isAgentRunStepConsistentWithStatus(nextStatus, nextStep)) {
    throw new AgentRunError(
      "inconsistent_step_status",
      "AgentRun currentStep is inconsistent with status",
    );
  }

  let completedAt = current.completedAt;

  if (isTerminalAgentRunStatus(nextStatus)) {
    if (!isTerminalAgentRunStatus(current.status) || completedAt === null) {
      completedAt = nowIso;
    }
  } else {
    completedAt = null;
  }

  return normalizeAgentRun({
    ...current,
    status: nextStatus,
    currentStep: nextStep,
    pendingRequest:
      update.pendingRequest !== undefined
        ? update.pendingRequest
        : current.pendingRequest,
    outcome: update.outcome !== undefined ? update.outcome : current.outcome,
    lastEvidenceId:
      update.lastEvidenceId !== undefined
        ? update.lastEvidenceId
        : current.lastEvidenceId,
    errorCategory:
      update.errorCategory !== undefined
        ? update.errorCategory
        : current.errorCategory,
    updatedAt: nowIso,
    completedAt,
  });
}

export type RequestDeltaEvidenceInput = {
  message: string;
  hasDirectDeltaEvidence: boolean;
  nowIso?: string;
  /**
   * Application-resolved ProjectMember.id, or null for owner fallback.
   * Ignored on idempotent existing request (historical recipient preserved).
   */
  requestedProjectMemberId?: string | null;
};

export type RequestDeltaEvidenceResult =
  | { outcome: "created"; agentRun: AgentRun }
  | { outcome: "existing"; agentRun: AgentRun };

/**
 * Atomic Field Variance Evidence-request transition (Phase A4).
 * running → waiting_for_evidence with pendingRequest, or idempotent no-op.
 */
export function applyRequestDeltaEvidence(
  current: AgentRun,
  input: RequestDeltaEvidenceInput,
): RequestDeltaEvidenceResult {
  if (input.hasDirectDeltaEvidence) {
    throw new AgentRunError(
      "evidence_policy_blocks_request",
      "Direct Delta Evidence already exists; cannot request Evidence",
    );
  }

  const requestId = buildDeltaEvidenceRequestId(current.id);
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (
    current.status === "waiting_for_evidence" &&
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence" &&
    current.pendingRequest.requestId === requestId
  ) {
    return { outcome: "existing", agentRun: current };
  }

  if (
    current.pendingRequest !== null &&
    (current.pendingRequest.kind !== "delta_evidence" ||
      current.pendingRequest.requestId !== requestId)
  ) {
    throw new AgentRunError(
      "pending_request_conflict",
      "Unexpected pendingRequest already exists",
    );
  }

  if (current.status !== "running") {
    throw new AgentRunError(
      "illegal_status_for_evidence_request",
      `Cannot request Delta Evidence from status ${current.status}`,
    );
  }

  if (!isAgentRunStepConsistentWithStatus("running", current.currentStep)) {
    throw new AgentRunError(
      "inconsistent_step_status",
      "AgentRun currentStep is inconsistent with running status",
    );
  }

  const existingSameRequest =
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence" &&
    current.pendingRequest.requestId === requestId;

  const resolvedMemberId = existingSameRequest
    ? current.pendingRequest!.requestedProjectMemberId
    : input.requestedProjectMemberId === undefined
      ? null
      : input.requestedProjectMemberId === null
        ? null
        : input.requestedProjectMemberId.trim() || null;

  const pendingRequest: AgentRunPendingRequest = {
    kind: "delta_evidence",
    message: existingSameRequest
      ? current.pendingRequest!.message
      : normalizeDeltaEvidenceRequestMessage(input.message),
    requestedAt: existingSameRequest
      ? current.pendingRequest!.requestedAt
      : nowIso,
    requestId,
    requestedProjectMemberId: resolvedMemberId,
  };

  const next = applyAgentRunStateUpdate(
    current,
    {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest,
    },
    nowIso,
  );

  return { outcome: "created", agentRun: next };
}

export type RequestReplacementDeltaEvidenceInput = {
  message?: string;
  nowIso?: string;
  requestedProjectMemberId?: string | null;
};

/**
 * Request replacement Delta Evidence when submitted media is unusable.
 * Allowed even when direct Delta Evidence already exists (presence ≠ usable).
 * Retains lastEvidenceId so the bad Evidence cannot be replayed via resume.
 * Persists errorCategory = unsupported_media for audit.
 */
export function applyRequestReplacementDeltaEvidence(
  current: AgentRun,
  input: RequestReplacementDeltaEvidenceInput = {},
): RequestDeltaEvidenceResult {
  const requestId = buildDeltaEvidenceRequestId(current.id);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const message = normalizeDeltaEvidenceRequestMessage(
    input.message ?? REPLACEMENT_EVIDENCE_REQUEST_MESSAGE,
  );

  if (
    current.status === "waiting_for_evidence" &&
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence" &&
    current.pendingRequest.requestId === requestId
  ) {
    return { outcome: "existing", agentRun: current };
  }

  if (
    current.pendingRequest !== null &&
    (current.pendingRequest.kind !== "delta_evidence" ||
      current.pendingRequest.requestId !== requestId)
  ) {
    throw new AgentRunError(
      "pending_request_conflict",
      "Unexpected pendingRequest already exists",
    );
  }

  if (current.status !== "running") {
    throw new AgentRunError(
      "illegal_status_for_evidence_request",
      `Cannot request replacement Delta Evidence from status ${current.status}`,
    );
  }

  if (!isAgentRunStepConsistentWithStatus("running", current.currentStep)) {
    throw new AgentRunError(
      "inconsistent_step_status",
      "AgentRun currentStep is inconsistent with running status",
    );
  }

  const resolvedMemberId =
    input.requestedProjectMemberId === undefined
      ? null
      : input.requestedProjectMemberId === null
        ? null
        : input.requestedProjectMemberId.trim() || null;

  const pendingRequest: AgentRunPendingRequest = {
    kind: "delta_evidence",
    message,
    requestedAt: nowIso,
    requestId,
    requestedProjectMemberId: resolvedMemberId,
  };

  const next = applyAgentRunStateUpdate(
    current,
    {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest,
      errorCategory: UNSUPPORTED_MEDIA_ERROR_CATEGORY,
      // lastEvidenceId intentionally unchanged — blocks replay of bad Evidence.
    },
    nowIso,
  );

  return { outcome: "created", agentRun: next };
}

export type RequestAdditionalDeltaEvidenceInput = {
  message?: string;
  nowIso?: string;
  requestedProjectMemberId?: string | null;
};

/**
 * Post-analysis request_evidence when qualifying Delta Evidence already exists.
 * Presence policy does not override the model's additional-evidence decision.
 * Retains lastEvidenceId so the just-analyzed Evidence cannot be replayed.
 * Does not set unsupported_media (distinct from replacement media recovery).
 */
export function applyRequestAdditionalDeltaEvidence(
  current: AgentRun,
  input: RequestAdditionalDeltaEvidenceInput = {},
): RequestDeltaEvidenceResult {
  const requestId = buildDeltaEvidenceRequestId(current.id);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const message = normalizeDeltaEvidenceRequestMessage(
    input.message ?? ADDITIONAL_DELTA_EVIDENCE_REQUEST_MESSAGE,
  );

  if (
    current.status === "waiting_for_evidence" &&
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence" &&
    current.pendingRequest.requestId === requestId
  ) {
    return { outcome: "existing", agentRun: current };
  }

  if (
    current.pendingRequest !== null &&
    (current.pendingRequest.kind !== "delta_evidence" ||
      current.pendingRequest.requestId !== requestId)
  ) {
    throw new AgentRunError(
      "pending_request_conflict",
      "Unexpected pendingRequest already exists",
    );
  }

  if (current.status !== "running") {
    throw new AgentRunError(
      "illegal_status_for_evidence_request",
      `Cannot request additional Delta Evidence from status ${current.status}`,
    );
  }

  if (!isAgentRunStepConsistentWithStatus("running", current.currentStep)) {
    throw new AgentRunError(
      "inconsistent_step_status",
      "AgentRun currentStep is inconsistent with running status",
    );
  }

  const resolvedMemberId =
    input.requestedProjectMemberId === undefined
      ? null
      : input.requestedProjectMemberId === null
        ? null
        : input.requestedProjectMemberId.trim() || null;

  const pendingRequest: AgentRunPendingRequest = {
    kind: "delta_evidence",
    message,
    requestedAt: nowIso,
    requestId,
    requestedProjectMemberId: resolvedMemberId,
  };

  const next = applyAgentRunStateUpdate(
    current,
    {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest,
      errorCategory: null,
      // lastEvidenceId intentionally unchanged — requires NEW Evidence to resume.
    },
    nowIso,
  );

  return { outcome: "created", agentRun: next };
}

export type RecoverStickyRequestEvidenceInput = {
  message?: string;
  nowIso?: string;
  requestedProjectMemberId?: string | null;
};

export type RecoverStickyRequestEvidenceResult =
  | { outcome: "recovered"; agentRun: AgentRun }
  | { outcome: "existing"; agentRun: AgentRun };

/**
 * Owner recovery for sticky running/assess_variance after request_evidence
 * fall-through. Same AgentRun; no task; no re-analysis; lastEvidenceId kept.
 */
export function applyRecoverStickyRequestEvidence(
  current: AgentRun,
  input: RecoverStickyRequestEvidenceInput = {},
): RecoverStickyRequestEvidenceResult {
  const requestId = buildDeltaEvidenceRequestId(current.id);

  if (
    current.status === "waiting_for_evidence" &&
    current.currentStep === "waiting_for_evidence" &&
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence" &&
    current.pendingRequest.requestId === requestId
  ) {
    return { outcome: "existing", agentRun: current };
  }

  if (!isEligibleForStickyRequestEvidenceRecovery(current)) {
    throw new AgentRunError(
      "sticky_request_evidence_recovery_not_eligible",
      "AgentRun is not eligible for sticky request_evidence recovery",
    );
  }

  const applied = applyRequestAdditionalDeltaEvidence(current, input);
  if (applied.outcome === "existing") {
    return { outcome: "existing", agentRun: applied.agentRun };
  }

  return { outcome: "recovered", agentRun: applied.agentRun };
}

export type RecoverFailedFieldVarianceEvidenceInput = {
  message?: string;
  nowIso?: string;
  requestedProjectMemberId?: string | null;
};

export type RecoverFailedFieldVarianceEvidenceResult =
  | { outcome: "recovered"; agentRun: AgentRun }
  | { outcome: "existing"; agentRun: AgentRun };

/**
 * Narrow explicit recovery for legacy failed runs whose errorCategory indicates
 * recoverable unusable evidence. Does not enqueue tasks or reprocess Evidence.
 */
export function applyRecoverFailedFieldVarianceEvidence(
  current: AgentRun,
  input: RecoverFailedFieldVarianceEvidenceInput = {},
): RecoverFailedFieldVarianceEvidenceResult {
  const requestId = buildDeltaEvidenceRequestId(current.id);
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (
    current.status === "waiting_for_evidence" &&
    current.currentStep === "waiting_for_evidence" &&
    current.pendingRequest !== null &&
    current.pendingRequest.kind === "delta_evidence"
  ) {
    return { outcome: "existing", agentRun: current };
  }

  if (!isEligibleForFailedEvidenceRecovery(current)) {
    throw new AgentRunError(
      "evidence_recovery_not_eligible",
      "AgentRun is not eligible for recoverable evidence recovery",
    );
  }

  const message = normalizeDeltaEvidenceRequestMessage(
    input.message ?? REPLACEMENT_EVIDENCE_REQUEST_MESSAGE,
  );

  const resolvedMemberId =
    input.requestedProjectMemberId === undefined
      ? null
      : input.requestedProjectMemberId === null
        ? null
        : input.requestedProjectMemberId.trim() || null;

  const pendingRequest: AgentRunPendingRequest = {
    kind: "delta_evidence",
    message,
    requestedAt: nowIso,
    requestId,
    requestedProjectMemberId: resolvedMemberId,
  };

  const next = applyAgentRunStateUpdate(
    current,
    {
      status: "waiting_for_evidence",
      currentStep: "waiting_for_evidence",
      pendingRequest,
      errorCategory: UNSUPPORTED_MEDIA_ERROR_CATEGORY,
      outcome: null,
      // lastEvidenceId retained — new Evidence required for resume.
    },
    nowIso,
  );

  return { outcome: "recovered", agentRun: next };
}

export type ResumeFromDeltaEvidenceInput = {
  evidenceId: string;
  nowIso?: string;
};

export type ResumeFromDeltaEvidenceResult =
  | { outcome: "resumed"; agentRun: AgentRun }
  | { outcome: "already_resumed"; agentRun: AgentRun };

/**
 * Atomic Field Variance Evidence-arrival resume (Phase A5).
 * waiting_for_evidence → running, clears pendingRequest, sets lastEvidenceId,
 * increments attemptCount once. Idempotent when lastEvidenceId already matches.
 */
export function applyResumeFromDeltaEvidence(
  current: AgentRun,
  input: ResumeFromDeltaEvidenceInput,
): ResumeFromDeltaEvidenceResult {
  const evidenceId = input.evidenceId.trim();
  if (!evidenceId) {
    throw new AgentRunError(
      "invalid_evidence_id",
      "evidenceId is required for resume",
    );
  }

  const nowIso = input.nowIso ?? new Date().toISOString();

  if (current.lastEvidenceId === evidenceId) {
    return { outcome: "already_resumed", agentRun: current };
  }

  if (
    current.status !== "waiting_for_evidence" ||
    current.currentStep !== "waiting_for_evidence"
  ) {
    throw new AgentRunError(
      "illegal_status_for_resume",
      `Cannot resume AgentRun from status ${current.status}`,
    );
  }

  if (
    current.pendingRequest === null ||
    current.pendingRequest.kind !== "delta_evidence"
  ) {
    throw new AgentRunError(
      "pending_request_mismatch",
      "AgentRun is not waiting for delta_evidence",
    );
  }

  const withAttempt = applyAgentRunAttemptIncrement(current, nowIso);

  const next = applyAgentRunStateUpdate(
    withAttempt,
    {
      status: "running",
      currentStep: "check_evidence_policy",
      pendingRequest: null,
      lastEvidenceId: evidenceId,
      errorCategory: null,
    },
    nowIso,
  );

  return { outcome: "resumed", agentRun: next };
}

export function applyAgentRunAttemptIncrement(
  current: AgentRun,
  nowIso: string = new Date().toISOString(),
): AgentRun {
  const nextCount = current.attemptCount + 1;

  if (nextCount > current.maxAttempts) {
    throw new AgentRunError(
      "attempt_count_exceeds_max",
      "AgentRun attemptCount cannot exceed maxAttempts",
    );
  }

  return normalizeAgentRun({
    ...current,
    attemptCount: nextCount,
    updatedAt: nowIso,
  });
}

export type ClaimQueuedAgentRunStartResult =
  | { outcome: "claimed"; agentRun: AgentRun }
  | { outcome: "not_queued"; agentRun: AgentRun }
  | { outcome: "attempt_exhausted"; agentRun: AgentRun };

/**
 * Atomic queued → running claim for /start.
 * Increments attemptCount exactly once and rejects concurrent claimants.
 */
export function applyClaimQueuedAgentRunStart(
  current: AgentRun,
  nowIso: string = new Date().toISOString(),
): ClaimQueuedAgentRunStartResult {
  if (current.status !== "queued") {
    return { outcome: "not_queued", agentRun: current };
  }

  if (current.attemptCount >= current.maxAttempts) {
    const running = applyAgentRunStateUpdate(
      current,
      {
        status: "running",
        currentStep: "load_context",
        errorCategory: "attempt_count_exceeds_max",
      },
      nowIso,
    );
    const failed = applyAgentRunStateUpdate(
      running,
      {
        status: "failed",
        currentStep: "failed",
        errorCategory: "attempt_count_exceeds_max",
      },
      nowIso,
    );
    return { outcome: "attempt_exhausted", agentRun: failed };
  }

  const withAttempt = applyAgentRunAttemptIncrement(current, nowIso);
  const claimed = applyAgentRunStateUpdate(
    withAttempt,
    {
      status: "running",
      currentStep: "load_context",
      errorCategory: null,
    },
    nowIso,
  );
  return { outcome: "claimed", agentRun: claimed };
}
