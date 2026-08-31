import type { MeasurementReviewStatus } from "../utils/measurementReview";

export type MeasurementType =
  | "length"
  | "area"
  | "count"
  | "volume";

export type Measurement = {
  id: string;

  projectId: string;

  planItemId: string;

  type: MeasurementType;

  label: string;

  value: number;

  unit: string;

  createdAt: string;

  /**
   * Cloud/shared display fields (Phase 2J.2).
   * Local-first owner AsyncStorage records do not require these.
   */
  localMeasurementId?: string;
  reviewStatus?: MeasurementReviewStatus;
  reviewNote?: string;
  reviewedAt?: string;
  capturedByUid?: string;
  capturedByProjectMemberId?: string;
  submittedAssignmentId?: string;
  submittedWorkPackageId?: string;
};
