import { DeviceEventEmitter } from "react-native";

export const NOTIFICATION_UNREAD_CHANGED_EVENT =
  "buildsigma.notificationUnreadChanged";

/** Signal HomeHeader (and listeners) to refresh unread badge. */
export function emitNotificationUnreadChanged(): void {
  DeviceEventEmitter.emit(NOTIFICATION_UNREAD_CHANGED_EVENT);
}
