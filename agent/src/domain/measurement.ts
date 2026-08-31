export type MeasurementType = "length" | "area" | "count" | "volume";

/**
 * Contribution review status (Phase 2J / 2L.1).
 * Absent on legacy documents → effective "accepted".
 */
export type MeasurementReviewStatus = "pending" | "accepted" | "rejected";

/**
 * Backend Measurement is ahead of the mobile Measurement type.
 *
 * - id: remote canonical Firestore document ID (tenant-safe)
 * - localMeasurementId: originating client/local ID
 * - projectId: remote Project ID
 * - planItemId: remote PlanItem ID
 * - reviewStatus / provenance: optional collaboration fields (Phase 2J+)
 *
 * Ownership is via projectId → Project.ownerUid.
 */
export type Measurement = {
  id: string;
  localMeasurementId: string;
  projectId: string;
  planItemId: string;
  type: MeasurementType;
  label: string;
  value: number;
  unit: string;
  createdAt: string;
  /** Present on records created in Phase 2I.1+. */
  capturedByUid?: string;
  /**
   * Contribution review status. Absent on legacy records → effective "accepted".
   */
  reviewStatus?: MeasurementReviewStatus;
  reviewedByUid?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** ProjectMember.id that authorized collaborator submission. */
  capturedByProjectMemberId?: string;
  /** WorkPackageAssignment.id that authorized collaborator submission. */
  submittedAssignmentId?: string;
  /** WorkPackage.id that authorized collaborator submission. */
  submittedWorkPackageId?: string;
};

/**
 * Effective contribution review status for agent trust.
 * Legacy documents missing reviewStatus are treated as accepted.
 */
export function effectiveMeasurementReviewStatus(
  measurement: Pick<Measurement, "reviewStatus">,
): MeasurementReviewStatus {
  return measurement.reviewStatus ?? "accepted";
}

/**
 * Authoritative field input for Field Variance reasoning.
 * pending / rejected are not treated as current field truth.
 */
export function isAuthoritativeFieldMeasurement(
  measurement: Pick<Measurement, "reviewStatus">,
): boolean {
  return effectiveMeasurementReviewStatus(measurement) === "accepted";
}
