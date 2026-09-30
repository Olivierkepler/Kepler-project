import type { PlanItem } from "../../types/plan";

export type PlanItemImageDisplaySource = {
  uri: string;
  source: "local" | "remote";
};

export function applyPlanItemImageUriUpdate(
  item: PlanItem,
  imageUri: string | null,
): PlanItem {
  return { ...item, imageUri };
}

export function getPlanItemImageDisplaySource(
  item: Pick<PlanItem, "imageUri" | "imageUrl">,
  failedUris?: string | null | readonly string[],
): PlanItemImageDisplaySource | null {
  const failed = new Set(
    Array.isArray(failedUris)
      ? failedUris
      : failedUris
        ? [failedUris]
        : [],
  );
  const localUri = item.imageUri?.trim();
  if (localUri && !failed.has(localUri)) {
    return { uri: localUri, source: "local" };
  }
  const imageUrl = item.imageUrl?.trim();
  if (imageUrl && !failed.has(imageUrl)) {
    return { uri: imageUrl, source: "remote" };
  }
  return null;
}
