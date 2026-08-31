/**
 * EvidenceAnalysis parse/compose regression tests.
 * Reproduces live Zod mismatch where model returned wrong types for
 * evidenceId / evidenceType — identity must come from trusted Evidence.
 *
 * Run: npm run test:evidence-analysis
 */

import {
  composeEvidenceAnalysisInput,
  normalizeEvidenceAnalysisModelInput,
  parseEvidenceAnalysis,
  parseEvidenceAnalysisFromModel,
} from "../domain/evidenceAnalysis.js";
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

const TRUSTED = {
  evidenceId: "ev-trusted-photo-001",
  evidenceType: "photo" as const,
};

const validModelAnalysis = {
  relevance: "relevant",
  description: "Photo shows field condition related to the documented variance.",
  supportsDocumentedVariance: true,
  needsAdditionalEvidence: false,
  suggestedFollowUp: null,
  userVisibleRationale: "Documentation appears sufficient for this difference.",
};

// --- Live mismatch: wrong-shaped identity from model ---
{
  const liveShaped = {
    evidenceId: { id: "model-invented-id" },
    evidenceType: ["photo"],
    ...validModelAnalysis,
  };

  const parsed = parseEvidenceAnalysisFromModel(liveShaped, TRUSTED);
  assert(
    parsed.evidenceId === TRUSTED.evidenceId,
    "live mismatch: trusted evidenceId survives wrong model type",
  );
  assert(
    parsed.evidenceType === TRUSTED.evidenceType,
    "live mismatch: trusted evidenceType survives wrong model type",
  );
  assert(parsed.relevance === "relevant", "live mismatch: model relevance preserved");
}

{
  const nullIdentity = {
    evidenceId: null,
    evidenceType: null,
    ...validModelAnalysis,
  };
  const parsed = parseEvidenceAnalysisFromModel(nullIdentity, TRUSTED);
  assert(
    parsed.evidenceId === TRUSTED.evidenceId,
    "null model evidenceId discarded for trusted id",
  );
  assert(
    parsed.evidenceType === "photo",
    "null model evidenceType discarded for trusted type",
  );
}

{
  const omittedIdentity = parseEvidenceAnalysisFromModel(
    validModelAnalysis,
    TRUSTED,
  );
  assert(
    omittedIdentity.evidenceId === TRUSTED.evidenceId,
    "omitted model identity: trusted evidenceId composed",
  );
  assert(
    omittedIdentity.evidenceType === "photo",
    "omitted model identity: trusted evidenceType composed",
  );
}

{
  const wrongId = parseEvidenceAnalysisFromModel(
    {
      ...validModelAnalysis,
      evidenceId: "attacker-other-evidence",
      evidenceType: "note",
    },
    TRUSTED,
  );
  assert(
    wrongId.evidenceId === TRUSTED.evidenceId,
    "model evidenceId never authoritative",
  );
  assert(
    wrongId.evidenceType === "photo",
    "model evidenceType never authoritative",
  );
}

// --- Valid model analysis ---
{
  const parsed = parseEvidenceAnalysisFromModel(validModelAnalysis, TRUSTED);
  assert(parsed.description === validModelAnalysis.description, "valid model analysis parses");
  assert(parsed.needsAdditionalEvidence === false, "boolean field preserved");
  assert(parsed.supportsDocumentedVariance === true, "nullable boolean preserved");
}

// --- Harmless enum formatting ---
{
  const parsed = parseEvidenceAnalysisFromModel(
    {
      ...validModelAnalysis,
      relevance: "Possibly Relevant",
    },
    TRUSTED,
  );
  assert(
    parsed.relevance === "possibly_relevant",
    "harmless relevance enum formatting normalized",
  );
}

{
  const parsed = parseEvidenceAnalysisFromModel(
    {
      analysis: {
        relevance: "not-relevant",
        description: validModelAnalysis.description,
        supportsDocumentedVariance: false,
        needsAdditionalEvidence: true,
        suggestedFollowUp: "Add a clearer photo.",
        userVisibleRationale: validModelAnalysis.userVisibleRationale,
      },
    },
    TRUSTED,
  );
  assert(parsed.relevance === "not_relevant", "wrapper unwrap + hyphen enum");
  assert(parsed.needsAdditionalEvidence === true, "wrapper fields preserved");
}

// --- Missing / malformed semantic fields still fail ---
{
  let threw = false;
  try {
    parseEvidenceAnalysisFromModel(
      {
        supportsDocumentedVariance: true,
        needsAdditionalEvidence: false,
        suggestedFollowUp: null,
        userVisibleRationale: "missing relevance and description",
      },
      TRUSTED,
    );
  } catch {
    threw = true;
  }
  assert(threw, "missing genuine semantic model fields still fail");
}

{
  let threw = false;
  let category = "";
  try {
    parseEvidenceAnalysisFromModel(
      {
        ...validModelAnalysis,
        relevance: "totally_invented",
      },
      TRUSTED,
    );
  } catch (error) {
    threw = true;
    category = categorizeExecutionError(error);
  }
  assert(threw, "malformed relevance enum still fails");
  assert(category.startsWith("ZodError "), "ZodError category prefix preserved");
  assert(category.includes("relevance"), "ZodError includes relevance path");
  assert(!category.includes("totally_invented"), "rejected values not in category");
}

{
  let threw = false;
  try {
    parseEvidenceAnalysisFromModel(
      {
        ...validModelAnalysis,
        needsAdditionalEvidence: "yes",
      },
      TRUSTED,
    );
  } catch {
    threw = true;
  }
  assert(threw, "malformed boolean semantic field still fails");
}

// --- Input objects not mutated ---
{
  const modelInput = {
    evidenceId: { nested: true },
    evidenceType: 42,
    ...validModelAnalysis,
  };
  const before = JSON.stringify(modelInput);
  parseEvidenceAnalysisFromModel(modelInput, TRUSTED);
  assert(
    JSON.stringify(modelInput) === before,
    "input objects are not mutated",
  );
}

{
  const trustedCopy = { ...TRUSTED };
  parseEvidenceAnalysisFromModel(validModelAnalysis, trustedCopy);
  assert(
    trustedCopy.evidenceId === TRUSTED.evidenceId &&
      trustedCopy.evidenceType === TRUSTED.evidenceType,
    "trusted identity object is not mutated",
  );
}

// --- Schema strictness: composed object still Zod-validated ---
{
  const composed = composeEvidenceAnalysisInput(
    {
      relevance: "relevant",
      // missing description + other required fields
    },
    TRUSTED,
  );
  let threw = false;
  try {
    parseEvidenceAnalysis(composed);
  } catch {
    threw = true;
  }
  assert(threw, "no broad schema weakening — incomplete composed payload fails");
}

{
  const normalized = normalizeEvidenceAnalysisModelInput({
    relevance: "Relevant",
    description: "  trimmed  ",
  });
  assert(
    typeof normalized === "object" &&
      normalized !== null &&
      (normalized as Record<string, unknown>).relevance === "relevant" &&
      (normalized as Record<string, unknown>).description === "trimmed",
    "normalize trims description and lowercases relevance",
  );
}

{
  const noteTrusted = {
    evidenceId: "ev-note-9",
    evidenceType: "note" as const,
  };
  const parsed = parseEvidenceAnalysisFromModel(validModelAnalysis, noteTrusted);
  assert(parsed.evidenceType === "note", "trusted note evidenceType survives");
  assert(parsed.evidenceId === "ev-note-9", "trusted note evidenceId survives");
}

console.log(`\nevidenceAnalysisTest: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
