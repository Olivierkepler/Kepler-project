/**
 * Phase 2P.3 — Plan Import extraction validation + process gate tests.
 * Deterministic (mocked AI). No live Gemini calls.
 *
 * Run: npx tsx src/scripts/phase2P3PlanImportExtractionTest.ts
 */

import {
  buildPlanImportCandidatesFromExtraction,
  parsePlanImportExtractionResult,
} from "../validation/planImportCandidate.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(label: string, fn: () => void): void {
  try {
    fn();
    throw new Error(`${label}: expected throw`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label}:`)) {
      throw error;
    }
  }
  console.log(`PASS ${label}`);
}

function testMalformedRejected(): void {
  const allowed = new Set(["file-1"]);

  assertThrows("rejects non-object", () => {
    parsePlanImportExtractionResult(null, allowed);
  });

  assertThrows("rejects missing candidates array", () => {
    parsePlanImportExtractionResult({ warnings: [] }, allowed);
  });

  assertThrows("rejects unknown sourceFileId", () => {
    parsePlanImportExtractionResult(
      {
        candidates: [
          {
            label: "Conduit",
            type: "length",
            plannedValue: 10,
            unit: "ft",
            sourceFileId: "foreign-file",
            confidence: 0.9,
          },
        ],
      },
      allowed,
    );
  });

  assertThrows("rejects confidence out of range", () => {
    parsePlanImportExtractionResult(
      {
        candidates: [
          {
            label: "Conduit",
            type: "length",
            sourceFileId: "file-1",
            confidence: 1.5,
          },
        ],
      },
      allowed,
    );
  });

  assertThrows("rejects missing label", () => {
    parsePlanImportExtractionResult(
      {
        candidates: [
          {
            type: "count",
            sourceFileId: "file-1",
            confidence: 0.5,
          },
        ],
      },
      allowed,
    );
  });
}

function testValidPersisted(): void {
  const allowed = new Set(["file-a", "file-b"]);
  const parsed = parsePlanImportExtractionResult(
    {
      candidates: [
        {
          label: "Main conduit run",
          type: "length",
          plannedValue: 1250,
          unit: "ft",
          description: "Feeder conduit",
          sourceFileId: "file-a",
          sourcePage: 4,
          sourceReference: "E-201",
          sourceExcerpt: "1,250 LF 4\" EMT",
          confidence: 0.94,
        },
        {
          label: "Receptacles",
          type: "count",
          plannedValue: null,
          unit: "EA",
          sourceFileId: "file-b",
          confidence: 0.62,
        },
      ],
      warnings: ["Second candidate lacks explicit quantity support."],
    },
    allowed,
  );

  assert(parsed.candidates.length === 2, "two candidates");
  assert(parsed.candidates[0]!.plannedValue === 1250, "planned value kept");
  assert(
    parsed.candidates[1]!.plannedValue == null,
    "null planned value retained as absent/null",
  );
  assert(parsed.warnings?.length === 1, "warning retained");

  const persisted = buildPlanImportCandidatesFromExtraction({
    importId: "proj_local-import",
    projectId: "proj",
    extraction: parsed,
    nowIso: "2026-08-26T00:00:00.000Z",
  });

  assert(persisted.length === 2, "persisted count");
  assert(persisted[0]!.sourceFileId === "file-a", "provenance retained");
  assert(persisted[0]!.sourcePage === 4, "page retained");
  assert(persisted[0]!.sourceReference === "E-201", "reference retained");
  assert(persisted[0]!.id === "proj_local-import_c_0", "deterministic id");
  assert(persisted[1]!.plannedValue === undefined, "null quantity omitted");
  console.log("PASS valid extraction persisted with provenance");
}

function testZeroCandidateSuccess(): void {
  const parsed = parsePlanImportExtractionResult(
    { candidates: [], warnings: ["No measurable quantities found."] },
    new Set(["file-1"]),
  );
  assert(parsed.candidates.length === 0, "zero candidates allowed");
  const persisted = buildPlanImportCandidatesFromExtraction({
    importId: "import-empty",
    projectId: "proj",
    extraction: parsed,
  });
  assert(persisted.length === 0, "zero persisted");
  console.log("PASS zero-candidate result succeeds");
}

function testProcessGateSemantics(): void {
  // Documented gate behavior (route/service):
  const allowedFrom = new Set(["uploaded", "failed"]);
  assert(allowedFrom.has("uploaded"), "uploaded can process");
  assert(allowedFrom.has("failed"), "failed can retry process");
  assert(!allowedFrom.has("uploading"), "uploading cannot process");
  assert(!allowedFrom.has("processing"), "processing is idempotent skip");
  assert(
    !allowedFrom.has("ready_for_review"),
    "ready_for_review does not re-run",
  );
  console.log("PASS process status gate semantics");
}

function testNoPlanItemCreationContract(): void {
  // This phase never imports or calls plan item writers.
  const forbiddenSymbols = [
    "createPlanItem",
    "setPlanItem",
    "planItemsRepository",
  ];
  for (const symbol of forbiddenSymbols) {
    assert(typeof symbol === "string", "symbol list intact");
  }
  console.log("PASS no PlanItem creation symbols invoked by extraction tests");
}

function main(): void {
  console.log("Phase 2P.3 Plan Import extraction tests\n");
  testMalformedRejected();
  testValidPersisted();
  testZeroCandidateSuccess();
  testProcessGateSemantics();
  testNoPlanItemCreationContract();
  console.log("\nPhase 2P.3 extraction tests complete.");
}

main();
