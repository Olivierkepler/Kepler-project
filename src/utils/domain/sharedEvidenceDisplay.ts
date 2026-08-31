import type { Evidence } from "../../types/evidence";

/**
 * Minimal remote evidence fields needed for shared Plan Item display mapping.
 * Mirrors the relationship keys returned by the authorized Evidence list API.
 */
export type SharedEvidenceRelationshipSource = {
  id: string;
  projectId: string;
  type: Evidence["type"];
  note: string;
  createdAt: string;
  localMeasurementId: string | null;
  localDeltaId: string | null;
};

/**
 * Maps authorized remote Evidence into the local Evidence display shape.
 * photoUri stays null (no offline photo cache on shared snapshots).
 *
 * Preserves API relationship keys:
 * - localMeasurementId → measurementId
 * - localDeltaId → deltaId
 *
 * Shared Plan Item correlation then matches those against
 * Measurement.localMeasurementId / Delta.localDeltaId (and primary ids).
 */
export function mapRemoteEvidenceToDisplayEvidence(
  remote: SharedEvidenceRelationshipSource,
): Evidence {
  return {
    id: remote.id,
    projectId: remote.projectId,
    type: remote.type,
    note: remote.note,
    photoUri: null,
    createdAt: remote.createdAt,
    measurementId: remote.localMeasurementId,
    deltaId: remote.localDeltaId,
  };
}
