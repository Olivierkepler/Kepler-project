/**
 * categorizeExecutionError unit tests.
 *
 * Run: npm run test:logging
 */

import {
  categorizeExecutionError,
  isTransientProviderFailure,
} from "../logging/agentExecutionLogging.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }

  passed += 1;
  console.log(`PASS: ${message}`);
}

assert(
  categorizeExecutionError({ code: "PERMISSION_DENIED", name: "Error", message: "ignored" }) ===
    "PERMISSION_DENIED",
  "meaningful code wins",
);

assert(
  categorizeExecutionError(new Error("Vertex AI request failed: permission denied")) ===
    "Vertex AI request failed: permission denied",
  "generic Error name + useful message",
);

assert(
  categorizeExecutionError(
    Object.assign(new Error("ZodError summary:invalid_type expected=string"), {
      name: "ZodError",
    }),
  ).includes("summary:invalid_type"),
  "ZodError diagnostic message preferred over bare name",
);

assert(
  categorizeExecutionError({
    name: "FieldVarianceAssessmentError",
    message: "Assessment payload invalid",
  }) === "FieldVarianceAssessmentError",
  "non-generic custom error name",
);

assert(
  categorizeExecutionError({ message: "Missing required project context" }) ===
    "Missing required project context",
  "message-only object",
);

assert(categorizeExecutionError(null) === "unknown", "null input");
assert(categorizeExecutionError(undefined) === "unknown", "undefined input");
assert(categorizeExecutionError(42) === "unknown", "primitive number input");
assert(categorizeExecutionError("plain string") === "unknown", "primitive string input");

const longMessage = "x".repeat(120);
assert(
  categorizeExecutionError(new Error(longMessage)).length === 80,
  "long message truncation",
);

assert(
  categorizeExecutionError(new Error("first line\nsecond line\tcontrol\u0007here")) ===
    "first line second line control here",
  "newline/control-character sanitization",
);

const redacted = categorizeExecutionError(
  new Error("Request failed Bearer abc.def.ghi at https://example.com/path"),
);

assert(
  redacted.includes("Bearer [REDACTED]") &&
    !redacted.includes("abc.def.ghi") &&
    redacted.includes("[URL_REDACTED]") &&
    !redacted.includes("https://"),
  "obvious secret/token redaction",
);

assert(
  isTransientProviderFailure(
    new Error("Resource exhausted. Please try again later."),
  ),
  "RESOURCE_EXHAUSTED is transient",
);
assert(
  isTransientProviderFailure({ status: 429, message: "Too Many Requests" }),
  "429 is transient",
);
assert(
  !isTransientProviderFailure({ code: "PERMISSION_DENIED", message: "no" }),
  "PERMISSION_DENIED is not transient",
);
assert(
  !isTransientProviderFailure(new Error("unavailable")),
  "bare unavailable is not transient",
);
assert(!isTransientProviderFailure("unknown"), "unknown is not transient");

console.log(`\nagentExecutionLoggingTest: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
