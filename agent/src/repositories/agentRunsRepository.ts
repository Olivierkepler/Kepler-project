import { COLLECTIONS } from "../config/collections.js";
import { db } from "../config/firestore.js";
import {
  AgentRunError,
  type AgentRun,
  type AgentRunStateUpdate,
  type CreateAgentRunInput,
} from "../domain/agentRun.js";
import {
  applyAgentRunAttemptIncrement,
  applyAgentRunStateUpdate,
  applyRecoverFailedFieldVarianceEvidence,
  applyRecoverStickyRequestEvidence,
  applyRequestAdditionalDeltaEvidence,
  applyRequestDeltaEvidence,
  applyRequestReplacementDeltaEvidence,
  applyResumeFromDeltaEvidence,
  applyClaimQueuedAgentRunStart,
  buildQueuedAgentRun,
  normalizeAgentRun,
  type RecoverFailedFieldVarianceEvidenceInput,
  type RecoverFailedFieldVarianceEvidenceResult,
  type RecoverStickyRequestEvidenceInput,
  type RecoverStickyRequestEvidenceResult,
  type RequestAdditionalDeltaEvidenceInput,
  type RequestDeltaEvidenceInput,
  type RequestDeltaEvidenceResult,
  type RequestReplacementDeltaEvidenceInput,
  type ResumeFromDeltaEvidenceInput,
  type ResumeFromDeltaEvidenceResult,
  type ClaimQueuedAgentRunStartResult,
} from "../validation/agentRun.js";

function requireId(id: string, label: string): void {
  if (!id || id.trim().length === 0) {
    throw new AgentRunError("invalid_id", `${label} is required`);
  }
}

function agentRunsCollection() {
  return db.collection(COLLECTIONS.agentRuns);
}

export type CreateAgentRunIfAbsentResult = {
  created: boolean;
  agentRun: AgentRun;
};

/**
 * Idempotent create: document id = field-variance:{remoteDeltaId}.
 * Concurrent creates resolve to one document via transaction.
 */
export async function createAgentRunIfAbsent(
  input: CreateAgentRunInput,
): Promise<CreateAgentRunIfAbsentResult> {
  const candidate = buildQueuedAgentRun(input);
  const ref = agentRunsCollection().doc(candidate.id);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (snapshot.exists) {
      const existing = normalizeAgentRun(snapshot.data());
      return { created: false, agentRun: existing };
    }

    tx.create(ref, candidate);
    return { created: true, agentRun: candidate };
  });
}

export async function getAgentRunById(
  agentRunId: string,
): Promise<AgentRun | undefined> {
  requireId(agentRunId, "agentRunId");

  const snapshot = await agentRunsCollection().doc(agentRunId).get();

  if (!snapshot.exists) {
    return undefined;
  }

  return normalizeAgentRun(snapshot.data());
}

/**
 * Narrow state update inside a transaction.
 * Rejects illegal transitions. Never mutates ownerUid/projectId/trigger/contextRefs.
 */
export async function updateAgentRunState(
  agentRunId: string,
  update: AgentRunStateUpdate,
): Promise<AgentRun> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const next = applyAgentRunStateUpdate(current, update);
    tx.set(ref, next, { merge: false });
    return next;
  });
}

/**
 * Increments attemptCount by 1. Rejects when it would exceed maxAttempts.
 */
export async function incrementAgentRunAttempt(
  agentRunId: string,
): Promise<AgentRun> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const next = applyAgentRunAttemptIncrement(current);
    tx.set(ref, next, { merge: false });
    return next;
  });
}

/**
 * Atomic /start claim: queued → running with a single attempt increment.
 * Concurrent claimants see not_queued after the first wins.
 */
export async function claimQueuedAgentRunStart(
  agentRunId: string,
): Promise<ClaimQueuedAgentRunStartResult> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const claimed = applyClaimQueuedAgentRunStart(current);

    if (claimed.outcome === "not_queued") {
      return claimed;
    }

    tx.set(ref, claimed.agentRun, { merge: false });
    return claimed;
  });
}

