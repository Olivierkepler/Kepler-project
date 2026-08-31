export type PushDevicePlatform = "ios" | "android";

export type RemotePushDevice = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: PushDevicePlatform;
  deviceName: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  disabledAt: string | null;
};
