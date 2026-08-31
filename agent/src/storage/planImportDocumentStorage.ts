import { getStorage } from "firebase-admin/storage";

import "../config/firebase.js";

const DEFAULT_BUCKET = "buildsigma-olivier-2026-evidence";

export const PLAN_IMPORT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const DEFAULT_MAX_PLAN_IMPORT_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function getEvidenceBucketName(): string {
  const fromEnv = process.env.EVIDENCE_STORAGE_BUCKET?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BUCKET;
}

export function getMaxPlanImportDocumentBytes(): number {
  const raw = process.env.MAX_PLAN_IMPORT_DOCUMENT_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_PLAN_IMPORT_DOCUMENT_BYTES;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PLAN_IMPORT_DOCUMENT_BYTES;
  }
  return Math.floor(parsed);
}

export type PlanImportDocumentBytes = {
  fileId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Buffer;
};

export type LoadPlanImportDocumentResult =
  | { ok: true; document: PlanImportDocumentBytes }
  | {
      ok: false;
      error:
        | "missing_object"
        | "unsupported_media"
        | "too_large"
        | "download_failed";
    };

/**
 * Downloads a private Plan Import object in-process via ADC.
 * storagePath MUST come from trusted PlanImport metadata — never model output.
 */
export async function loadPlanImportDocumentBytes(args: {
  fileId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
}): Promise<LoadPlanImportDocumentResult> {
  const mimeType = args.mimeType.trim().toLowerCase();
  if (!PLAN_IMPORT_ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: "unsupported_media" };
  }

  const storagePath = args.storagePath.trim();
  if (!storagePath) {
    return { ok: false, error: "missing_object" };
  }

  try {
    const bucket = getStorage().bucket(getEvidenceBucketName());
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return { ok: false, error: "missing_object" };
    }

    const [metadata] = await file.getMetadata();
    const sizeRaw = metadata.size;
    const declaredSize =
      typeof sizeRaw === "string"
        ? Number(sizeRaw)
        : typeof sizeRaw === "number"
          ? sizeRaw
          : NaN;

    const maxBytes = getMaxPlanImportDocumentBytes();
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      return { ok: false, error: "too_large" };
    }

    const [bytes] = await file.download({ validation: false });

    if (bytes.byteLength > maxBytes) {
      return { ok: false, error: "too_large" };
    }

    return {
      ok: true,
      document: {
        fileId: args.fileId,
        fileName: args.fileName,
        mimeType,
        byteSize: bytes.byteLength,
        bytes,
      },
    };
  } catch {
    return { ok: false, error: "download_failed" };
  }
}
