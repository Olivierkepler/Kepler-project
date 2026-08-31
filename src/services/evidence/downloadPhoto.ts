import { Directory, File, Paths } from "expo-file-system";

import { extensionForContentTypeHint } from "./contentType";

/**
 * Downloads a remote photo into the app-owned evidence directory.
 * Returns the persistent local file URI. Does not persist signed URLs.
 */
export async function downloadEvidencePhoto(
  ownerUid: string,
  localEvidenceId: string,
  readUrl: string,
  contentType: string | null,
  objectPath: string | null,
): Promise<string> {
  if (
    !ownerUid.trim() ||
    !localEvidenceId.trim() ||
    !readUrl.trim()
  ) {
    throw new Error("Unable to download photo evidence.");
  }

  const directory = new Directory(
    Paths.document,
    "buildsigma",
    "evidence",
    ownerUid,
  );

  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  const extension = extensionForContentTypeHint(contentType, objectPath);
  const destination = new File(
    directory,
    `evidence-${localEvidenceId}.${extension}`,
  );

  if (destination.exists) {
    return destination.uri;
  }

  const downloaded = await File.downloadFileAsync(readUrl, destination);

  if (!downloaded.exists && !destination.exists) {
    throw new Error("Unable to download photo evidence.");
  }

  return destination.uri;
}
