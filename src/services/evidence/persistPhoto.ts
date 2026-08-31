import { Directory, File, Paths } from "expo-file-system";

function extensionFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();

  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "heic" || ext === "webp") {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return "jpg";
}

/**
 * Copies a picker/camera image into app document storage under a UID namespace.
 * Returns the persistent file URI. Does not write AsyncStorage.
 */
export async function persistEvidencePhoto(
  ownerUid: string,
  evidenceId: string,
  sourceUri: string,
): Promise<string> {
  if (!ownerUid.trim() || !evidenceId.trim() || !sourceUri.trim()) {
    throw new Error("Unable to persist photo evidence.");
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

  const extension = extensionFromUri(sourceUri);
  const destination = new File(
    directory,
    `evidence-${evidenceId}.${extension}`,
  );
  const source = new File(sourceUri);

  if (!source.exists) {
    throw new Error("Selected photo is no longer available.");
  }

  source.copy(destination);

  if (!destination.exists) {
    throw new Error("Unable to persist photo evidence.");
  }

  return destination.uri;
}
