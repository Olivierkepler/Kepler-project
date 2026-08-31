export const EVIDENCE_RELEVANCE_VALUES = [
  "relevant",
  "possibly_relevant",
  "not_relevant",
  "insufficient_information",
  "unsupported_media",
] as const;

export type EvidenceRelevance = (typeof EVIDENCE_RELEVANCE_VALUES)[number];
