import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";

export const PLAN_ITEM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export type PickedPlanItemImage = {
  uri: string;
  contentType: string;
};

export function normalizePlanItemImageContentType(
  mimeType: string | null | undefined,
): string | null {
  const value = mimeType?.trim().toLowerCase() ?? "";
  const normalized = value === "image/jpg" ? "image/jpeg" : value;
  return ALLOWED_CONTENT_TYPES.has(normalized) ? normalized : null;
}

export function planItemImageExtension(contentType: string): string {
  switch (normalizePlanItemImageContentType(contentType)) {
    case "image/png":
      return "png";
    case "image/heic":
      return "heic";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export async function pickPlanItemImage(): Promise<PickedPlanItemImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library access is required to choose an image.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const contentType = normalizePlanItemImageContentType(asset.mimeType);
  if (!contentType) {
    throw new Error("Choose a JPEG, PNG, HEIC, or WebP image.");
  }
  if (
    typeof asset.fileSize === "number" &&
    asset.fileSize > PLAN_ITEM_IMAGE_MAX_BYTES
  ) {
    throw new Error("Plan Item images must be 5 MB or smaller.");
  }
  if (!asset.uri?.trim()) {
    throw new Error("The selected image could not be loaded.");
  }

  return { uri: asset.uri, contentType };
}

function itemDirectory(ownerUid: string, projectId: string, planItemId: string) {
  if (!ownerUid.trim() || !projectId.trim() || !planItemId.trim()) {
    throw new Error("Plan Item image storage identity is incomplete.");
  }
  return new Directory(
    Paths.document,
    "buildsigma",
    "plan-items",
    encodeURIComponent(ownerUid),
    encodeURIComponent(projectId),
    encodeURIComponent(planItemId),
  );
}

function uniqueImageName(extension: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `image-${Date.now().toString(36)}-${randomPart}.${extension}`;
}

export async function persistPlanItemImage(
  ownerUid: string,
  projectId: string,
  planItemId: string,
  sourceUri: string,
  contentType: string,
): Promise<string> {
  const normalizedType = normalizePlanItemImageContentType(contentType);
  if (!sourceUri.trim() || !normalizedType) {
    throw new Error("Unable to save the selected Plan Item image.");
  }

  const directory = itemDirectory(ownerUid, projectId, planItemId);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error("The selected image is no longer available.");
  }
  const destination = new File(
    directory,
    uniqueImageName(planItemImageExtension(normalizedType)),
  );
  await source.copy(destination);
  if (!destination.exists) {
    throw new Error("Unable to save the selected Plan Item image.");
  }
  const fileSize = destination.info().size;
  if (typeof fileSize === "number" && fileSize > PLAN_ITEM_IMAGE_MAX_BYTES) {
    destination.delete();
    throw new Error("Plan Item images must be 5 MB or smaller.");
  }
  if (typeof fileSize === "number" && fileSize <= 0) {
    destination.delete();
    throw new Error("The selected image is empty or unreadable.");
  }
  return destination.uri;
}

export async function downloadPlanItemImage(
  ownerUid: string,
  projectId: string,
  planItemId: string,
  imageUrl: string,
): Promise<string> {
  if (!imageUrl.trim()) {
    throw new Error("Plan Item image URL is missing.");
  }
  const directory = itemDirectory(ownerUid, projectId, planItemId);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const urlPath = imageUrl.split("?")[0] ?? "";
  const urlExtension = urlPath.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const extension = ["jpg", "jpeg", "png", "heic", "webp"].includes(urlExtension ?? "")
    ? urlExtension === "jpeg" ? "jpg" : urlExtension as string
    : "jpg";
  const destination = new File(directory, uniqueImageName(extension));
  const downloaded = await File.downloadFileAsync(imageUrl, destination);
  if (!downloaded.exists && !destination.exists) {
    throw new Error("Unable to download the Plan Item image.");
  }
  return destination.uri;
}

/** Deletes only files inside this owner's app-managed Plan Item directory. */
export async function deletePlanItemImageFile(
  ownerUid: string,
  projectId: string,
  planItemId: string,
  imageUri: string | null | undefined,
): Promise<void> {
  if (!imageUri?.trim()) {
    return;
  }

  try {
    const allowedPrefix = `${itemDirectory(ownerUid, projectId, planItemId).uri.replace(/\/?$/, "/")}`.toLowerCase();
    const candidate = imageUri.trim();
    if (
      /^(ph:|assets-library:|content:|http:|https:)/i.test(candidate) ||
      !candidate.toLowerCase().startsWith(allowedPrefix)
    ) {
      return;
    }
    const file = new File(candidate);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Local image cleanup must not block a Plan Item edit.
  }
}
