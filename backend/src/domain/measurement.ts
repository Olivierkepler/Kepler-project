export type MeasurementType = "length" | "area" | "count" | "volume";

/**
 * Contribution review status for a Measurement (Phase 2J.1).
 * Independent of WorkPackageAssignment.status and Delta.status.
 */
export type MeasurementReviewStatus = "pending" | "accepted" | "rejected";

export const MEASUREMENT_REVIEW_STATUSES: readonly MeasurementReviewStatus[] = [
  "pending",
  "accepted",
  "rejected",
] as const;

/**
 * Backend Measurement is ahead of the mobile Measurement type.
 *
 * - id: remote canonical Firestore document ID (tenant-safe)
 * - localMeasurementId: originating client/local ID
 * - projectId: remote Project ID
 * - planItemId: remote PlanItem ID
 * - capturedByUid: Firebase UID of the human who submitted the record
 * - reviewStatus: contribution review (Phase 2J.1); absent on legacy → accepted
 * - submitted*: immutable collaborator authorization provenance (Phase 2J.1)
 *
 * Project ownership is via projectId → Project.ownerUid.
 * Do not confuse Project.ownerUid with capturedByUid.
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
 * Effective contribution review status.
 * Legacy documents missing reviewStatus are treated as accepted.
 */
export function effectiveMeasurementReviewStatus(
  measurement: Pick<Measurement, "reviewStatus">,
): MeasurementReviewStatus {
  return measurement.reviewStatus ?? "accepted";
}
