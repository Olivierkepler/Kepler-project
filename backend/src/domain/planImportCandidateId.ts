/**
 * Deterministic candidate id for a processing run.
 * Format: `${importId}_c_${index}`
 * Replacing candidates for an import always uses the same index scheme so
 * retries do not create unbounded id growth.
 */
export function createPlanImportCandidateId(
  importId: string,
  index: number,
): string {
  const trimmed = importId.trim();
  if (!trimmed) {
    throw new Error("importId is required");
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("index must be a non-negative integer");
  }
  return `${trimmed}_c_${index}`;
}

/**
 * Cloud Tasks–safe deterministic task id for plan-import processing.
 */
export function buildPlanImportProcessTaskId(importId: string): string {
  const trimmed = importId.trim();
  if (!trimmed) {
    throw new Error("importId is required");
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
  if (!sanitized) {
    throw new Error("importId produced an empty Cloud Tasks task id");
  }

  const taskId = `pi-process_${sanitized}`;
  if (taskId.length > 500) {
    throw new Error("Cloud Tasks task id exceeds 500 characters");
  }

  return taskId;
}
