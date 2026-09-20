import {
  FIELD_VARIANCE_WORKFLOW_TYPE,
  type AgentRun,
} from "./agentRun.js";

/**
 * Narrow eligibility for owner recovery of a sticky Field Variance run that
 * assessed request_evidence but fell through to running / assess_variance
 * (Phase 2F-E.5 bug). recommendedAction is not persisted on AgentRun, so
 * eligibility uses the structural sticky state that matches that fixture:
 * running + assess_variance + no pending + lastEvidenceId set.
 *
 * Does not broaden failed-media recover-evidence.
 */
export function isEligibleForStickyRequestEvidenceRecovery(
  agentRun: AgentRun,
): boolean {
  if (agentRun.workflowType !== FIELD_VARIANCE_WORKFLOW_TYPE) {
    return false;
  }

  if (agentRun.status !== "running" || agentRun.currentStep !== "assess_variance") {
    return false;
  }

  if (agentRun.pendingRequest !== null) {
    return false;
  }

  if (agentRun.outcome !== null) {
    return false;
  }

  if (!agentRun.lastEvidenceId?.trim()) {
    return false;
  }

  if (
    !agentRun.contextRefs.remoteDeltaId.trim() ||
    !agentRun.contextRefs.localDeltaId.trim()
  ) {
    return false;
  }

  return true;
}
