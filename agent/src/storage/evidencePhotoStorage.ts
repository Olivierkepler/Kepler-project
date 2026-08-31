import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";
import type { Evidence } from "../domain/evidence.js";
import type { EvidencePhotoLoadError } from "../domain/evidenceAnalysis.js";

const DEFAULT_BUCKET = "buildsigma-olivier-2026-evidence";

/** Multimodal-compatible image types for Gemini (HEIC excluded — no conversion in A6). */
export const MULTIMODAL_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const DEFAULT_MAX_MULTIMODAL_IMAGE_BYTES = 8 * 1024 * 1024;

export function getEvidenceBucketName(): string {
  const fromEnv = process.env.EVIDENCE_STORAGE_BUCKET?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BUCKET;
}

export function getMaxMultimodalImageBytes(): number {
  const raw = process.env.MAX_MULTIMODAL_IMAGE_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_MULTIMODAL_IMAGE_BYTES;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_MULTIMODAL_IMAGE_BYTES;
  }
  return Math.floor(parsed);
}

export type EvidencePhotoBytes = {
  evidenceId: string;
  mimeType: string;
  byteSize: number;
  bytes: Buffer;
};

export type LoadEvidencePhotoResult =
  | { ok: true; photo: EvidencePhotoBytes }
  | { ok: false; error: EvidencePhotoLoadError };

/**
 * Downloads private Evidence photo bytes in-process.
 * objectPath MUST come from trusted persisted Evidence — never model input.
 */
export async function loadEvidencePhotoBytes(
  evidence: Evidence,
): Promise<LoadEvidencePhotoResult> {
  if (evidence.type !== "photo") {
    return { ok: false, error: "unsupported_media" };
  }

  const objectPath = evidence.objectPath?.trim();
  if (!objectPath) {
    return { ok: false, error: "missing_object" };
  }

  const declaredType = evidence.contentType?.trim().toLowerCase() ?? "";
  if (
    declaredType === "image/heic" ||
    declaredType === "image/heif" ||
    !MULTIMODAL_ALLOWED_MIME_TYPES.has(declaredType)
  ) {
    return { ok: false, error: "unsupported_media" };
  }

  try {
    const bucket = getStorage().bucket(getEvidenceBucketName());
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      return { ok: false, error: "missing_object" };
    }

    const [metadata] = await file.getMetadata();
    const remoteType =
      typeof metadata.contentType === "string"
        ? metadata.contentType.trim().toLowerCase()
        : "";

    if (
      remoteType &&
      remoteType !== declaredType &&
      !(
        (declaredType === "image/jpeg" && remoteType === "image/jpg") ||
        (declaredType === "image/jpg" && remoteType === "image/jpeg")
      )
    ) {
      return { ok: false, error: "mime_mismatch" };
    }

    const maxBytes = getMaxMultimodalImageBytes();
    const sizeRaw = metadata.size;
    const declaredSize =
      typeof sizeRaw === "string"
        ? Number(sizeRaw)
        : typeof sizeRaw === "number"
          ? sizeRaw
          : NaN;
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      return { ok: false, error: "too_large" };
    }

    const [bytes] = await file.download({ validation: false });
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      return { ok: false, error: "missing_object" };
    }
    if (bytes.length > maxBytes) {
      return { ok: false, error: "too_large" };
    }

    return {
      ok: true,
      photo: {
        evidenceId: evidence.id,
        mimeType: declaredType,
        byteSize: bytes.length,
        bytes,
      },
    };
  } catch {
    return { ok: false, error: "download_failed" };
  }
}
