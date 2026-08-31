/**
 * Cloud Tasks–safe deterministic task id for Field Variance start.
 * AgentRun ids may contain ":" which is illegal in Cloud Tasks task names.
 */
export function buildFieldVarianceStartTaskId(agentRunId: string): string {
  const trimmed = agentRunId.trim();

  if (!trimmed) {
    throw new Error("agentRunId is required");
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9_-]/g, "_");

  if (!sanitized) {
    throw new Error("agentRunId produced an empty Cloud Tasks task id");
  }

  const taskId = `fv-start_${sanitized}`;

  if (taskId.length > 500) {
    throw new Error("Cloud Tasks task id exceeds 500 characters");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error("Cloud Tasks task id contains illegal characters");
  }

  return taskId;
}

export function isCloudTasksSafeTaskId(taskId: string): boolean {
  return (
    taskId.length > 0 &&
    taskId.length <= 500 &&
    /^[A-Za-z0-9_-]+$/.test(taskId)
  );
}

function sanitizeCloudTasksSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
  if (!sanitized) {
    throw new Error(`${label} produced an empty Cloud Tasks segment`);
  }

  return sanitized;
}

/**
 * Deterministic Cloud Tasks id for one AgentRun resume caused by one Evidence.
 * Separate from start-task identity.
 */
export function buildFieldVarianceResumeTaskId(
  agentRunId: string,
  evidenceId: string,
): string {
  const runPart = sanitizeCloudTasksSegment(agentRunId, "agentRunId");
  const evidencePart = sanitizeCloudTasksSegment(evidenceId, "evidenceId");
  const taskId = `fv-resume_${runPart}_${evidencePart}`;

  if (taskId.length > 500) {
    throw new Error("Cloud Tasks resume task id exceeds 500 characters");
  }

  if (!isCloudTasksSafeTaskId(taskId)) {
    throw new Error("Cloud Tasks resume task id contains illegal characters");
  }

  return taskId;
}
