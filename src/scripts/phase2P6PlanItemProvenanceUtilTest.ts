/**
 * Phase 2P.6 — pure provenance formatting util tests.
 * Run: npx tsx src/scripts/phase2P6PlanItemProvenanceUtilTest.ts
 */

import {
  formatProvenanceConfidence,
  formatProvenanceDate,
  formatProvenanceSourceLine,
  formatReviewAdjustment,
  provenanceValuesDiffer,
} from "../utils/planItemProvenance";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const original = {
  label: "Main conduit run",
  type: "length",
  plannedValue: 1250,
  unit: "ft",
};

const reviewedSame = { ...original };

const reviewedChanged = {
  ...original,
  plannedValue: 1205,
};

assert(!provenanceValuesDiffer(original, reviewedSame), "unchanged");
assert(provenanceValuesDiffer(original, reviewedChanged), "changed value");

assert(
  formatReviewAdjustment(original, reviewedSame) === null,
  "no adjustment when unchanged",
);

const adjustment = formatReviewAdjustment(original, reviewedChanged);
assert(
  typeof adjustment === "string" && adjustment.includes("45"),
  `adjustment shows delta, got ${adjustment}`,
);

assert(
  formatProvenanceConfidence(0.94).startsWith("High"),
  "high confidence band",
);
assert(
  formatProvenanceConfidence(0.7).startsWith("Medium"),
  "medium confidence band",
);
assert(
  formatProvenanceConfidence(0.4).startsWith("Low"),
  "low confidence band",
);

assert(
  formatProvenanceSourceLine({
    fileName: "Electrical-plan.pdf",
    page: 4,
    reference: "Drawing E-201",
  }) === "Electrical-plan.pdf · Drawing E-201 · Page 4",
  "source line formatting",
);

assert(
  formatProvenanceSourceLine({
    fileName: "Electrical-plan.pdf",
  }) === "Electrical-plan.pdf",
  "source line without page/reference",
);

assert(
  formatProvenanceDate("2026-08-26T15:00:00.000Z") != null,
  "date formats",
);
assert(formatProvenanceDate(null) === null, "null date");

console.log("PASS phase2P6PlanItemProvenanceUtilTest");
