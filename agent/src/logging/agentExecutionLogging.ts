export type AgentExecutionLogEvent =
  | "agent_execution_received"
  | "agent_execution_started"
  | "agent_tool_started"
  | "agent_tool_completed"
  | "agent_model_started"
  | "agent_model_completed"
  | "agent_assessment_ready"
  // alias retained for call sites that log after structured assessment is ready
  | "agent_execution_failed"
  | "agent_execution_transient_requeue"
  | "agent_execution_noop"
  | "agent_evidence_request_started"
  | "agent_evidence_request_created"
  | "agent_evidence_request_existing"
  | "agent_evidence_request_policy_mismatch"
  | "agent_evidence_request_failed"
  | "agent_waiting_for_evidence"
  | "agent_resume_received"
  | "agent_resume_started"
  | "agent_resume_noop"
  | "agent_resume_evidence_verified"
  | "agent_resume_completed_assessment"
  | "agent_resume_failed"
  | "agent_evidence_analysis_started"
  | "agent_evidence_photo_loaded"
  | "agent_evidence_analysis_model_started"
  | "agent_evidence_analysis_model_completed"
  | "agent_evidence_analysis_ready"
  | "agent_evidence_analysis_skipped"
  | "agent_evidence_analysis_failed"
  | "agent_summary_started"
  | "agent_summary_model_started"
  | "agent_summary_model_completed"
  | "agent_summary_created"
  | "agent_summary_existing"
  | "agent_summary_completion_started"
  | "agent_summary_completed"
  | "agent_summary_failed"
  | "agent_escalation_started"
  | "agent_escalated"
  | "agent_escalation_failed";

export type AgentExecutionLogFields = {
  event: AgentExecutionLogEvent;
  agentRunId?: string;
  evidenceId?: string;
  summaryId?: string;
  projectId?: string;
  workflowType?: string;
  step?: string;
  toolName?: string;
  durationMs?: number;
  attemptCount?: number;
  errorCategory?: string;
  recommendedAction?: string;
  noopReason?: string;
  requestId?: string;
  mimeType?: string;
  byteSize?: number;
  multimodalCall?: boolean;
};

/**
 * Safe structured agent execution logs.
 * Never logs Evidence note bodies, raw prompts, raw model responses, or CoT.
 */
