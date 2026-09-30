import { Directory, File, Paths } from "expo-file-system";

function extensionFromUri(uri: string): string {
  const cleanUri = uri.split(/[?#]/, 1)[0] ?? uri;
  const extension = cleanUri.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();

  if (["jpg", "jpeg", "png", "heic", "webp"].includes(extension ?? "")) {
    return extension === "jpeg" ? "jpg" : extension as string;
  }

  return "jpg";
}

/** Copies a selected project image into durable, owner/project-scoped storage. */
export async function persistProjectImage(
  ownerUid: string,
  projectId: string,
  sourceUri: string,
): Promise<string> {
  if (!ownerUid.trim() || !projectId.trim() || !sourceUri.trim()) {
    throw new Error("Unable to save the selected project image.");
  }

  const directory = new Directory(
    Paths.document,
    "buildsigma",
    "projects",
    encodeURIComponent(ownerUid),
    encodeURIComponent(projectId),
    "images",
  );

  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error("The selected project image is no longer available.");
  }

  const uniqueName = `project-image-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extensionFromUri(sourceUri)}`;
  const destination = new File(directory, uniqueName);

  await source.copy(destination);

  if (!destination.exists) {
    throw new Error("Unable to save the selected project image.");
  }

  const size = destination.info().size;
  if (typeof size === "number" && size <= 0) {
    destination.delete();
    throw new Error("The selected project image is empty or unreadable.");
  }

  return destination.uri;
}
