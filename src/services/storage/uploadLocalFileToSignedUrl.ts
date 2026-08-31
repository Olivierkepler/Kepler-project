/**
 * Shared local-file → signed GCS PUT helper.
 *
 * Matches the established Evidence / Feed upload pattern:
 * expo-file-system/legacy uploadAsync with BINARY_CONTENT.
 *
 * Must use a static import — dynamic import("expo-file-system/legacy")
 * can throw "Could not load bundle" on physical iOS devices.
 */

import * as FileSystem from "expo-file-system/legacy";

export type UploadLocalFileToSignedUrlInput = {
  uploadUrl: string;
  localUri: string;
  contentType: string;
};

/**
 * PUT raw file bytes to a short-lived signed URL.
 * Does not attach Firebase Authorization.
 * Does not log the signed URL.
 */
export async function uploadLocalFileToSignedUrl(
  input: UploadLocalFileToSignedUrlInput,
): Promise<{ status: number }> {
  const uploadUrl = input.uploadUrl.trim();
  const localUri = input.localUri.trim();
  const contentType = input.contentType.trim();

  if (!uploadUrl) {
    throw new Error("Missing signed upload URL");
  }

  if (!localUri) {
    throw new Error("Missing local file URI");
  }

  if (!contentType) {
    throw new Error("Missing upload content type");
  }

  if (
    uploadUrl.startsWith("/") ||
    uploadUrl.startsWith("api/") ||
    (!uploadUrl.startsWith("https://") && !uploadUrl.startsWith("http://"))
  ) {
    throw new Error("Invalid signed upload URL");
  }

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`File upload failed (${uploadResult.status})`);
  }

  return { status: uploadResult.status };
}
