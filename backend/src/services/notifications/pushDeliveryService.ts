import type { Notification } from "../../domain/notification.js";
import type { UserPushDevice } from "../../domain/pushDevice.js";
import {
  disablePushDeviceById,
  listActivePushDevicesForUser,
} from "../../repositories/pushDevicesRepository.js";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: {
    notificationId: string;
    type?: string;
  };
  sound: "default";
  priority: "high";
};

export type ExpoPushTicket =
  | { status: "ok"; id?: string }
  | {
      status: "error";
      message?: string;
      details?: { error?: string };
    };

export type ExpoPushSendResult = {
  attempted: number;
  tickets: ExpoPushTicket[];
  disabledDeviceIds: string[];
};

export type ExpoPushSender = (
  messages: ExpoPushMessage[],
) => Promise<ExpoPushTicket[]>;

const INVALID_TOKEN_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
]);

export function formatPushTitle(notification: Notification): string {
  if (notification.title?.trim()) {
    return notification.title.trim();
  }

  switch (notification.type) {
    case "project_update":
      return "New project update";
    case "feed_comment":
      return "New comment";
    case "assignment_created":
      return "Work assignment";
    case "assignment_ready_for_review":
      return "Work ready for review";
    case "assignment_sent_back":
      return "Assignment sent back";
    case "assignment_completed":
      return "Assignment completed";
    case "assignment_reopened":
      return "Assignment reopened";
    case "measurement_submitted":
      return "Field submission needs review";
    case "measurement_accepted":
      return "Field submission accepted";
    case "measurement_rejected":
      return "Field submission rejected";
    case "delta_created":
      return "Variance needs attention";
    case "agent_evidence_requested":
      return "Additional evidence needed";
    case "agent_completed":
      return "Analysis finished";
    case "agent_escalated":
      return "Attention needed";
    case "invitation_created":
      return "Project invitation";
    case "invitation_accepted":
      return "Invitation accepted";
    case "member_removed":
      return "Project membership update";
    case "feed_post_edited":
      return "Project update edited";
    case "feed_post_deleted":
      return "Project update removed";
    default:
      return "BuildSigma notification";
  }
}

export function formatPushBody(notification: Notification): string {
  if (notification.body?.trim()) {
    return notification.body.trim();
  }

  if (notification.projectName?.trim()) {
    return notification.projectName.trim();
  }

  return "Open BuildSigma to view details.";
}

export function buildExpoPushMessages(input: {
  notification: Notification;
  devices: readonly UserPushDevice[];
}): ExpoPushMessage[] {
  const title = formatPushTitle(input.notification);
  const body = formatPushBody(input.notification);

  return input.devices.map((device) => ({
    to: device.expoPushToken,
    title,
    body,
    data: {
      notificationId: input.notification.id,
      type: input.notification.type,
    },
    sound: "default" as const,
    priority: "high" as const,
  }));
}

export function chunkMessages(
  messages: readonly ExpoPushMessage[],
  size: number = EXPO_PUSH_BATCH_SIZE,
): ExpoPushMessage[][] {
  if (messages.length === 0) {
    return [];
  }

  const batches: ExpoPushMessage[][] = [];
  for (let index = 0; index < messages.length; index += size) {
    batches.push(messages.slice(index, index + size));
  }
  return batches;
}

export function isInvalidExpoTokenError(ticket: ExpoPushTicket): boolean {
  if (ticket.status !== "error") {
    return false;
  }

  const code = ticket.details?.error?.trim();
  return Boolean(code && INVALID_TOKEN_ERRORS.has(code));
}

export async function defaultExpoPushSender(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) {
    return [];
  }

  const response = await fetch(EXPO_PUSH_SEND_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo Push API HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: ExpoPushTicket[];
  };

  if (!Array.isArray(payload.data)) {
    throw new Error("Expo Push API returned unexpected payload");
  }

  return payload.data;
}

/**
 * Best-effort push delivery for one persisted notification.
 * Never throws to callers when wrapped via trySendPushForNotification.
 */
export async function sendPushForNotification(
  notification: Notification,
  deps: {
    listDevices?: typeof listActivePushDevicesForUser;
    send?: ExpoPushSender;
    disableDevice?: typeof disablePushDeviceById;
  } = {},
): Promise<ExpoPushSendResult> {
  const listDevices = deps.listDevices ?? listActivePushDevicesForUser;
  const send = deps.send ?? defaultExpoPushSender;
  const disableDevice = deps.disableDevice ?? disablePushDeviceById;

  const devices = await listDevices(notification.recipientUid);

  if (devices.length === 0) {
    return { attempted: 0, tickets: [], disabledDeviceIds: [] };
  }

  const messages = buildExpoPushMessages({ notification, devices });
  const batches = chunkMessages(messages);
  const tickets: ExpoPushTicket[] = [];
  const disabledDeviceIds: string[] = [];

  for (const batch of batches) {
    const batchTickets = await send(batch);
    tickets.push(...batchTickets);

    for (let index = 0; index < batchTickets.length; index += 1) {
      const ticket = batchTickets[index]!;
      const message = batch[index];
      if (!message || !isInvalidExpoTokenError(ticket)) {
        continue;
      }

      const device = devices.find(
        (entry) => entry.expoPushToken === message.to,
      );
      if (!device) {
        continue;
      }

      await disableDevice({ deviceId: device.id });
      disabledDeviceIds.push(device.id);
    }
  }

  return {
    attempted: messages.length,
    tickets,
    disabledDeviceIds,
  };
}

/**
 * Best-effort wrapper: logs and swallows push delivery failures.
 * Persisted notification remains authoritative regardless of outcome.
 */
export async function trySendPushForNotification(
  notification: Notification,
  deps?: Parameters<typeof sendPushForNotification>[1],
): Promise<ExpoPushSendResult | null> {
  try {
    return await sendPushForNotification(notification, deps);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "push_delivery_failed",
        notificationId: notification.id,
        recipientUid: notification.recipientUid,
        message:
          error instanceof Error ? error.message.slice(0, 160) : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
    return null;
  }
}
