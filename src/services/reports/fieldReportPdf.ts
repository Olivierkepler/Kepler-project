import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { FieldReport } from "../../utils/domain/fieldReport";
import { buildFieldReportPdfFilename } from "../../utils/reports/fieldReportFilename";
import {
  buildFieldReportHtml,
  type FieldReportImageSources,
} from "../../utils/reports/fieldReportHtml";

const EXPORT_CACHE_DIR = "buildsigma-field-report-exports";

export type ExportFieldReportPdfResult =
  | { ok: true; shared: true }
  | { ok: true; shared: false; reason: "sharing-unavailable" }
  | { ok: false; reason: "generate-failed" };

function extensionFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? uri;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  return ext ?? "jpg";
}

function mimeTypeFromExtension(extension: string): string {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

function isEmbeddableExtension(extension: string): boolean {
  return extension === "jpg" || extension === "jpeg" || extension === "png";
}

/**
 * Reads local Evidence photos sequentially and builds data URIs for HTML embedding.
 * HEIC and other non-embeddable formats map to null (placeholder in HTML).
 * Base64 strings remain in the returned map until the caller releases them.
 */
export async function prepareFieldReportImageSources(
  report: FieldReport,
): Promise<FieldReportImageSources> {
  const imageSources = new Map<string, string | null>();
  const uriCache = new Map<string, string | null>();

  for (const item of report.evidence) {
    if (item.type !== "photo") {
      continue;
    }

    if (imageSources.has(item.id)) {
      continue;
    }

    if (!item.photoUri || item.photoUri.trim().length === 0) {
      imageSources.set(item.id, null);
      continue;
    }

    const photoUri = item.photoUri.trim();

    if (uriCache.has(photoUri)) {
      imageSources.set(item.id, uriCache.get(photoUri) ?? null);
      continue;
    }

    const extension = extensionFromUri(photoUri);

    if (!isEmbeddableExtension(extension)) {
      uriCache.set(photoUri, null);
      imageSources.set(item.id, null);
      continue;
    }

    try {
      const file = new File(photoUri);

      if (!file.exists) {
        uriCache.set(photoUri, null);
        imageSources.set(item.id, null);
        continue;
      }

      const base64 = await file.base64();
      const dataUri = `data:${mimeTypeFromExtension(extension)};base64,${base64}`;
      uriCache.set(photoUri, dataUri);
      imageSources.set(item.id, dataUri);
    } catch {
      uriCache.set(photoUri, null);
      imageSources.set(item.id, null);
    }
  }

  return imageSources;
}

async function writeNamedCachePdf(
  tempPdfUri: string,
  filename: string,
): Promise<string> {
  const exportDirectory = new Directory(Paths.cache, EXPORT_CACHE_DIR);

  if (!exportDirectory.exists) {
    exportDirectory.create({ intermediates: true });
  }

  const destination = new File(exportDirectory, filename);

  if (destination.exists) {
    destination.delete();
  }

  const tempFile = new File(tempPdfUri);
  tempFile.copy(destination);

  return destination.uri;
}

export async function exportAndShareFieldReportPdf(
  report: FieldReport,
): Promise<ExportFieldReportPdfResult> {
  let imageSources: FieldReportImageSources | undefined;

  try {
    imageSources = await prepareFieldReportImageSources(report);
    const html = buildFieldReportHtml(report, imageSources);

    const { uri: tempPdfUri } = await Print.printToFileAsync({
      html,
      width: 612,
      height: 792,
    });

    const filename = buildFieldReportPdfFilename(report);
    const namedPdfUri = await writeNamedCachePdf(tempPdfUri, filename);

    const sharingAvailable = await Sharing.isAvailableAsync();

    if (!sharingAvailable) {
      return { ok: true, shared: false, reason: "sharing-unavailable" };
    }

    await Sharing.shareAsync(namedPdfUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });

    return { ok: true, shared: true };
  } catch {
    return { ok: false, reason: "generate-failed" };
  } finally {
    imageSources = undefined;
  }
}
