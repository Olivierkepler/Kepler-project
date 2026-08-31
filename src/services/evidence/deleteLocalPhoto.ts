import { Directory, File, Paths } from "expo-file-system";

/**
 * Deletes an app-owned evidence photo file only.
 * Never deletes arbitrary camera-roll / library URIs.
 */
export async function deleteAppOwnedEvidencePhoto(
  ownerUid: string,
  photoUri: string | null,
): Promise<void> {
  if (!ownerUid.trim() || !photoUri || !photoUri.trim()) {
    return;
  }

  const directory = new Directory(
    Paths.document,
    "buildsigma",
    "evidence",
    ownerUid,
  );
  const allowedPrefix = directory.uri.replace(/\/?$/, "/");

  let candidate = photoUri.trim();

  try {
    candidate = decodeURI(candidate);
  } catch {
    // Keep original candidate when decode fails.
  }

  const normalizedAllowed = allowedPrefix.toLowerCase();
  const normalizedCandidate = candidate.toLowerCase();

  if (
    !normalizedCandidate.startsWith(normalizedAllowed) &&
    !photoUri.trim().toLowerCase().startsWith(allowedPrefix.toLowerCase())
  ) {
    return;
  }

  // Reject non-file schemes that can appear from picker/camera sources.
  if (
    /^(ph:|assets-library:|content:|http:|https:)/i.test(photoUri.trim())
  ) {
    return;
  }

  try {
    const file = new File(photoUri);

    if (!file.exists) {
      return;
    }

    file.delete();
  } catch {
    // Best-effort local file cleanup; missing files are harmless.
  }
}
