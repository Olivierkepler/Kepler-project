/**
 * ADK model run event handling tests.
 *
 * Run: npm run test:adk-model-run
 */

import {
  applyAdkModelEvent,
  finalizeAdkModelRun,
  readAdkModelFailure,
} from "../agent/adkModelRun.js";
import { categorizeExecutionError } from "../logging/agentExecutionLogging.js";

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

const providerFailure = {
  errorCode: "403",
  errorMessage:
    "Agent Platform API has not been used in project buildsigma-olivier-2026 before or it is disabled.",
};

assert(
  readAdkModelFailure(providerFailure)?.includes("Agent Platform API") === true,
  "readAdkModelFailure surfaces provider errorMessage",
);

let threwProviderFailure = false;
try {
  applyAdkModelEvent({}, providerFailure);
} catch (error) {
  threwProviderFailure = true;
  assert(
    categorizeExecutionError(error).includes("Agent Platform API"),
    "provider failure propagates to categorizeExecutionError",
  );
}
assert(threwProviderFailure, "applyAdkModelEvent throws on provider failure event");

let threwEmpty = false;
try {
  finalizeAdkModelRun({});
} catch (error) {
  threwEmpty = true;
  assert(
    categorizeExecutionError(error) === "empty_model_output",
    "empty accumulator still resolves to empty_model_output",
  );
}
assert(threwEmpty, "finalizeAdkModelRun throws when no output accumulated");

const resolved = finalizeAdkModelRun({
  lastText: '{"recommendedAction":"request_evidence"}',
});
assert(
  resolved.text?.includes("request_evidence") === true,
  "finalizeAdkModelRun returns accumulated text",
);

console.log(`\nadkModelRunTest: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
