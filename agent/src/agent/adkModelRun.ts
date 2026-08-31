import { isFinalResponse, stringifyContent } from "@google/adk";

export type AdkModelRunAccumulator = {
  lastText?: string;
  lastStructured?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads provider/model failure metadata emitted by ADK on Event/LlmResponse
 * objects. Returns a bounded diagnostic string safe for errorCategory logging.
 */
export function readAdkModelFailure(event: unknown): string | null {
  if (!isRecord(event)) {
    return null;
  }

  const code =
    typeof event.errorCode === "string" ? event.errorCode.trim() : "";
  const message =
    typeof event.errorMessage === "string" ? event.errorMessage.trim() : "";

  if (message) {
    return message.slice(0, 500);
  }

  if (code) {
    return code.slice(0, 80);
  }

  return null;
}

/**
 * Applies one ADK runAsync event to the accumulator.
 * Throws when ADK reports a model/provider failure on the event.
 */
export function applyAdkModelEvent(
  accumulator: AdkModelRunAccumulator,
  event: unknown,
): AdkModelRunAccumulator {
  const failure = readAdkModelFailure(event);
  if (failure) {
    throw new Error(failure);
  }

  const next: AdkModelRunAccumulator = { ...accumulator };

  if (isRecord(event) && isFinalResponse(event as never)) {
    const text = stringifyContent(event as never).trim();
    if (text) {
      next.lastText = text;
    }
  } else if (isRecord(event)) {
    const directText = typeof event.text === "string" ? event.text.trim() : "";
    if (directText) {
      next.lastText = directText;
    } else {
      const text = stringifyContent(event as never).trim();
      if (text) {
        next.lastText = text;
      }
    }
  }

  if (isRecord(event) && event.output !== undefined) {
    next.lastStructured = event.output;
  }

  return next;
}

/**
 * Resolves accumulated ADK output or throws empty_model_output when absent.
 */
export function finalizeAdkModelRun(
  accumulator: AdkModelRunAccumulator,
): { text?: string; structured?: unknown } {
  if (accumulator.lastStructured !== undefined) {
    return { structured: accumulator.lastStructured };
  }

  if (accumulator.lastText) {
    return { text: accumulator.lastText };
  }

  throw new Error("empty_model_output");
}
