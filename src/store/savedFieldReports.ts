import type { SavedFieldReport } from "../types/savedFieldReport";
import type { FieldReport } from "../utils/domain/fieldReport";
import {
  buildSavedFieldReport,
  normalizeSavedFieldReport,
  sortSavedFieldReportsNewestFirst,
} from "../utils/domain/savedFieldReport";
import { readJsonArray, STORAGE_KEYS, writeJsonArray } from "./storage";

function scopedSavedFieldReportsKey(ownerUid: string): string {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for saved field reports.");
  }

  return `${STORAGE_KEYS.savedFieldReports}/${ownerUid}`;
}

function copySavedFieldReport(item: SavedFieldReport): SavedFieldReport {
  return {
    ...item,
    snapshot: {
      ...item.snapshot,
      activity: { ...item.snapshot.activity },
      measurements: item.snapshot.measurements.map((row) => ({ ...row })),
      deltasDocumented: item.snapshot.deltasDocumented.map((row) => ({ ...row })),
      openFieldDifferences: item.snapshot.openFieldDifferences.map((row) => ({
        ...row,
      })),
      documentedImpact: { ...item.snapshot.documentedImpact },
      evidence: item.snapshot.evidence.map((row) => ({ ...row })),
      currentDisposition: { ...item.snapshot.currentDisposition },
    },
  };
}

async function loadSavedFieldReports(ownerUid: string): Promise<SavedFieldReport[]> {
  const items = await readJsonArray<unknown>(scopedSavedFieldReportsKey(ownerUid));

  return items
    .map(normalizeSavedFieldReport)
    .filter((item): item is SavedFieldReport => item !== null)
    .map(copySavedFieldReport);
}

export async function getSavedFieldReportsForProject(
  ownerUid: string,
  projectId: string,
): Promise<SavedFieldReport[]> {
  const items = await loadSavedFieldReports(ownerUid);

  return sortSavedFieldReportsNewestFirst(
    items.filter((item) => item.projectId === projectId),
  );
}

export async function getSavedFieldReportById(
  ownerUid: string,
  projectId: string,
  savedReportId: string,
): Promise<SavedFieldReport | undefined> {
  const items = await loadSavedFieldReports(ownerUid);
  const found = items.find(
    (item) => item.id === savedReportId && item.projectId === projectId,
  );

  return found ? copySavedFieldReport(found) : undefined;
}

export async function addSavedFieldReport(
  ownerUid: string,
  snapshot: FieldReport,
): Promise<SavedFieldReport> {
  if (!ownerUid.trim()) {
    throw new Error("Invalid ownerUid for saved field report.");
  }

  if (!snapshot.projectId.trim()) {
    throw new Error("Invalid saved field report snapshot.");
  }

  const record = buildSavedFieldReport({ snapshot });
  const items = await loadSavedFieldReports(ownerUid);

  if (items.some((item) => item.id === record.id)) {
    throw new Error("Unable to save field report.");
  }

  await writeJsonArray(scopedSavedFieldReportsKey(ownerUid), [...items, record]);
  return copySavedFieldReport(record);
}

export async function deleteSavedFieldReport(
  ownerUid: string,
  projectId: string,
  savedReportId: string,
): Promise<boolean> {
  if (!ownerUid.trim() || !projectId.trim() || !savedReportId.trim()) {
    throw new Error("Invalid saved field report delete.");
  }

  const items = await loadSavedFieldReports(ownerUid);
  const next = items.filter(
    (item) => !(item.id === savedReportId && item.projectId === projectId),
  );

  if (next.length === items.length) {
    return false;
  }

  await writeJsonArray(scopedSavedFieldReportsKey(ownerUid), next);
  return true;
}
