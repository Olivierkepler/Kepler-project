export function extensionForContentTypeHint(
  contentType: string | null,
  objectPath: string | null,
): string {
  const normalized = contentType?.toLowerCase() ?? "";

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/heic") {
    return "heic";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "jpg";
  }

  if (objectPath) {
    const match = objectPath.match(/\.([a-zA-Z0-9]+)$/);
    const ext = match?.[1]?.toLowerCase();

    if (
      ext === "png" ||
      ext === "jpg" ||
      ext === "jpeg" ||
      ext === "heic" ||
      ext === "webp"
    ) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }

  return "jpg";
}
