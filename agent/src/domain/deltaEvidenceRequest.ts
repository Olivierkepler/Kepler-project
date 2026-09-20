/**
 * Deterministic Delta Evidence request identity (Phase A4).
 * One active Delta Evidence request per Field Variance AgentRun.
 */

export function buildDeltaEvidenceRequestId(agentRunId: string): string {
  const trimmed = agentRunId.trim();
  if (!trimmed) {
    throw new Error("agentRunId is required for Delta Evidence requestId");
  }
  return `delta-evidence:${trimmed}`;
}

export const DEFAULT_DELTA_EVIDENCE_REQUEST_MESSAGE =
  "Add a field photo or note documenting this difference." as const;

/** Post-analysis request_evidence when some Evidence already exists. */
export const ADDITIONAL_DELTA_EVIDENCE_REQUEST_MESSAGE =
  "Capture another clear photo showing the affected work." as const;

export const MAX_DELTA_EVIDENCE_REQUEST_MESSAGE_LENGTH = 280;

const UNSAFE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /```/,
  /<\/?[a-z][^>]*>/i,
  /\bignore (all |any )?(previous|prior) instructions\b/i,
  /\bsystem prompt\b/i,
  /\btool call\b/i,
  /\bfunction call\b/i,
  /\baccepted\b/i,
  /\brejected\b/i,
  /\bresolved\b/i,
  /\bcontract(ual)?\b/i,
  /\bliabilit(y|ies)\b/i,
  /\bsafety approv/i,
  /\bchange (the )?(delta|measurement|disposition)\b/i,
];

/**
 * Normalizes Gemini-suggested Evidence request wording through server rules.
 * Falls back to a deterministic safe message when empty/unsafe/too long.
 */
export function normalizeDeltaEvidenceRequestMessage(
  raw: unknown,
): string {
  if (typeof raw !== "string") {
    return DEFAULT_DELTA_EVIDENCE_REQUEST_MESSAGE;
  }

  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) {
    return DEFAULT_DELTA_EVIDENCE_REQUEST_MESSAGE;
  }

  if (trimmed.length > MAX_DELTA_EVIDENCE_REQUEST_MESSAGE_LENGTH) {
    return DEFAULT_DELTA_EVIDENCE_REQUEST_MESSAGE;
  }

  for (const pattern of UNSAFE_MESSAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return DEFAULT_DELTA_EVIDENCE_REQUEST_MESSAGE;
    }
  }

  return trimmed;
}
