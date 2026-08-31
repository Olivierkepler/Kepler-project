/**
 * FieldVarianceAssessment parse/normalize regression tests.
 *
 * Run: npm run test:assessment
 */

import { ZodError } from "zod";
import {
  formatZodIssueDiagnostics,
  normalizeFieldVarianceAssessmentInput,
  parseFieldVarianceAssessment,
} from "../domain/assessment.js";
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

const valid = {
  summary: "Measured length differs from plan.",
  evidenceAssessment: "No direct Delta Evidence found.",
  recommendedAction: "request_evidence",
  userVisibleRationale: "Add a field photo documenting this difference.",
};

assert(
  parseFieldVarianceAssessment(valid).recommendedAction === "request_evidence",
  "exact schema accepted",
);

assert(
  parseFieldVarianceAssessment({
    varianceSummary: valid.summary,
    documentationSummary: valid.evidenceAssessment,
    action: "Request Evidence",
    rationale: valid.userVisibleRationale,
  }).recommendedAction === "request_evidence",
  "alias + formatting normalization accepted",
);

assert(
  parseFieldVarianceAssessment({
    assessment: {
      summary: valid.summary,
      evidenceAssessment: {
        text: valid.evidenceAssessment,
      },
      recommendedAction: "request_evidence",
      userVisibleRationale: valid.userVisibleRationale,
    },
  }).evidenceAssessment === valid.evidenceAssessment,
  "wrapper + object evidenceAssessment unwrap accepted",
);

{
  let threw = false;
  try {
    parseFieldVarianceAssessment({ summary: "only summary" });
  } catch (error) {
    threw = true;
    const category = categorizeExecutionError(error);
    assert(category.startsWith("ZodError "), "ZodError category includes prefix");
    assert(
      category.includes("recommendedAction") ||
        category.includes("evidenceAssessment") ||
        category.includes("userVisibleRationale"),
      "ZodError category includes failing field path",
    );
    assert(!category.includes("only summary"), "rejected values not logged");
  }
  assert(threw, "incomplete payload rejected");
}

{
  let threw = false;
  try {
    parseFieldVarianceAssessment({
      ...valid,
      recommendedAction: "resolve_delta",
    });
  } catch (error) {
    threw = true;
    const category = categorizeExecutionError(error);
    assert(
      category.includes("recommendedAction"),
      "unsupported recommendedAction surfaces field path",
    );
    assert(!category.includes("resolve_delta"), "rejected enum value not logged");
  }
  assert(threw, "unsupported recommendedAction rejected");
}

{
  const normalized = normalizeFieldVarianceAssessmentInput({
    summary: "  spaced  ",
    evidenceAssessment: { description: " nested prose " },
    recommendedAction: "prepare-summary",
    userVisibleRationale: "ok",
  }) as Record<string, unknown>;

  assert(normalized.summary === "spaced", "summary trim");
  assert(
    normalized.evidenceAssessment === "nested prose",
    "object evidenceAssessment flattened",
  );
  assert(
    normalized.recommendedAction === "prepare_summary",
    "hyphenated action normalized",
  );
}

{
  try {
    parseFieldVarianceAssessment({
      summary: 12,
      evidenceAssessment: valid.evidenceAssessment,
      recommendedAction: "request_evidence",
      userVisibleRationale: valid.userVisibleRationale,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      // ensure format helper never includes raw values
      const issues =
        (error as Error & { issues?: ZodError["issues"] }).issues ??
        new ZodError([]).issues;
      if (issues.length > 0) {
        const diag = formatZodIssueDiagnostics(
          Object.assign(new ZodError(issues), { issues }),
        );
        assert(!diag.includes("12"), "diagnostic omits rejected value");
        assert(diag.includes("summary"), "diagnostic includes path");
      }
    }
  }
}

assert(
  (() => {
    try {
      parseFieldVarianceAssessment({
        ...valid,
        extraSecretField: "should-not-be-required-to-fail",
      });
      return true;
    } catch {
      return false;
    }
  })(),
  "unknown extra keys ignored by Zod object (not strict)",
);

console.log(`\nfieldVarianceAssessmentTest: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
