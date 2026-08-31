import type { WorkPackageAssignmentStatus } from "../../types/workPackageAssignment";
import type { WorkPackageStatus } from "../../types/workPackage";
import type { MeasurementReviewStatus } from "../measurementReview";
import {
  effectiveMeasurementReviewStatus,
  measurementReviewStatusColor,
} from "../measurementReview";
import {
  assignmentProgressStatusColor,
  formatAssignmentProgressStatusLabel,
} from "../assignmentProgress";

/**
 * Presentation helpers that distinguish submission review from assignment review.
 * Domain enums are unchanged.
 */

function formatWorkPackageStatusCore(status: WorkPackageStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready":
      return "Ready";
    case "in_progress":
      return "In progress";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function formatSubmissionReviewStatusLabel(
  reviewStatus: MeasurementReviewStatus | undefined | null,
  options?: { prefixed?: boolean },
): string {
  const status = effectiveMeasurementReviewStatus(reviewStatus);
  const core =
    status === "pending"
      ? "Pending review"
      : status === "accepted"
        ? "Accepted"
        : "Rejected";
  if (options?.prefixed === false) {
    return core;
  }
  return `Submission · ${core}`;
}

export function formatAssignmentStatusPresentation(
  status: WorkPackageAssignmentStatus,
  options?: { prefixed?: boolean },
): string {
  const core = formatAssignmentProgressStatusLabel(status);
  if (options?.prefixed === false) {
    return core;
  }
  return `Assignment · ${core}`;
}

export function formatWorkPackageStatusPresentation(
  status: WorkPackageStatus,
  options?: { prefixed?: boolean },
): string {
  const core = formatWorkPackageStatusCore(status);
  if (options?.prefixed === false) {
    return core;
  }
  return `Work package · ${core}`;
}

export {
  measurementReviewStatusColor,
  assignmentProgressStatusColor,
};
