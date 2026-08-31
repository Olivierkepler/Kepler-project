/**
 * Cloud-direct shared field Evidence photo upload (Phase 2I.2).
 * Does not touch AsyncStorage or owner sync queues.
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  createRemoteEvidence,
  requestEvidenceUploadUrl,
  type RemoteEvidence,
} from "../api/evidence";

function contentTypeFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

export type UploadSharedEvidencePhotoInput = {
  remoteProjectId: string;
  localEvidenceId: string;
  localMeasurementId: string;
  photoUri: string;
  note?: string;
  createdAt?: string;
};

/**
 * Request scoped upload URL → PUT bytes → commit Evidence metadata.
 * Requires Measurement-linked localMeasurementId (Phase 2I.1).
 */
export async function uploadSharedEvidencePhoto(
  input: UploadSharedEvidencePhotoInput,
): Promise<RemoteEvidence> {
  const remoteProjectId = input.remoteProjectId.trim();
  const localEvidenceId = input.localEvidenceId.trim();
  const localMeasurementId = input.localMeasurementId.trim();
  const photoUri = input.photoUri.trim();

  if (
    !remoteProjectId ||
    !localEvidenceId ||
    !localMeasurementId ||
    !photoUri
  ) {
    throw new Error("Invalid evidence upload payload.");
  }

  const contentType = contentTypeFromUri(photoUri);
  const signed = await requestEvidenceUploadUrl(remoteProjectId, {
    localEvidenceId,
    contentType,
    localMeasurementId,
  });

  const uploadResult = await FileSystem.uploadAsync(signed.uploadUrl, photoUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": signed.contentType,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error("Photo upload failed. Please try again.");
  }

  return createRemoteEvidence(remoteProjectId, {
    localEvidenceId,
    type: "photo",
    note: input.note?.trim() ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    objectPath: signed.objectPath,
    contentType: signed.contentType,
    localMeasurementId,
    localDeltaId: null,
  });
}
