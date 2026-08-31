import { colors } from "../theme/colors";
import type { WorkPackageAssignmentStatus } from "../types/workPackageAssignment";

/**
 * Human-readable assignment lifecycle labels (Phase 2K.2).
 */
export function formatAssignmentProgressStatusLabel(
  status: WorkPackageAssignmentStatus,
): string {
  switch (status) {
    case "assigned":
      return "Assigned";
    case "accepted":
      return "Accepted";
    case "in_progress":
      return "In progress";
    case "ready_for_review":
      return "Ready for review";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * Semantic status color from existing theme tokens.
 */
export function assignmentProgressStatusColor(
  status: WorkPackageAssignmentStatus,
): string {
  switch (status) {
    case "assigned":
      return colors.text.muted;
    case "accepted":
      return colors.brand.blue;
    case "in_progress":
      return colors.brand.cyan;
    case "ready_for_review":
      return colors.delta;
    case "completed":
      return colors.success;
    case "cancelled":
      return colors.text.muted;
    default:
      return colors.text.secondary;
  }
}

export type MemberProgressAction = {
  nextStatus: WorkPackageAssignmentStatus;
  label: string;
  /** When true, collect optional note before submit. */
  asksNote: boolean;
};

/**
 * Next collaborator self-service action for an assignment, if any.
 */
export function getMemberProgressAction(
  status: WorkPackageAssignmentStatus,
): MemberProgressAction | null {
  switch (status) {
    case "assigned":
      return {
        nextStatus: "accepted",
        label: "Accept assignment",
        asksNote: false,
      };
    case "accepted":
      return {
        nextStatus: "in_progress",
        label: "Start work",
        asksNote: false,
      };
    case "in_progress":
      return {
        nextStatus: "ready_for_review",
        label: "Mark ready for review",
        asksNote: true,
      };
    case "ready_for_review":
      return {
        nextStatus: "in_progress",
        label: "Continue work",
        asksNote: false,
      };
    default:
      return null;
  }
}

export type OwnerProgressActionKind = "complete" | "send_back" | "reopen";

export type OwnerProgressAction = {
  kind: OwnerProgressActionKind;
  nextStatus: WorkPackageAssignmentStatus;
  label: string;
  asksNote: boolean;
  requiresConfirm: boolean;
};

/**
 * Focused owner mobile actions (not every backend-allowed transition).
 */
export function getOwnerProgressActions(
  status: WorkPackageAssignmentStatus,
): OwnerProgressAction[] {
  switch (status) {
    case "ready_for_review":
      return [
        {
          kind: "send_back",
          nextStatus: "in_progress",
          label: "Send back",
          asksNote: true,
          requiresConfirm: false,
        },
        {
          kind: "complete",
          nextStatus: "completed",
          label: "Complete",
          asksNote: false,
          requiresConfirm: true,
        },
      ];
    case "completed":
      return [
        {
          kind: "reopen",
          nextStatus: "in_progress",
          label: "Reopen",
          asksNote: false,
          requiresConfirm: true,
        },
      ];
    default:
      return [];
  }
}

/** Deterministic cloud ProjectMember.id matching backend Phase 1F. */
export function createRemoteProjectMemberId(
  remoteProjectId: string,
  userId: string,
): string {
  return `${remoteProjectId.trim()}_${userId.trim()}`;
}
