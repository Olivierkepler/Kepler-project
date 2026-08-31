export type EvidenceType = "photo" | "note";

/**
 * Backend Evidence metadata.
 * Photo bytes live in private Cloud Storage at objectPath.
 * Relationship IDs are local Measurement/Delta IDs (nullable).
 *
 * - ownerUid: project storage tenancy (Project.ownerUid for new records)
 * - capturedByUid: Firebase UID of the human who submitted the record
 *   (Phase 2I.1). Optional on historical documents where ownerUid was
 *   overloaded as the uploader.
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
  /** Present on records created in Phase 2I.1+. */
  capturedByUid?: string;
};
