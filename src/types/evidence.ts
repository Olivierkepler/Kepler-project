export type EvidenceType = "photo" | "note";

/**
 * Local field evidence for a Project.
 * Optionally linked to one Measurement XOR one Delta (never both).
 * Ownership is storage-namespace scoped (not on the domain record).
 */
export type Evidence = {
  id: string;
  projectId: string;
  type: EvidenceType;
  note: string;
  photoUri: string | null;
  createdAt: string;
  measurementId: string | null;
  deltaId: string | null;
};
