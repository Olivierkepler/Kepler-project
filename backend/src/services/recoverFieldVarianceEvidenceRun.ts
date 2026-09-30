import { AgentRunError, type AgentRun } from "../domain/agentRun.js";
import { getDeltaById } from "../repositories/deltasRepository.js";
import {
  getAgentRunById,
  recoverFailedFieldVarianceEvidence,
} from "../repositories/agentRunsRepository.js";
import {
  applyRecoverFailedFieldVarianceEvidence,
  type RecoverFailedFieldVarianceEvidenceResult,
} from "../validation/agentRun.js";
import { isEligibleForFailedEvidenceRecovery } from "../domain/recoverableEvidenceFailure.js";

export type RecoverFieldVarianceEvidenceRunResult =
  | {
      outcome: "recovered" | "existing";
      agentRun: AgentRun;
    }
  | {
      outcome: "not_found";
    }
  | {
      outcome: "not_eligible";
      reason: string;
    };

/**
 * Owner-scoped recovery of a failed Field Variance AgentRun after unusable evidence.
 * Does not enqueue Cloud Tasks, create Evidence, or reprocess lastEvidenceId.
 */
export async function recoverFieldVarianceEvidenceRun(input: {
  projectId: string;
  agentRunId: string;
  ownerUid: string;
}): Promise<RecoverFieldVarianceEvidenceRunResult> {
  const agentRun = await getAgentRunById(input.agentRunId);

  if (
    !agentRun ||
    agentRun.projectId !== input.projectId ||
    agentRun.ownerUid !== input.ownerUid
  ) {
    return { outcome: "not_found" };
  }

  if (
    agentRun.status === "waiting_for_evidence" &&
    agentRun.currentStep === "waiting_for_evidence" &&
    agentRun.pendingRequest?.kind === "delta_evidence"
  ) {
    return { outcome: "existing", agentRun };
  }

  if (!isEligibleForFailedEvidenceRecovery(agentRun)) {
    return {
      outcome: "not_eligible",
      reason: "AgentRun is not eligible for evidence recovery",
    };
  }

  const delta = await getDeltaById(agentRun.contextRefs.remoteDeltaId);
  if (
    !delta ||
    delta.projectId !== input.projectId ||
    delta.id !== agentRun.contextRefs.remoteDeltaId
  ) {
    return {
      outcome: "not_eligible",
      reason: "Linked Delta is missing or inconsistent",
    };
  }

  try {
    const result: RecoverFailedFieldVarianceEvidenceResult =
      await recoverFailedFieldVarianceEvidence(agentRun.id, {});

    return {
      outcome: result.outcome,
      agentRun: result.agentRun,
    };
  } catch (error) {
    if (
      error instanceof AgentRunError &&
      error.code === "evidence_recovery_not_eligible"
    ) {
      return {
        outcome: "not_eligible",
        reason: error.message,
      };
    }
    throw error;
  }
}

/** Pure eligibility helper for DTO / tests (no I/O). */
export function agentRunCanRecoverEvidence(agentRun: AgentRun): boolean {
  if (
    agentRun.status === "waiting_for_evidence" &&
    agentRun.pendingRequest?.kind === "delta_evidence"
  ) {
    return false;
  }

  return isEligibleForFailedEvidenceRecovery(agentRun);
}

/** Exposed for unit tests without Firestore. */
export function applyRecoverFieldVarianceEvidenceForTest(
  agentRun: AgentRun,
): RecoverFailedFieldVarianceEvidenceResult {
  return applyRecoverFailedFieldVarianceEvidence(agentRun, {});
}
