import type { RemoteNotification } from "../../types/notification";
import { isKnownActivityEventType } from "../../services/api/activity";

type NotificationIconName =
  | "newspaper-outline"
  | "chatbubble-outline"
  | "briefcase-outline"
  | "checkmark-done-outline"
  | "git-compare-outline"
  | "warning-outline"
  | "sparkles-outline"
  | "people-outline"
  | "notifications-outline";

export function formatNotificationTitle(
  notification: RemoteNotification,
): string {
  if (notification.title?.trim()) {
    return notification.title.trim();
  }

  return formatNotificationTitleFromType(notification.type);
}

export function formatNotificationTitleFromType(type: string): string {
  switch (type) {
    case "project_update":
      return "New project update";
    case "feed_comment":
      return "New comment";
    case "assignment_created":
    case "assignment_accepted":
    case "assignment_started":
    case "assignment_sent_back":
    case "assignment_continued":
    case "assignment_completed":
    case "assignment_reopened":
    case "assignment_cancelled":
    case "assignment_ready_for_review":
      return "Work assignment update";
    case "measurement_submitted":
      return "Work ready for review";
    case "measurement_accepted":
      return "Your field submission was accepted";
    case "measurement_rejected":
      return "Your field submission was rejected";
    case "delta_created":
      return "Variance needs attention";
    case "agent_evidence_requested":
      return "BuildSigma needs additional evidence";
    case "agent_completed":
      return "BuildSigma finished an analysis";
    case "agent_escalated":
      return "BuildSigma needs your attention";
    case "invitation_accepted":
      return "A project invitation was accepted";
    case "member_removed":
      return "You were removed from a project";
    case "invitation_created":
      return "You have a project invitation";
    default:
      if (!isKnownActivityEventType(type)) {
        return "Notification";
      }
      return "Project update";
  }
}

export function formatNotificationBody(
  notification: RemoteNotification,
): string | null {
  if (notification.body?.trim()) {
    return notification.body.trim();
  }

  return formatNotificationTitleFromType(notification.type);
}

export function formatNotificationProjectLabel(
  notification: RemoteNotification,
): string | null {
  if (notification.projectName?.trim()) {
    return notification.projectName.trim();
  }

  return null;
}

export function notificationIconName(
  type: string,
): NotificationIconName {
  switch (type) {
    case "project_update":
      return "newspaper-outline";
    case "feed_comment":
      return "chatbubble-outline";
    case "assignment_created":
    case "assignment_accepted":
    case "assignment_started":
    case "assignment_sent_back":
    case "assignment_continued":
    case "assignment_completed":
    case "assignment_reopened":
    case "assignment_cancelled":
    case "assignment_ready_for_review":
      return "briefcase-outline";
    case "measurement_submitted":
    case "measurement_accepted":
    case "measurement_rejected":
      return "checkmark-done-outline";
    case "delta_created":
      return "git-compare-outline";
    case "agent_evidence_requested":
    case "agent_escalated":
      return "warning-outline";
    case "agent_completed":
      return "sparkles-outline";
    case "invitation_created":
    case "invitation_accepted":
    case "member_removed":
      return "people-outline";
    default:
      return "notifications-outline";
  }
}

export function notificationUsesAttentionIcon(type: string): boolean {
  return (
    type === "delta_created" ||
    type === "agent_escalated" ||
    type === "agent_evidence_requested" ||
    type === "measurement_submitted"
  );
}

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type NotificationDateGroup = "Today" | "Yesterday" | "Earlier";

export function notificationDateGroup(iso: string): NotificationDateGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Earlier";
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return "Yesterday";
  }

  return "Earlier";
}

export function formatUnreadBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  if (count > 99) {
    return "99+";
  }
  return String(Math.floor(count));
}

export function notificationAccessibilityLabel(
  item: RemoteNotification,
): string {
  const title = formatNotificationTitle(item);
  const body = formatNotificationBody(item);
  const unread = item.isRead ? "" : ", unread";
  return `${title}. ${body ?? ""}${unread}`;
}