export function logAgentExecution(fields: AgentExecutionLogFields): void {
  console.log(
    JSON.stringify({
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
}

const GENERIC_ERROR_IDENTIFIERS = new Set([
  "error",
  "typeerror",
  "rangeerror",
  "referenceerror",
  "syntaxerror",
  "evalerror",
  "urierror",
  "aggregateerror",
]);

function isGenericErrorIdentifier(value: string): boolean {
  return GENERIC_ERROR_IDENTIFIERS.has(value.trim().toLowerCase());
}

function readErrorString(
  error: unknown,
  key: "code" | "name" | "message",
): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return value.trim();
}

/**
 * Bounded diagnostic category safe for structured logs.
 * Strips control characters and obvious secret/token patterns.
 */
function sanitizeExecutionErrorCategory(raw: string): string {
  let value = raw.trim();
  value = value.replace(/[\r\n\t]+/g, " ");
  value = value.replace(/[\x00-\x1F\x7F]/g, " ");
  value = value.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  value = value.replace(/\bAuthorization:\s*\S+/gi, "Authorization: [REDACTED]");
  value = value.replace(/\b(AIza[0-9A-Za-z_-]{20,})\b/g, "[REDACTED]");
  value = value.replace(/\b(sk-[A-Za-z0-9_-]{10,})\b/g, "[REDACTED]");
  value = value.replace(/https?:\/\/\S+/gi, "[URL_REDACTED]");
  value = value.replace(/\s+/g, " ").trim();

  return value.slice(0, 80);
}

/**
 * Narrow signatures for transient AI-provider capacity failures.
 * Fail closed: unknown / generic errors are not retryable.
 */
const TRANSIENT_PROVIDER_PATTERNS: readonly RegExp[] = [
  /\bresource[_\s]?exhausted\b/i,
  /\btoo many requests\b/i,
  /\bquota exceeded\b/i,
  /\bexceeded (?:your )?quota\b/i,
  /\brate[_\s]?limit(?:ing|ed)?\b/i,
  /\bratelimit\b/i,
  /\bservice unavailable\b/i,
  /\btemporarily unavailable\b/i,
  /\btry again later\b/i,
];

const NON_RETRYABLE_CATEGORY_PATTERNS: readonly RegExp[] = [
  /^zoderror\b/i,
  /\bpermission[_\s]?denied\b/i,
  /\bunauthenticated\b/i,
  /\bunauthorized\b/i,
  /^attempt_count_exceeds_max$/i,
  /^unsupported_media$/i,
  /^agent_run_not_found$/i,
  /^invalid[_\s]?argument\b/i,
  /^failed_precondition\b/i,
  /^not_found$/i,
  /^policy_mismatch$/i,
];

function readNumericStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "httpStatusCode", "httpStatus"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && /^\d{3}$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return undefined;
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * True only for clear provider-capacity / throttling failures.
 * Accepts a thrown error or a sanitized errorCategory string.
 * Does not treat unsupported_media or unknown errors as retryable.
 */
export function isTransientProviderFailure(
  errorOrCategory: unknown,
): boolean {
  if (typeof errorOrCategory === "string") {
    const trimmed = errorOrCategory.trim();
    if (!trimmed || trimmed.toLowerCase() === "unknown") {
      return false;
    }
    if (matchesAny(trimmed, NON_RETRYABLE_CATEGORY_PATTERNS)) {
      return false;
    }
    if (/^\s*429\s*$/.test(trimmed) || /^\s*503\s*$/.test(trimmed)) {
      return true;
    }
    return matchesAny(trimmed, TRANSIENT_PROVIDER_PATTERNS);
  }

  if (errorOrCategory && typeof errorOrCategory === "object") {
    const name = readErrorString(errorOrCategory, "name");
    if (name === "ZodError") {
      return false;
    }

    const status = readNumericStatus(errorOrCategory);
    if (status === 429 || status === 503) {
      return true;
    }

    const code = readErrorString(errorOrCategory, "code");
    if (code) {
      const normalizedCode = code.trim();
      // gRPC 8 = RESOURCE_EXHAUSTED. Bare UNAVAILABLE is not enough alone.
      if (
        normalizedCode === "8" ||
        normalizedCode === "RESOURCE_EXHAUSTED" ||
        normalizedCode === "429" ||
        normalizedCode === "503"
      ) {
        return true;
      }
      if (matchesAny(normalizedCode, NON_RETRYABLE_CATEGORY_PATTERNS)) {
        return false;
      }
      if (matchesAny(normalizedCode, TRANSIENT_PROVIDER_PATTERNS)) {
        return true;
      }
    }
  }

  const category = categorizeExecutionError(errorOrCategory);
  if (!category || category === "unknown") {
    return false;
  }
  if (matchesAny(category, NON_RETRYABLE_CATEGORY_PATTERNS)) {
    return false;
  }
  return matchesAny(category, TRANSIENT_PROVIDER_PATTERNS);
}

export function categorizeExecutionError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    (error as { name?: string }).name === "ZodError"
  ) {
    const message = readErrorString(error, "message");
    if (message && message.startsWith("ZodError ")) {
      return sanitizeExecutionErrorCategory(message);
    }

    const issues = (error as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const parts = issues.slice(0, 4).map((issue) => {
        if (!issue || typeof issue !== "object") {
          return "unknown:invalid";
        }
        const record = issue as {
          path?: unknown[];
          code?: string;
          expected?: unknown;
        };
        const path =
          Array.isArray(record.path) && record.path.length > 0
            ? record.path.map(String).join(".")
            : "(root)";
        const code =
          typeof record.code === "string" ? record.code : "invalid";
        const expected =
          record.expected !== undefined
            ? ` expected=${String(record.expected)}`
            : "";
        return `${path}:${code}${expected}`;
      });
      return sanitizeExecutionErrorCategory(`ZodError ${parts.join("; ")}`);
    }
  }

  const code = readErrorString(error, "code");
  if (code && !isGenericErrorIdentifier(code)) {
    return sanitizeExecutionErrorCategory(code);
  }

  const name = readErrorString(error, "name");
  if (name && !isGenericErrorIdentifier(name)) {
    return sanitizeExecutionErrorCategory(name);
  }

  const message = readErrorString(error, "message");
  if (message) {
    return sanitizeExecutionErrorCategory(message);
  }

  return "unknown";
}