/**
 * Atomic Evidence-request write (Phase A4):
 * pendingRequest + running → waiting_for_evidence in one transaction.
 */
export async function requestDeltaEvidence(
  agentRunId: string,
  input: RequestDeltaEvidenceInput,
): Promise<RequestDeltaEvidenceResult> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const applied = applyRequestDeltaEvidence(current, input);

    if (applied.outcome === "existing") {
      return applied;
    }

    tx.set(ref, applied.agentRun, { merge: false });
    return applied;
  });

  if (
    result.outcome === "created" &&
    result.agentRun.status === "waiting_for_evidence"
  ) {
    try {
      const { projectAgentEvidenceRequestedActivity } = await import(
        "../services/projectEvidenceRequestedActivity.js"
      );
      await projectAgentEvidenceRequestedActivity({
        agentRun: result.agentRun,
      });
    } catch {
      // Activity projection is best-effort.
    }
  }

  return result;
}

/**
 * Atomic replacement Evidence request when submitted media is unusable.
 * running → waiting_for_evidence even if direct Delta Evidence already exists.
 */
export async function requestReplacementDeltaEvidence(
  agentRunId: string,
  input: RequestReplacementDeltaEvidenceInput = {},
): Promise<RequestDeltaEvidenceResult> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const applied = applyRequestReplacementDeltaEvidence(current, input);

    if (applied.outcome === "existing") {
      return applied;
    }

    tx.set(ref, applied.agentRun, { merge: false });
    return applied;
  });

  if (
    result.outcome === "created" &&
    result.agentRun.status === "waiting_for_evidence"
  ) {
    try {
      const { projectAgentEvidenceRequestedActivity } = await import(
        "../services/projectEvidenceRequestedActivity.js"
      );
      await projectAgentEvidenceRequestedActivity({
        agentRun: result.agentRun,
      });
    } catch {
      // Activity projection is best-effort.
    }
  }

  return result;
}

/**
 * Atomic additional Evidence request after post-analysis request_evidence
 * when Delta Evidence already exists. Retains lastEvidenceId; no media category.
 */
export async function requestAdditionalDeltaEvidence(
  agentRunId: string,
  input: RequestAdditionalDeltaEvidenceInput = {},
): Promise<RequestDeltaEvidenceResult> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const applied = applyRequestAdditionalDeltaEvidence(current, input);

    if (applied.outcome === "existing") {
      return applied;
    }

    tx.set(ref, applied.agentRun, { merge: false });
    return applied;
  });

  if (
    result.outcome === "created" &&
    result.agentRun.status === "waiting_for_evidence"
  ) {
    try {
      const { projectAgentEvidenceRequestedActivity } = await import(
        "../services/projectEvidenceRequestedActivity.js"
      );
      await projectAgentEvidenceRequestedActivity({
        agentRun: result.agentRun,
      });
    } catch {
      // Activity projection is best-effort.
    }
  }

  return result;
}

/**
 * Atomic Evidence-arrival resume (Phase A5):
 * waiting_for_evidence → running with pendingRequest cleared in one transaction.
 */
export async function resumeFromDeltaEvidence(
  agentRunId: string,
  input: ResumeFromDeltaEvidenceInput,
): Promise<ResumeFromDeltaEvidenceResult> {
  requireId(agentRunId, "agentRunId");

  const ref = agentRunsCollection().doc(agentRunId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    if (!snapshot.exists) {
      throw new AgentRunError("not_found", "AgentRun not found");
    }

    const current = normalizeAgentRun(snapshot.data());
    const result = applyResumeFromDeltaEvidence(current, input);

    if (result.outcome === "already_resumed") {
      return result;
    }

    tx.set(ref, result.agentRun, { merge: false });
    return result;
  });
}
