export type EvidenceType = "photo" | "note";

/**
 * Backend Evidence metadata.
 * Photo bytes live in private Cloud Storage at objectPath.
 * Relationship IDs are local Measurement/Delta IDs (nullable).
 */
export type Evidence = {
  id: string;
  ownerUid: string;
  projectId: string;
  localEvidenceId: string;
  type: EvidenceType;
  note: string;
  objectPath: string | null;
  contentType: string | null;
  createdAt: string;
  localMeasurementId: string | null;
  localDeltaId: string | null;
};
