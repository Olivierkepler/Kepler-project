import { AgentRunError, type AgentRun } from "../domain/agentRun.js";
import { getDeltaById } from "../repositories/deltasRepository.js";
import {
  getAgentRunById,
  recoverStickyRequestEvidence,
} from "../repositories/agentRunsRepository.js";
import {
  applyRecoverStickyRequestEvidence,
  type RecoverStickyRequestEvidenceResult,
} from "../validation/agentRun.js";
import { isEligibleForStickyRequestEvidenceRecovery } from "../domain/stickyRequestEvidenceRecovery.js";

export type RecoverStickyRequestEvidenceRunResult =
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
 * Owner-scoped recovery of a sticky Field Variance AgentRun left at
 * running / assess_variance after request_evidence (E.5 bug).
 * Does not enqueue Cloud Tasks, create Evidence, or reprocess lastEvidenceId.
 */
export async function recoverStickyRequestEvidenceRun(input: {
  projectId: string;
  agentRunId: string;
  ownerUid: string;
}): Promise<RecoverStickyRequestEvidenceRunResult> {
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

  if (!isEligibleForStickyRequestEvidenceRecovery(agentRun)) {
    return {
      outcome: "not_eligible",
      reason: "AgentRun is not eligible for sticky request_evidence recovery",
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
    const result: RecoverStickyRequestEvidenceResult =
      await recoverStickyRequestEvidence(agentRun.id, {});

    return {
      outcome: result.outcome,
      agentRun: result.agentRun,
    };
  } catch (error) {
    if (
      error instanceof AgentRunError &&
      error.code === "sticky_request_evidence_recovery_not_eligible"
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
export function agentRunCanRecoverStickyRequestEvidence(
  agentRun: AgentRun,
): boolean {
  if (
    agentRun.status === "waiting_for_evidence" &&
    agentRun.pendingRequest?.kind === "delta_evidence"
  ) {
    return false;
  }

  return isEligibleForStickyRequestEvidenceRecovery(agentRun);
}
