import type { FieldVarianceAssessment } from "../domain/assessment.js";
import type { AgentRun } from "../domain/agentRun.js";
import {
  categorizeExecutionError,
  logAgentExecution,
} from "../logging/agentExecutionLogging.js";
import { updateAgentRunState } from "../repositories/agentRunsRepository.js";

export type EscalateAgentRunDeps = {
  updateAgentRunStateFn?: typeof updateAgentRunState;
};

/**
 * Persists the existing Field Variance escalation terminal state.
 * Application-controlled transition — Gemini only supplies recommendedAction
 * + userVisibleRationale; it cannot choose arbitrary statuses.
 *
 * No AgentSummary is created for escalated runs (outcome.summaryId === null).
 */
export async function escalateFieldVarianceAgentRun(args: {
  agentRun: AgentRun;
  assessment: FieldVarianceAssessment;
  deps?: EscalateAgentRunDeps;
}): Promise<AgentRun> {
  const updateState =
    args.deps?.updateAgentRunStateFn ?? updateAgentRunState;

  logAgentExecution({
    event: "agent_escalation_started",
    agentRunId: args.agentRun.id,
    projectId: args.agentRun.projectId,
    workflowType: args.agentRun.workflowType,
    step: args.agentRun.currentStep,
    attemptCount: args.agentRun.attemptCount,
    recommendedAction: "escalate",
  });

  try {
    const escalated = await updateState(args.agentRun.id, {
      status: "escalated",
      currentStep: "escalated",
      pendingRequest: null,
      outcome: {
        kind: "escalated",
        summaryId: null,
        userVisibleRationale: args.assessment.userVisibleRationale,
      },
      errorCategory: null,
    });

    logAgentExecution({
      event: "agent_escalated",
      agentRunId: escalated.id,
      projectId: escalated.projectId,
      workflowType: escalated.workflowType,
      step: escalated.currentStep,
      attemptCount: escalated.attemptCount,
      recommendedAction: "escalate",
    });

    return escalated;
  } catch (error) {
    logAgentExecution({
      event: "agent_escalation_failed",
      agentRunId: args.agentRun.id,
      projectId: args.agentRun.projectId,
      workflowType: args.agentRun.workflowType,
      step: args.agentRun.currentStep,
      attemptCount: args.agentRun.attemptCount,
      errorCategory: categorizeExecutionError(error),
      recommendedAction: "escalate",
    });
    throw error;
  }
}
