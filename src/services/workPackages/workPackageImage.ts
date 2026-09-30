import * as ImagePicker from "expo-image-picker";

import {
  commitRemoteWorkPackageImage,
  requestRemoteWorkPackageImageUpload,
  type RemoteWorkPackage,
} from "../api/workPackages";
import { uploadLocalFileToSignedUrl } from "../storage/uploadLocalFileToSignedUrl";

export const WORK_PACKAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export type PickedWorkPackageImage = {
  uri: string;
  contentType: string;
};

export function normalizeWorkPackageImageContentType(
  mimeType: string | null | undefined,
): string | null {
  const value = mimeType?.trim().toLowerCase() ?? "";
  const contentType = value === "image/jpg" ? "image/jpeg" : value;
  return ALLOWED_CONTENT_TYPES.has(contentType) ? contentType : null;
}

export async function pickWorkPackageImage(): Promise<PickedWorkPackageImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library access is required to choose an image.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const contentType = normalizeWorkPackageImageContentType(asset.mimeType);
  if (!contentType) throw new Error("Choose a JPEG, PNG, HEIC, or WebP image.");
  if (typeof asset.fileSize === "number" && asset.fileSize > WORK_PACKAGE_IMAGE_MAX_BYTES) {
    throw new Error("Work Package images must be 5 MB or smaller.");
  }
  if (!asset.uri?.trim()) throw new Error("The selected image could not be loaded.");
  return { uri: asset.uri, contentType };
}

/** Uploads picker bytes to private cloud storage; the picker URI is never persisted. */
export async function uploadWorkPackageImage(input: {
  remoteProjectId: string;
  remoteWorkPackageId: string;
  image: PickedWorkPackageImage;
}): Promise<RemoteWorkPackage> {
  const signed = await requestRemoteWorkPackageImageUpload({
    remoteProjectId: input.remoteProjectId,
    workPackageId: input.remoteWorkPackageId,
    contentType: input.image.contentType,
  });
  await uploadLocalFileToSignedUrl({
    uploadUrl: signed.uploadUrl,
    localUri: input.image.uri,
    contentType: signed.contentType,
  });
  return commitRemoteWorkPackageImage({
    remoteProjectId: input.remoteProjectId,
    workPackageId: input.remoteWorkPackageId,
    objectId: signed.objectId,
    contentType: signed.contentType,
  });
}
