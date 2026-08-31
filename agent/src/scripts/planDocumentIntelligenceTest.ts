/**
 * Agent-side Phase 2P.3 extraction parse tests (mocked model output).
 * Run: npx tsx src/scripts/planDocumentIntelligenceTest.ts
 */

import {
  buildPersistedCandidates,
  parsePlanImportExtractionFromModel,
} from "../domain/planImportExtraction.js";
import { createStubPlanDocumentIntelligenceRunner } from "../agent/planDocumentIntelligenceAgent.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  console.log("Phase 2P.3 agent extraction parse tests\n");

  const allowed = new Set(["file-1"]);

  try {
    parsePlanImportExtractionFromModel(
      { candidates: [{ label: "X", type: "count", sourceFileId: "other", confidence: 0.9 }] },
      allowed,
    );
    throw new Error("expected unknown source rejection");
  } catch (error) {
    assert(
      error instanceof Error && error.message === "unknown_source_file_id",
      "unknown sourceFileId rejected",
    );
  }
  console.log("PASS unknown sourceFileId rejected");

  try {
    parsePlanImportExtractionFromModel({ notCandidates: [] }, allowed);
    throw new Error("expected malformed rejection");
  } catch (error) {
    assert(
      error instanceof Error && error.message === "malformed_extraction_result",
      "malformed rejected",
    );
  }
  console.log("PASS malformed model output rejected");

  const ok = parsePlanImportExtractionFromModel(
    {
      candidates: [
        {
          label: "Panels",
          type: "count",
          plannedValue: 2,
          unit: "EA",
          sourceFileId: "file-1",
          sourcePage: 1,
          confidence: 0.88,
        },
      ],
    },
    allowed,
  );
  assert(ok.candidates.length === 1, "one candidate");
  const persisted = buildPersistedCandidates({
    importId: "import-1",
    projectId: "project-1",
    extraction: ok,
  });
  assert(persisted[0]!.sourceFileId === "file-1", "provenance kept");
  console.log("PASS valid output persisted");

  const zero = parsePlanImportExtractionFromModel({ candidates: [] }, allowed);
  assert(zero.candidates.length === 0, "zero ok");
  console.log("PASS zero-candidate result succeeds");

  const stub = createStubPlanDocumentIntelligenceRunner({
    candidates: [],
    warnings: [],
  });
  const stubResult = await stub({
    importId: "import-1",
    projectId: "project-1",
    model: "gemini-3.5-flash",
    documents: [],
  });
  assert(stubResult.candidates.length === 0, "stub runner works");
  console.log("PASS stub runner");

  console.log("\nPhase 2P.3 agent extraction tests complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
