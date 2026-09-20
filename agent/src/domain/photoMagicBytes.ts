/**
 * Minimal magic-byte checks for photo bytes before multimodal submit.
 * Not a full decoder — Gemini remains the authority for full decodability.
 */

export type PhotoMagicKind = "jpeg" | "png" | "webp" | null;

export function detectPhotoMagicKind(bytes: Buffer): PhotoMagicKind {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3) {
    return null;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export function mimeMatchesPhotoMagic(
  mimeType: string,
  kind: PhotoMagicKind,
): boolean {
  if (!kind) {
    return false;
  }

  const mime = mimeType.trim().toLowerCase();
  if (kind === "jpeg") {
    return mime === "image/jpeg" || mime === "image/jpg";
  }
  if (kind === "png") {
    return mime === "image/png";
  }
  if (kind === "webp") {
    return mime === "image/webp";
  }
  return false;
}
