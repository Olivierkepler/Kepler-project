export type AgentLogEvent =
  | "agent_triggered"
  | "agent_run_created"
  | "agent_run_existing"
  | "agent_run_create_failed"
  | "agent_task_enqueued"
  | "agent_task_already_exists"
  | "agent_task_enqueue_failed"
  | "agent_resume_candidate_found"
  | "agent_resume_task_enqueued"
  | "agent_resume_task_existing"
  | "agent_resume_enqueue_failed";

export type AgentLogFields = {
  event: AgentLogEvent;
  agentRunId?: string;
  evidenceId?: string;
  remoteDeltaId?: string;
  projectId?: string;
  workflowType?: string;
  step?: string;
  attemptCount?: number;
  errorCategory?: string;
};

/**
 * Safe structured agent workflow logs. No tokens, bodies, or PII.
 */
export function logAgentEvent(fields: AgentLogFields): void {
  console.log(
    JSON.stringify({
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function categorizeEnqueueError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "unknown";
  }

  const record = error as { code?: number | string; message?: string };

  if (typeof record.code === "string" && record.code.trim()) {
    return record.code.trim().slice(0, 80);
  }

  if (typeof record.code === "number") {
    return `code_${record.code}`;
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim().slice(0, 80);
  }

  return "unknown";
}
