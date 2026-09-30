import * as ImagePicker from "expo-image-picker";

import {
  commitUserAvatar,
  removeUserAvatar,
  requestUserAvatarUploadUrl,
} from "../api/userProfiles";
import { uploadLocalFileToSignedUrl } from "../storage/uploadLocalFileToSignedUrl";
import type { UserProfile } from "../../types/userProfile";

export const USER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const USER_AVATAR_NETWORK_TIMEOUT_MS = 30_000;

const AVATAR_UPLOAD_TIMEOUT_MESSAGE =
  "Profile photo upload timed out. Please try again.";
const AVATAR_REMOVE_TIMEOUT_MESSAGE =
  "Profile photo removal timed out. Please try again.";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export function normalizeAvatarContentType(
  mimeType: string | null | undefined,
): string | null {
  const trimmed = mimeType?.trim().toLowerCase() ?? "";

  if (trimmed === "image/jpg") {
    return "image/jpeg";
  }

  if (!trimmed || !ALLOWED_CONTENT_TYPES.has(trimmed)) {
    return null;
  }

  return trimmed;
}

function validateAvatarAsset(asset: ImagePicker.ImagePickerAsset): {
  contentType: string;
} {
  const contentType = normalizeAvatarContentType(asset.mimeType);

  if (!contentType) {
    throw new Error("Only JPEG, PNG, HEIC, and WebP photos are supported.");
  }

  if (
    typeof asset.fileSize === "number" &&
    asset.fileSize > USER_AVATAR_MAX_BYTES
  ) {
    throw new Error("Profile photo must be 5 MB or smaller.");
  }

  if (!asset.uri?.trim()) {
    throw new Error("The selected photo could not be loaded.");
  }

  return { contentType };
}

async function runAvatarNetworkOperation<T>(input: {
  operation: (signal: AbortSignal) => Promise<T>;
  timeoutMessage: string;
}): Promise<T> {
  const controller = new AbortController();
  const operationPromise = input.operation(controller.signal);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(input.timeoutMessage));
    }, USER_AVATAR_NETWORK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(input.timeoutMessage);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    void operationPromise.catch(() => undefined);
  }
}

export async function pickUserAvatarImage(): Promise<{
  localUri: string;
  contentType: string;
} | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Photo library access is required to choose a profile photo.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const { contentType } = validateAvatarAsset(asset);

  return {
    localUri: asset.uri,
    contentType,
  };
}

export async function uploadUserAvatarFromUri(input: {
  localUri: string;
  contentType: string;
}): Promise<UserProfile> {
  return runAvatarNetworkOperation({
    timeoutMessage: AVATAR_UPLOAD_TIMEOUT_MESSAGE,
    operation: async (signal) => {
      const signed = await requestUserAvatarUploadUrl({
        contentType: input.contentType,
        signal,
      });

      await uploadLocalFileToSignedUrl({
        uploadUrl: signed.uploadUrl,
        localUri: input.localUri,
        contentType: input.contentType,
      });

      return commitUserAvatar({
        objectPath: signed.objectPath,
        contentType: input.contentType,
        signal,
      });
    },
  });
}

export async function pickAndUploadUserAvatar(): Promise<UserProfile | null> {
  const picked = await pickUserAvatarImage();

  if (!picked) {
    return null;
  }

  return uploadUserAvatarFromUri(picked);
}

export async function removeOwnUserAvatar(): Promise<UserProfile> {
  return runAvatarNetworkOperation({
    timeoutMessage: AVATAR_REMOVE_TIMEOUT_MESSAGE,
    operation: (signal) => removeUserAvatar(signal),
  });
}
